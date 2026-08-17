import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const VALID_STATUSES = new Set(["online", "offline", "available", "busy"]);
const AVAILABLE_STATUSES = new Set(["online", "available"]);
const ALERT_SPAM_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_FIRST_RESPONSE_SLA_MINUTES = 10;
let webPushModule = null;

export class CallCenterService {
  constructor({
    operatorsFile,
    alertsFile,
    subscriptionsFile = "",
    now = () => new Date(),
    principal = { name: "Neno Gutterres", phone: "5551980413745" },
    alertUrl = "https://api.insanofoodtruck.com.br/conversas",
    vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "",
    vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "",
    vapidSubject = process.env.WEB_PUSH_SUBJECT || "https://api.insanofoodtruck.com.br",
    webPushProvider = null,
    firstResponseSlaMinutes = Number(process.env.CALL_CENTER_FIRST_RESPONSE_SLA_MINUTES || DEFAULT_FIRST_RESPONSE_SLA_MINUTES)
  } = {}) {
    this.operatorsFile = operatorsFile;
    this.alertsFile = alertsFile;
    this.subscriptionsFile = subscriptionsFile || alertsFile.replace(/alerts\.json$/, "push-subscriptions.json");
    this.now = now;
    this.principal = {
      name: principal.name || "Responsavel principal",
      phone: normalizePhone(principal.phone || "")
    };
    this.alertUrl = alertUrl;
    this.vapidPublicKey = vapidPublicKey;
    this.vapidPrivateKey = vapidPrivateKey;
    this.vapidSubject = vapidSubject;
    this.webPushProvider = webPushProvider;
    this.firstResponseSlaMinutes = Math.max(1, Number(firstResponseSlaMinutes) || DEFAULT_FIRST_RESPONSE_SLA_MINUTES);
  }

  async login({ name = "", phone = "", pin = "" } = {}) {
    const operatorPhone = normalizePhone(phone);
    const operatorName = String(name || "").trim();
    const operatorPin = String(pin || "").trim();
    if (!operatorPhone) return { ok: false, statusCode: 400, error: "operator_phone_required", message: "Telefone do atendente obrigatorio" };
    if (!operatorName) return { ok: false, statusCode: 400, error: "operator_name_required", message: "Nome do atendente obrigatorio" };
    if (operatorPin.length < 4) return { ok: false, statusCode: 400, error: "operator_pin_required", message: "PIN deve ter pelo menos 4 caracteres" };

    const data = await this.#readOperators();
    const now = this.now().toISOString();
    const index = data.operators.findIndex((operator) => operator.phone === operatorPhone);
    const base = index >= 0 ? data.operators[index] : {};
    const operator = {
      id: base.id || `op_${crypto.randomUUID()}`,
      name: operatorName,
      phone: operatorPhone,
      pinHash: base.pinHash || hashPin(operatorPhone, operatorPin),
      status: "available",
      lastSeenAt: now,
      activeConversationId: base.activeConversationId || ""
    };
    if (base.pinHash && base.pinHash !== hashPin(operatorPhone, operatorPin)) {
      return { ok: false, statusCode: 401, error: "invalid_operator_pin", message: "PIN do atendente invalido" };
    }
    if (index >= 0) data.operators[index] = operator;
    else data.operators.push(operator);
    await this.#writeOperators(data);
    return { ok: true, operator: publicOperator(operator) };
  }

  async logout(phone = "") {
    return this.setStatus(phone, "offline");
  }

  async setStatus(phone = "", status = "available") {
    const operatorPhone = normalizePhone(phone);
    const nextStatus = VALID_STATUSES.has(status) ? status : "available";
    const data = await this.#readOperators();
    const index = data.operators.findIndex((operator) => operator.phone === operatorPhone);
    if (index === -1) return { ok: false, statusCode: 404, error: "operator_not_found", message: "Atendente nao encontrado" };
    const now = this.now().toISOString();
    data.operators[index] = {
      ...data.operators[index],
      status: nextStatus,
      lastSeenAt: now,
      activeConversationId: nextStatus === "offline" ? "" : data.operators[index].activeConversationId || ""
    };
    await this.#writeOperators(data);
    return { ok: true, operator: publicOperator(data.operators[index]) };
  }

