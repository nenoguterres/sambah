import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const VALID_STATUSES = new Set(["online", "offline", "available", "busy"]);
const AVAILABLE_STATUSES = new Set(["online", "available"]);
const ALERT_SPAM_WINDOW_MS = 5 * 60 * 1000;

export class CallCenterService {
  constructor({
    operatorsFile,
    alertsFile,
    now = () => new Date(),
    principal = { name: "Neno Gutterres", phone: "5551980413745" },
    alertUrl = "https://api.insanofoodtruck.com.br/conversas"
  } = {}) {
    this.operatorsFile = operatorsFile;
    this.alertsFile = alertsFile;
    this.now = now;
    this.principal = {
      name: principal.name || "Responsavel principal",
      phone: normalizePhone(principal.phone || "")
    };
    this.alertUrl = alertUrl;
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
    const active = [...data.alerts].reverse().find((alert) => (
      alert.conversationId === conversation.id
      && alert.operatorPhone === operatorPhone
      && alert.status !== "read"
    ));
    const message = buildAlertMessage(conversation, this.alertUrl);
    if (active && nowDate.getTime() - new Date(active.lastSentAt || active.createdAt || 0).getTime() < ALERT_SPAM_WINDOW_MS) {
      active.unreadCount = Number(active.unreadCount || 1) + 1;
      active.count = Number(active.count || 1) + 1;
      active.updatedAt = now;
      active.lastMessage = conversation.ultimaMensagem || active.lastMessage || "";
      active.message = message;
      active.suppressed = true;
      await this.#writeAlerts(data);
      return { ok: true, alert: active, suppressed: true, channel: "simulated_local" };
    }

    const alert = {
      id: `alert_${crypto.randomUUID()}`,
      channel: "simulated_local",
      status: "unread",
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
      realIntegrated: false
    };
    data.alerts.push(alert);
    await this.#writeAlerts(data);
    return { ok: true, alert, suppressed: false, channel: "simulated_local" };
  }

  async listAlerts({ phone = "", unreadOnly = false } = {}) {
    const operatorPhone = normalizePhone(phone);
    const data = await this.#readAlerts();
    const alerts = data.alerts
      .filter((alert) => !operatorPhone || alert.operatorPhone === operatorPhone)
      .filter((alert) => !unreadOnly || alert.status !== "read")
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
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

function stripBom(value = "") {
  return String(value || "").replace(/^\uFEFF/, "");
}
