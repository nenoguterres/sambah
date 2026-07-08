import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";

const ACTIVE_STATUSES = new Set(["draft", "collecting_items", "ready_to_send", "mesa_pending", "sent_to_mesa"]);

export class WhatsAppOrderService {
  constructor({ filePath, now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
  }

  async createDraftOrderFromConversation(conversation = {}, input = {}) {
    const existing = await this.getOrderByConversation(conversation.id);
    if (existing.ok && ACTIVE_STATUSES.has(existing.order.status)) {
      return { ok: true, created: false, order: existing.order };
    }
    const now = this.now().toISOString();
    const order = {
      id: input.id || `wa_order_${crypto.randomUUID()}`,
      conversationId: conversation.id || input.conversationId || "",
      phone: normalizePhone(conversation.telefone || input.phone || ""),
      customerName: input.customerName || conversation.nome || "Cliente WhatsApp",
      items: [],
      notes: input.notes || "",
      status: "collecting_items",
      mesaOrderId: "",
      source: "whatsapp_sambah",
      createdAt: now,
      updatedAt: now,
      audit: [auditEvent("order_created", now, { conversationId: conversation.id || "" })]
    };
    const data = await this.#read();
    data.orders.unshift(order);
    await this.#write(data);
    return { ok: true, created: true, order };
  }

  async addItemToOrder(conversationId, input = {}) {
    const data = await this.#read();
    const index = this.#findActiveIndex(data.orders, conversationId);
    if (index === -1) return { ok: false, error: "order_not_found" };
    const now = this.now().toISOString();
    const item = normalizeOrderItem(input);
    if (!item.name) return { ok: false, error: "item_required" };
    const order = {
      ...data.orders[index],
      items: [...(data.orders[index].items || []), item],
      status: "collecting_items",
      updatedAt: now,
      audit: [...(data.orders[index].audit || []), auditEvent("item_added", now, { item: item.name })].slice(-40)
    };
    data.orders[index] = order;
    await this.#write(data);
    return { ok: true, order, item };
  }

  async sendOrderToMesa(conversationId, { mesaConnector = null, mesaService = null } = {}) {
    const data = await this.#read();
    const index = this.#findActiveIndex(data.orders, conversationId);
    if (index === -1) return { ok: false, error: "order_not_found" };
    const current = data.orders[index];
    if (!Array.isArray(current.items) || current.items.length === 0) {
      return { ok: false, error: "order_without_items" };
    }
    const now = this.now().toISOString();
    const mesaPayload = buildMesaPayload(current);
    const mesaResult = mesaConnector?.createOrder
      ? await mesaConnector.createOrder(mesaPayload)
      : await sendWithMesaIntegration(mesaService, mesaPayload);
    const mesaOrderId = mesaResult.mesaOrderId || mesaResult.queueId || mesaResult.entry?.id || current.mesaOrderId || "";
    const status = mesaResult.ok ? "sent_to_mesa" : "mesa_pending";
    const order = {
      ...current,
      status,
      mesaOrderId,
      mesaStatus: mesaResult.status || status,
      mesaResult: sanitizeMesaResult(mesaResult),
      updatedAt: now,
      audit: [...(current.audit || []), auditEvent("sent_to_mesa", now, { ok: mesaResult.ok, mesaOrderId })].slice(-40)
    };
    data.orders[index] = order;
    await this.#write(data);
    return { ok: true, sent: Boolean(mesaResult.ok), order, mesa: mesaResult };
  }

  async updateOrderStatus(conversationId, status, patch = {}) {
    const data = await this.#read();
    const index = this.#findActiveIndex(data.orders, conversationId);
    if (index === -1) return { ok: false, error: "order_not_found" };
    const now = this.now().toISOString();
    const order = {
      ...data.orders[index],
      ...patch,
      status,
      updatedAt: now,
      audit: [...(data.orders[index].audit || []), auditEvent("mesa_status_updated", now, { status })].slice(-40)
    };
    data.orders[index] = order;
    await this.#write(data);
    return { ok: true, order };
  }

  async cancelOrder(conversationId, reason = "Cancelado pelo atendimento") {
    const data = await this.#read();
    const index = this.#findActiveIndex(data.orders, conversationId);
    if (index === -1) return { ok: false, error: "order_not_found" };
    const now = this.now().toISOString();
    const order = {
      ...data.orders[index],
      status: "cancelled",
      cancelReason: reason,
      updatedAt: now,
      audit: [...(data.orders[index].audit || []), auditEvent("order_cancelled", now, { reason })].slice(-40)
    };
    data.orders[index] = order;
    await this.#write(data);
    return { ok: true, order };
  }

  async getOrderByConversation(conversationId) {
    const data = await this.#read();
    const order = data.orders.find((item) => item.conversationId === conversationId && ACTIVE_STATUSES.has(item.status))
      || data.orders.find((item) => item.conversationId === conversationId)
      || null;
    return order ? { ok: true, order } : { ok: false, error: "order_not_found" };
  }

  #findActiveIndex(orders = [], conversationId = "") {
    return orders.findIndex((item) => item.conversationId === conversationId && ACTIVE_STATUSES.has(item.status));
  }