  async listOperators() {
    const data = await this.#readOperators();
    return { ok: true, operators: data.operators.map(publicOperator) };
  }

  async getOperator(phone = "") {
    const operatorPhone = normalizePhone(phone);
    const data = await this.#readOperators();
    const operator = data.operators.find((item) => item.phone === operatorPhone);
    return operator ? { ok: true, operator: publicOperator(operator) } : { ok: false, statusCode: 404, error: "operator_not_found" };
  }

  async routeIncoming(conversation = {}) {
    const operator = await this.#resolveOperator(conversation);
    const patch = {
      assignedOperatorPhone: operator.phone,
      assignedOperatorName: operator.name,
      callCenterStatus: operator.fallback ? "waiting_team" : "conversation_assigned"
    };
    const alert = await this.createAlert({ conversation: { ...conversation, ...patch }, operator });
    if (!operator.fallback) {
      await this.#markActiveConversation(operator.phone, conversation.id || "");
    }
    return { ok: true, conversationPatch: patch, operator: publicOperator(operator), alert };
  }

  async createAlert({ conversation = {}, operator = {} } = {}) {
    const operatorPhone = normalizePhone(operator.phone || "");
    if (!operatorPhone) return { ok: false, error: "operator_phone_required" };
    const data = await this.#readAlerts();
    const nowDate = this.now();
    const now = nowDate.toISOString();
    const eventKey = buildHumanEventKey(conversation);
    const existingEvent = eventKey ? data.alerts.find((alert) => alert.eventKey === eventKey) : null;
    if (existingEvent) return { ok: true, alert: existingEvent, suppressed: true, duplicate: true, channel: existingEvent.channel || "web_push" };

    const active = [...data.alerts].reverse().find((alert) => (
      alert.conversationId === conversation.id
      && alert.operatorPhone === operatorPhone
      && alert.status !== "read"
    ));
    const message = buildAlertMessage(conversation, this.alertUrl);
    if (active && !eventKey && nowDate.getTime() - new Date(active.lastSentAt || active.createdAt || 0).getTime() < ALERT_SPAM_WINDOW_MS) {
      active.unreadCount = Number(active.unreadCount || 1) + 1;
      active.count = Number(active.count || 1) + 1;
      active.updatedAt = now;
      active.lastMessage = conversation.ultimaMensagem || active.lastMessage || "";
      active.message = message;
      active.suppressed = true;
      await this.#writeAlerts(data);
      return { ok: true, alert: active, suppressed: true, channel: active.channel || "web_push" };
    }

    const alert = {
      id: `alert_${crypto.randomUUID()}`,
      channel: "web_push",
      status: "unread",
      eventKey,
      type: "human_request",
      conversationId: conversation.id || "",
      operatorPhone,
      operatorName: operator.name || "Atendente",
      clientName: conversation.nome || "Cliente WhatsApp",
      clientPhone: conversation.telefone || "",
      lastMessage: conversation.ultimaMensagem || "",
      unreadCount: Number(conversation.unreadCount || 1),
      count: 1,
      message,
      url: this.alertUrl,
      createdAt: now,
      updatedAt: now,
      lastSentAt: now,
      firstResponseDueAt: new Date(nowDate.getTime() + this.firstResponseSlaMinutes * 60 * 1000).toISOString(),
      firstResponseSlaMinutes: this.firstResponseSlaMinutes,
      realIntegrated: false,
      deliveryStatus: "pending",
      deliveries: []
    };
    data.alerts.push(alert);
    await this.#writeAlerts(data);
    const delivered = await this.#deliverPush(alert);
    return { ok: true, alert: delivered.alert, suppressed: false, channel: "web_push" };
  }

