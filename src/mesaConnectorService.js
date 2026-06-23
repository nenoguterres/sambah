import { buildMesaOrder, getMesaConfig, MesaIntegrationService } from "./mesaIntegrationService.js";

const APPROVED_STATUSES = new Set(["approved", "confirmed", "paid", "aprovado", "confirmado", "pago"]);

export function getMesaConnectorConfig(env = globalThis.process?.env || {}) {
  const current = getMesaConfig();
  return {
    baseUrl: env.MESA_BASE_URL || current.baseUrl,
    orderPath: env.MESA_ORDER_PATH || current.orderPath,
    updatePath: env.MESA_ORDER_UPDATE_PATH || `${current.orderPath}/:orderId/status`,
    cancelPath: env.MESA_ORDER_CANCEL_PATH || `${current.orderPath}/:orderId/status`,
    statusPath: env.MESA_ORDER_STATUS_PATH || `${current.orderPath}/:orderId`,
    healthPath: env.MESA_HEALTH_PATH || current.healthPath,
    timeoutMs: Number(env.MESA_TIMEOUT_MS || current.timeoutMs),
    apiToken: env.MESA_API_TOKEN || ""
  };
}

export class MesaConnectorService {
  constructor({ config = getMesaConnectorConfig(), fetchImpl = globalThis.fetch, integrationService = null } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.integration = integrationService || new MesaIntegrationService({
      config: {
        baseUrl: config.baseUrl,
        orderPath: config.orderPath,
        healthPath: config.healthPath,
        timeoutMs: config.timeoutMs
      },
      fetchImpl
    });
  }

  async createOrder(input = {}) {
    if (!isApprovedOrder(input)) {
      return failure("create", "order_not_approved", "Somente pedidos aprovados pelo SamBah podem ser enviados ao Mesa.", 409);
    }

    const order = normalizeApprovedOrder(input);
    if (!order.externalId) {
      return failure("create", "external_order_id_required", "O pedido aprovado precisa de um identificador externo.", 400);
    }

    const queueEntry = await this.integration.enqueueOrder(order);
    const result = await this.integration.sendOrderToMesa(queueEntry);
    const mesaOrderId = extractMesaOrderId(result.mesaResponse);
    return {
      ok: result.ok,
      operation: "create",
      externalId: order.externalId,
      queueId: result.entry?.id || queueEntry.id,
      mesaOrderId,
      status: result.ok ? "accepted" : "pending",
      httpStatus: result.httpStatus || null,
      error: result.ok ? null : result.error || result.entry?.lastError || "mesa_unavailable"
    };
  }

  async updateOrder(orderId, changes = {}) {
    const id = requiredId(orderId);
    if (!id.ok) return id.result;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      return failure("update", "invalid_order_changes", "As alteracoes do pedido precisam ser um objeto.", 400);
    }
    const status = String(changes.status || changes.estado || "").trim();
    if (!status) return failure("update", "order_status_required", "O Mesa atual permite atualizar o status do pedido.", 400);
    return this.request("update", "PATCH", this.config.updatePath, id.value, { ...changes, status });
  }

  async cancelOrder(orderId, input = {}) {
    const id = requiredId(orderId);
    if (!id.ok) return id.result;
    const body = typeof input === "string" ? { reason: input } : input;
    return this.request("cancel", "PATCH", this.config.cancelPath, id.value, {
      status: "cancelado",
      reason: String(body?.reason || body?.motivo || "Cancelado pelo SamBah"),
      source: "sambah"
    });
  }

  async getOrderStatus(orderId) {
    const id = requiredId(orderId);
    if (!id.ok) return id.result;
    return this.request("status", "GET", this.config.statusPath, id.value);
  }

  async request(operation, method, pathTemplate, orderId, body = null) {
    const path = resolveOrderPath(pathTemplate, orderId);
    const controller = createTimeoutController(this.config.timeoutMs);
    try {
      const response = await this.fetch(`${String(this.config.baseUrl).replace(/\/$/, "")}${path}`, {
        method,
        headers: this.headers(body),
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const payload = await readBody(response);
      return {
        ok: response.ok,
        operation,
        mesaOrderId: extractMesaOrderId(payload) || orderId,
        status: extractMesaStatus(payload, response.ok, operation),
        httpStatus: response.status,
        data: response.ok ? payload : null,
        error: response.ok ? null : sanitizeError(payload, response.status)
      };
    } catch (error) {
      return {
        ok: false,
        operation,
        mesaOrderId: orderId,
        status: "pending",
        httpStatus: null,
        data: null,
        error: error?.name === "AbortError" ? "mesa_timeout" : "mesa_unavailable"
      };
    } finally {
      controller.clear();
    }
  }

  headers(hasBody) {
    return {
      accept: "application/json",
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(this.config.apiToken ? { authorization: `Bearer ${this.config.apiToken}` } : {})
    };
  }
}

function isApprovedOrder(input = {}) {
  if (input.approved === true || input.aprovado === true) return true;
  return APPROVED_STATUSES.has(String(input.status || input.approvalStatus || "").trim().toLowerCase());
}

function normalizeApprovedOrder(input = {}) {
  const normalized = buildMesaOrder(input);
  return {
    ...normalized,
    source: "sambah",
    channel: String(input.channel || input.canal || "sambah"),
    externalId: String(input.externalId || input.sambahOrderId || input.orderId || input.id || normalized.externalId),
    customer: {
      ...normalized.customer,
      ...(input.customer || {})
    },
    order: {
      ...normalized.order,
      ...(input.order || {}),
      items: Array.isArray(input.order?.items) ? input.order.items : normalized.order.items
    },
    status: "approved",
    approvedAt: String(input.approvedAt || input.aprovadoEm || new Date().toISOString())
  };
}

function requiredId(value) {
  const id = String(value || "").trim();
  return id
    ? { ok: true, value: id }
    : { ok: false, result: failure("order", "order_id_required", "O ID do pedido no Mesa e obrigatorio.", 400) };
}

function resolveOrderPath(template, orderId) {
  const path = String(template || "").replace(":orderId", encodeURIComponent(orderId));
  return path.startsWith("/") ? path : `/${path}`;
}

function extractMesaOrderId(payload = {}) {
  return payload?.id || payload?.orderId || payload?.mesaOrderId || payload?.externalId || payload?.order?.id || null;
}

function extractMesaStatus(payload, ok, operation) {
  if (payload?.status) return payload.status;
  if (!ok) return "error";
  if (operation === "cancel") return "canceled";
  if (operation === "update") return "updated";
  return "found";
}

async function readBody(response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function sanitizeError(payload, status) {
  const message = String(payload?.error || payload?.message || `Mesa respondeu HTTP ${status}`);
  return message.replace(/Bearer\s+\S+/gi, "Bearer [masked]").slice(0, 300);
}

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(100, Number(timeoutMs) || 1500));
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function failure(operation, error, message, statusCode) {
  return { ok: false, operation, error, message, statusCode };
}

const defaultConnector = new MesaConnectorService();

export const createOrder = (order) => defaultConnector.createOrder(order);
export const updateOrder = (orderId, changes) => defaultConnector.updateOrder(orderId, changes);
export const cancelOrder = (orderId, input) => defaultConnector.cancelOrder(orderId, input);
export const getOrderStatus = (orderId) => defaultConnector.getOrderStatus(orderId);