  async #read() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "{}");
      return { orders: Array.isArray(parsed.orders) ? parsed.orders : [] };
    } catch (error) {
      if (error.code === "ENOENT") return { orders: [] };
      throw error;
    }
  }

  async #write(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

export function summarizeWhatsappOrder(order = null) {
  if (!order) return null;
  return {
    id: order.id || "",
    conversationId: order.conversationId || "",
    phone: order.phone || "",
    customerName: order.customerName || "",
    items: Array.isArray(order.items) ? order.items : [],
    notes: order.notes || "",
    status: order.status || "",
    mesaOrderId: order.mesaOrderId || "",
    mesaStatus: order.mesaStatus || "",
    source: order.source || "whatsapp_sambah",
    createdAt: order.createdAt || "",
    updatedAt: order.updatedAt || ""
  };
}

export function shouldCollectWhatsappOrderItem(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (["1", "01", "quero pedir", "pedido", "fazer pedido", "quero fazer pedido"].includes(normalized)) return false;
  if (["oi", "ola", "buenas", "bom dia", "boa tarde", "boa noite"].includes(normalized)) return false;
  if (["cardapio", "menu", "humano", "atendente", "cancelar", "cancela", "ajuda", "horario", "endereco", "localizacao"].includes(normalized)) return false;
  if (["delivery", "entrega", "retirada", "retirar", "buscar", "pix", "cartao", "dinheiro", "pronto", "fechar", "finalizar"].includes(normalized)) return false;
  if (normalized.includes("enviar para mesa") || normalized.includes("pode enviar") || normalized.includes("pedido pronto")) return false;
  if (normalized.includes("cardapio") || normalized.includes("menu")) return false;
  if (normalized.includes("atendente") || normalized.includes("humano") || normalized.includes("cancelar")) return false;
  if (normalized.includes("horario") || normalized.includes("que horas") || normalized.includes("onde fica") || normalized.includes("endereco")) return false;
  return true;
}

function buildMesaPayload(order) {
  return {
    approved: true,
    status: "approved",
    source: "whatsapp_sambah",
    channel: "sambah",
    externalId: order.id,
    sambahOrderId: order.id,
    customer: {
      name: order.customerName || "Cliente WhatsApp",
      phone: order.phone || ""
    },
    order: {
      type: "whatsapp_sambah",
      items: order.items || [],
      notes: order.notes || "",
      total: null
    },
    metadata: {
      conversationId: order.conversationId,
      origin: "WHATSAPP_SAMBAH"
    }
  };
}

async function sendWithMesaIntegration(mesaService, payload) {
  if (!mesaService?.enqueueOrder || !mesaService?.sendOrderToMesa) {
    return { ok: false, error: "mesa_connector_unavailable", status: "pending" };
  }
  const entry = await mesaService.enqueueOrder(payload);
  const result = await mesaService.sendOrderToMesa(entry);
  return {
    ok: result.ok,
    queueId: result.entry?.id || entry.id,
    mesaOrderId: result.mesaResponse?.id || result.mesaResponse?.orderId || result.entry?.id || entry.id,
    status: result.ok ? "accepted" : "pending",
    httpStatus: result.httpStatus || null,
    error: result.ok ? null : result.error || result.entry?.lastError || "mesa_unavailable"
  };
}

function normalizeOrderItem(input = {}) {
  const raw = typeof input === "string" ? input : input.text || input.name || input.nome || "";
  const text = String(raw || "").trim();
  const match = text.match(/^(\d+)\s*(x|un|unid)?\s+(.+)$/i);
  return {
    id: input.id || `item_${crypto.randomUUID()}`,
    name: String(input.name || input.nome || (match ? match[3] : text)).trim(),
    quantity: Number(input.quantity || input.quantidade || (match ? match[1] : 1)) || 1,
    notes: input.notes || input.observacao || "",
    rawText: text
  };
}

function auditEvent(type, at, context = {}) {
  return { type, at, context };
}

function sanitizeMesaResult(result = {}) {
  return {
    ok: Boolean(result.ok),
    operation: result.operation || "",
    queueId: result.queueId || result.entry?.id || "",
    mesaOrderId: result.mesaOrderId || "",
    status: result.status || "",
    httpStatus: result.httpStatus || null,
    error: result.error || null
  };
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