  async listAlerts({ phone = "", unreadOnly = false } = {}) {
    const operatorPhone = normalizePhone(phone);
    const data = await this.#readAlerts();
    const alerts = data.alerts
      .filter((alert) => !operatorPhone || alert.operatorPhone === operatorPhone)
      .filter((alert) => !unreadOnly || alert.status !== "read")
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .map((alert) => withAlertSla(alert, this.now()));
    return { ok: true, count: alerts.length, alerts };
  }

  async markAlertRead(id = "") {
    const data = await this.#readAlerts();
    const index = data.alerts.findIndex((alert) => alert.id === id);
    if (index === -1) return { ok: false, statusCode: 404, error: "alert_not_found" };
    data.alerts[index] = { ...data.alerts[index], status: "read", readAt: this.now().toISOString(), updatedAt: this.now().toISOString() };
    await this.#writeAlerts(data);
    return { ok: true, alert: data.alerts[index] };
  }

  async publicPushKey() {
    return { ok: true, publicKey: this.vapidPublicKey || "", configured: Boolean(this.vapidPublicKey && this.vapidPrivateKey) };
  }

  async savePushSubscription(subscription = {}, actor = {}, userAgent = "") {
    const endpoint = String(subscription.endpoint || "").trim();
    const deviceId = String(subscription.deviceId || subscription.device_id || "").trim();
    if (!endpoint || !endpoint.startsWith("https://")) return { ok: false, statusCode: 400, error: "push_endpoint_invalid" };
    if (!deviceId) return { ok: false, statusCode: 400, error: "device_id_required" };
    const data = await this.#readSubscriptions();
    const now = this.now().toISOString();
    const index = data.subscriptions.findIndex((item) => item.deviceId === deviceId || item.endpoint === endpoint);
    const current = index >= 0 ? data.subscriptions[index] : {};
    const record = {
      id: current.id || `push_${crypto.randomUUID()}`,
      deviceId,
      operatorId: actor.id || actor.username || current.operatorId || "",
      operatorPhone: normalizePhone(actor.phone || actor.operatorPhone || current.operatorPhone || ""),
      operatorName: actor.displayName || actor.name || actor.username || current.operatorName || "",
      endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh || "",
        auth: subscription.keys?.auth || ""
      },
      enabled: true,
      userAgent: userAgent || current.userAgent || "",
      createdAt: current.createdAt || now,
      updatedAt: now,
      lastSuccessAt: current.lastSuccessAt || null,
      lastFailureAt: current.lastFailureAt || null
    };
    if (index >= 0) data.subscriptions[index] = record;
    else data.subscriptions.push(record);
    await this.#writeSubscriptions(data);
    return { ok: true, subscription: publicSubscription(record) };
  }

  async removePushSubscription(deviceId = "", actor = {}) {
    const data = await this.#readSubscriptions();
    const isAdmin = String(actor.role || "").toUpperCase() === "ADMIN";
    const actorPhone = normalizePhone(actor.phone || actor.operatorPhone || "");
    const before = data.subscriptions.length;
    data.subscriptions = data.subscriptions.filter((item) => {
      if (item.deviceId !== deviceId) return true;
      return !(isAdmin || !item.operatorPhone || samePhone(item.operatorPhone, actorPhone));
    });
    await this.#writeSubscriptions(data);
    return { ok: true, removed: before - data.subscriptions.length };
  }

  async listPushSubscriptions(actor = {}) {
    const isAdmin = String(actor.role || "").toUpperCase() === "ADMIN";
    const actorPhone = normalizePhone(actor.phone || actor.operatorPhone || "");
    const data = await this.#readSubscriptions();
    const subscriptions = data.subscriptions
      .filter((item) => isAdmin || !actorPhone || samePhone(item.operatorPhone, actorPhone))
      .map(publicSubscription);
    return { ok: true, count: subscriptions.length, subscriptions };
  }

  async acknowledgeAlert(id = "", actor = {}) {
    return this.markAlertRead(id, actor);
  }

  async #resolveOperator(conversation = {}) {
    const assignedPhone = normalizePhone(conversation.assignedOperatorPhone || "");
    const data = await this.#readOperators();
    const assigned = data.operators.find((operator) => operator.phone === assignedPhone);
    if (assigned) return assigned;
    const available = data.operators
      .filter((operator) => AVAILABLE_STATUSES.has(operator.status))
      .sort((a, b) => String(a.lastSeenAt || "").localeCompare(String(b.lastSeenAt || "")))[0];
    if (available) return available;
    return {
      id: "principal",
      name: this.principal.name,
      phone: this.principal.phone,
      status: "fallback",
      lastSeenAt: this.now().toISOString(),
      fallback: true
    };
  }

  async #markActiveConversation(phone, conversationId) {
    const operatorPhone = normalizePhone(phone);
    if (!operatorPhone || !conversationId) return;
    const data = await this.#readOperators();
    const index = data.operators.findIndex((operator) => operator.phone === operatorPhone);
    if (index === -1) return;
    data.operators[index] = {
      ...data.operators[index],
      activeConversationId: conversationId,
      lastSeenAt: this.now().toISOString()
    };
    await this.#writeOperators(data);
  }

  async #readOperators() {
    try {
      const raw = await readFile(this.operatorsFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "{}");
      return { operators: Array.isArray(parsed.operators) ? parsed.operators : [] };
    } catch (error) {
      if (error.code === "ENOENT") return { operators: [] };
      throw error;
    }
  }

  async #writeOperators(data) {
    await mkdir(dirname(this.operatorsFile), { recursive: true });
    await writeFile(this.operatorsFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async #readAlerts() {
    try {
      const raw = await readFile(this.alertsFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "{}");
      return { alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [] };
    } catch (error) {
      if (error.code === "ENOENT") return { alerts: [] };
      throw error;
    }
  }

  async #writeAlerts(data) {
    await mkdir(dirname(this.alertsFile), { recursive: true });
    await writeFile(this.alertsFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async #readSubscriptions() {
    try {
      const raw = await readFile(this.subscriptionsFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "{}");
      return { subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [] };
    } catch (error) {
      if (error.code === "ENOENT") return { subscriptions: [] };
      throw error;
    }
  }

  async #writeSubscriptions(data) {
    await mkdir(dirname(this.subscriptionsFile), { recursive: true });
    await writeFile(this.subscriptionsFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async #deliverPush(alert = {}) {
    const alertsData = await this.#readAlerts();
    const index = alertsData.alerts.findIndex((item) => item.id === alert.id);
    if (index === -1) return { alert };
    if (!this.vapidPublicKey || !this.vapidPrivateKey) {
      alertsData.alerts[index] = { ...alertsData.alerts[index], deliveryStatus: "configuration_missing", realIntegrated: false };
      await this.#writeAlerts(alertsData);
      return { alert: alertsData.alerts[index] };
    }
    const webPush = this.webPushProvider || await loadWebPush();
    webPush.setVapidDetails(this.vapidSubject, this.vapidPublicKey, this.vapidPrivateKey);
    const subscriptionsData = await this.#readSubscriptions();
    const activeSubscriptions = subscriptionsData.subscriptions.filter((item) => item.enabled !== false);
    const payload = JSON.stringify(buildPushPayload(alert));
    const deliveries = [];
    for (const subscription of activeSubscriptions) {
      const attemptedAt = this.now().toISOString();
      const delivery = { deviceId: subscription.deviceId, status: "attempted", attemptedAt, deliveredAt: null, errorCode: "" };
      try {
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
        subscription.lastSuccessAt = this.now().toISOString();
        delivery.status = "delivered";
        delivery.deliveredAt = subscription.lastSuccessAt;
      } catch (error) {
        const code = Number(error?.statusCode || 0);
        delivery.status = "failed";
        delivery.errorCode = String(code || error?.code || "push_failed");
        subscription.lastFailureAt = this.now().toISOString();
        if (code === 404 || code === 410) subscription.enabled = false;
      }
      subscription.updatedAt = this.now().toISOString();
      deliveries.push(delivery);
    }
    await this.#writeSubscriptions(subscriptionsData);
    alertsData.alerts[index] = {
      ...alertsData.alerts[index],
      deliveries,
      deliveryStatus: deliveries.some((item) => item.status === "delivered") ? "delivered" : "not_delivered",
      realIntegrated: deliveries.some((item) => item.status === "delivered")
    };
    await this.#writeAlerts(alertsData);
    return { alert: alertsData.alerts[index] };
  }
}

function withAlertSla(alert = {}, now = new Date()) {
  const dueAt = Date.parse(alert.firstResponseDueAt || "");
  const pending = alert.status !== "read";
  const overdue = pending && Number.isFinite(dueAt) && now.getTime() > dueAt;
  return {
    ...alert,
    firstResponseSlaStatus: pending ? (overdue ? "overdue" : "on_time") : "acknowledged",
    firstResponseOverdue: overdue,
    firstResponseOverdueMinutes: overdue ? Math.floor((now.getTime() - dueAt) / 60000) : 0
  };
}

export function normalizeOperatorPhone(value = "") {
  return normalizePhone(value);
}

function publicOperator(operator = {}) {
  return {
    id: operator.id || "",
    name: operator.name || "",
    phone: operator.phone || "",
    status: operator.status || "offline",
    lastSeenAt: operator.lastSeenAt || "",
    activeConversationId: operator.activeConversationId || "",
    fallback: Boolean(operator.fallback)
  };
}

function publicSubscription(subscription = {}) {
  return {
    id: subscription.id || "",
    deviceId: subscription.deviceId || "",
    operatorId: subscription.operatorId || "",
    operatorPhone: subscription.operatorPhone || "",
    operatorName: subscription.operatorName || "",
    endpoint: subscription.endpoint || "",
    enabled: subscription.enabled !== false,
    userAgent: subscription.userAgent || "",
    createdAt: subscription.createdAt || "",
    updatedAt: subscription.updatedAt || "",
    lastSuccessAt: subscription.lastSuccessAt || null,
    lastFailureAt: subscription.lastFailureAt || null
  };
}

async function loadWebPush() {
  if (!webPushModule) webPushModule = await import("web-push");
  return webPushModule.default || webPushModule;
}

function buildHumanEventKey(conversation = {}) {
  const conversationId = conversation.id || "";
  const lastInboundMessageId = conversation.lastInboundMessageId || "";
  if (!conversationId || !lastInboundMessageId) return "";
  return `human_request:${conversationId}:${lastInboundMessageId}`;
}

function buildPushPayload(alert = {}) {
  return {
    type: "human_request",
    alertId: alert.id || "",
    eventKey: alert.eventKey || "",
    conversationId: alert.conversationId || "",
    clientName: alert.clientName || "",
    clientPhoneMasked: maskPhone(alert.clientPhone || ""),
    messagePreview: sanitizePreview(alert.lastMessage || ""),
    url: `/conversas?conversationId=${encodeURIComponent(alert.conversationId || "")}`,
    createdAt: alert.createdAt || ""
  };
}

function sanitizePreview(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function buildAlertMessage(conversation = {}, url = "") {
  return [
    "SamBah em atendimento",
    "",
    "Nova mensagem aguardando resposta.",
    "",
    `Cliente: ${conversation.nome || "Cliente WhatsApp"}`,
    `Telefone: ${conversation.telefone || ""}`,
    `Mensagem: ${conversation.ultimaMensagem || ""}`,
    "",
    `Abrir: ${url}`
  ].join("\n");
}

function hashPin(phone, pin) {
  return crypto.createHash("sha256").update(`sambah-call-center:${phone}:${pin}`).digest("hex");
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

function samePhone(a = "", b = "") {
  return normalizePhone(a) === normalizePhone(b);
}

function maskPhone(phone = "") {
  const digits = normalizePhone(phone);
  if (!digits) return "";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function stripBom(value = "") {
  return String(value || "").replace(/^\uFEFF/, "");
}
