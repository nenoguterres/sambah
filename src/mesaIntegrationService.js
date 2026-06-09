import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";

const DEFAULT_MESA_BASE_URL = "http://127.0.0.1:4173";
const DEFAULT_QUEUE_FILE = "data/mesa-queue.json";
const DEFAULT_MESA_ORDER_PATH = "/api/orders/external";
const DEFAULT_MESA_HEALTH_PATH = "/health";
const DEFAULT_TIMEOUT_MS = 1500;

export function getMesaConfig() {
  return {
    baseUrl: process.env.MESA_BASE_URL || DEFAULT_MESA_BASE_URL,
    orderPath: process.env.MESA_ORDER_PATH || DEFAULT_MESA_ORDER_PATH,
    healthPath: process.env.MESA_HEALTH_PATH || DEFAULT_MESA_HEALTH_PATH,
    timeoutMs: Number(process.env.MESA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  };
}

export function buildMesaOrder(payload = {}) {
  const createdAt = new Date().toISOString();
  const items = Array.isArray(payload.order?.items)
    ? payload.order.items
    : Array.isArray(payload.items)
      ? payload.items
      : [];
  return {
    source: "whatsapp",
    channel: "samBah",
    externalId: payload.eventId || payload.id || crypto.randomUUID(),
    customer: {
      name: payload.customer?.name || payload.name || "",
      phone: payload.customer?.phone || payload.phone || payload.from || ""
    },
    order: {
      type: "whatsapp",
      table: payload.order?.table ?? payload.table ?? null,
      items,
      notes: payload.order?.notes || payload.notes || payload.message || payload.text || "",
      total: payload.order?.total ?? payload.total ?? null
    },
    status: "received",
    createdAt
  };
}

export class MesaIntegrationService {
  constructor({ queueFile = DEFAULT_QUEUE_FILE, config = getMesaConfig(), fetchImpl = globalThis.fetch } = {}) {
    this.queueFile = queueFile;
    this.config = config;
    this.fetch = fetchImpl;
  }

  async checkMesaHealth() {
    const baseUrl = this.config.baseUrl;
    const checkedAt = new Date().toISOString();
    const controller = createTimeoutController(this.config.timeoutMs);
    try {
      const response = await this.fetch(`${baseUrl}${this.config.healthPath}`, {
        method: "GET",
        signal: controller.signal
      });
      return {
        ok: response.ok,
        status: response.ok ? "connected" : "disconnected",
        baseUrl,
        healthPath: this.config.healthPath,
        orderPath: this.config.orderPath,
        httpStatus: response.status,
        checkedAt
      };
    } catch (error) {
      return {
        ok: false,
        status: "disconnected",
        baseUrl,
        healthPath: this.config.healthPath,
        orderPath: this.config.orderPath,
        checkedAt,
        error: error.message
      };
    } finally {
      controller.clear();
    }
  }

  async enqueueOrder(order) {
    const queue = await this.readQueue();
    const existing = queue.find((entry) => entry.order.externalId === order.externalId);
    if (existing) return existing;

    const entry = {
      id: crypto.randomUUID(),
      status: "pending",
      attempts: 0,
      order,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null,
      lastAttemptAt: null,
      lastSentAt: null,
      acceptedAt: null,
      history: [{
        status: "pending",
        at: new Date().toISOString(),
        message: "Pedido salvo na fila local"
      }]
    };
    queue.unshift(entry);
    await this.writeQueue(queue);
    return entry;
  }

  async sendOrderToMesa(orderOrEntry) {
    const queue = await this.readQueue();
    const isQueueEntry = Boolean(orderOrEntry?.id && orderOrEntry?.order);
    let entry = isQueueEntry ? orderOrEntry : queue.find((item) => item.order.externalId === orderOrEntry.externalId);
    if (!entry) entry = await this.enqueueOrder(orderOrEntry);

    const now = new Date().toISOString();
    entry.status = "sending";
    entry.attempts += 1;
    entry.lastAttemptAt = now;
    entry.updatedAt = now;
    entry.history = addHistory(entry.history, "sending", "Tentativa de envio ao Mesa");
    await this.upsertEntry(entry);

    const controller = createTimeoutController(this.config.timeoutMs);
    try {
      const response = await this.fetch(`${this.config.baseUrl}${this.config.orderPath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry.order),
        signal: controller.signal
      });
      const responseBody = await readResponseBody(response);
      const accepted = response.ok;
      entry.status = accepted ? "accepted" : "pending";
      entry.mesaResponse = responseBody;
      entry.lastSentAt = accepted ? new Date().toISOString() : entry.lastSentAt;
      entry.acceptedAt = accepted ? new Date().toISOString() : null;
      entry.lastError = accepted ? null : `Mesa respondeu HTTP ${response.status}`;
      entry.updatedAt = new Date().toISOString();
      entry.history = addHistory(
        entry.history,
        entry.status,
        accepted ? "Pedido aceito pelo Mesa" : entry.lastError
      );
      await this.upsertEntry(entry);
      return { ok: accepted, entry: sanitizeEntry(entry), httpStatus: response.status, mesaResponse: responseBody };
    } catch (error) {
      entry.status = "pending";
      entry.lastError = error.message;
      entry.updatedAt = new Date().toISOString();
      entry.history = addHistory(entry.history, "pending", `Mesa indisponivel: ${error.message}`);
      await this.upsertEntry(entry);
      return { ok: false, entry: sanitizeEntry(entry), error: error.message };
    } finally {
      controller.clear();
    }
  }

  async retryPendingOrders() {
    const queue = await this.readQueue();
    const pending = queue.filter((entry) => ["pending", "error"].includes(entry.status));
    const results = [];
    for (const entry of pending) {
      results.push(await this.sendOrderToMesa(entry));
    }
    return {
      attempted: results.length,
      accepted: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results
    };
  }

  async markNeedsReview(entry, validation) {
    const now = new Date().toISOString();
    entry.status = "needs_review";
    entry.reviewReason = validation.reason;
    entry.review = validation;
    entry.lastError = validation.message;
    entry.updatedAt = now;
    entry.history = addHistory(entry.history, "needs_review", validation.message);
    await this.upsertEntry(entry);
    return sanitizeEntry(entry);
  }

  async reviewOrders({ limit = 100 } = {}) {
    const queue = await this.readQueue();
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const items = queue
      .filter((entry) => ["needs_review", "review"].includes(entry.status))
      .slice(0, normalizedLimit)
      .map(formatReviewEntry);
    return {
      ok: true,
      total: items.length,
      items
    };
  }

  async cancelReviewOrder(id) {
    const queue = await this.readQueue();
    const entry = queue.find((item) => item.id === id);
    if (!entry) return { ok: false, error: "order_not_found" };
    if (!["needs_review", "review"].includes(entry.status)) {
      return { ok: false, error: "order_not_in_review", status: entry.status };
    }
    const now = new Date().toISOString();
    entry.status = "canceled";
    entry.canceledAt = now;
    entry.updatedAt = now;
    entry.history = addHistory(entry.history, "canceled", "Pedido cancelado na revisao manual");
    await this.upsertEntry(entry);
    return { ok: true, item: formatReviewEntry(entry) };
  }

  async queueSnapshot({ limit = 100 } = {}) {
    const queue = await this.readQueue();
    const pending = queue.filter((entry) => entry.status === "pending");
    const needsReview = queue.filter((entry) => ["needs_review", "review"].includes(entry.status));
    const lastSent = queue.find((entry) => entry.lastSentAt) || null;
    const lastError = queue.find((entry) => entry.lastError) || null;
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return {
      total: queue.length,
      pending: pending.length,
      needsReview: needsReview.length,
      accepted: queue.filter((entry) => entry.status === "accepted").length,
      failed: queue.filter((entry) => entry.lastError).length,
      lastSentAt: lastSent?.lastSentAt || null,
      lastError: lastError?.lastError || null,
      items: queue.slice(0, normalizedLimit).map(sanitizeEntry)
    };
  }

  async getExternalOrderStatus(mesaOrderId) {
    const candidates = [
      `/api/orders/external/${encodeURIComponent(mesaOrderId)}`,
      `/api/orders/status/${encodeURIComponent(mesaOrderId)}`,
      "/api/orders/external"
    ];
    const checkedAt = new Date().toISOString();

    for (const path of candidates) {
      const controller = createTimeoutController(this.config.timeoutMs);
      try {
        const response = await this.fetch(`${this.config.baseUrl}${path}`, {
          method: "GET",
          signal: controller.signal
        });
        const body = await readResponseBody(response);
        if (!response.ok) {
          continue;
        }
        const order = findOrderInResponse(body, mesaOrderId);
        const status = order?.status || body?.status || null;
        if (status) {
          return { ok: true, mesaOrderId, status, order, endpoint: path, checkedAt };
        }
      } catch (error) {
        return { ok: false, mesaOrderId, error: error.message, endpoint: path, checkedAt };
      } finally {
        controller.clear();
      }
    }

    return {
      ok: false,
      mesaOrderId,
      error: "mesa_status_endpoint_not_found",
      checkedAt
    };
  }

  async readQueue() {
    try {
      const raw = await readFile(this.queueFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeQueue([]);
        return [];
      }
      throw error;
    }
  }

  async writeQueue(queue) {
    await mkdir(dirname(this.queueFile), { recursive: true });
    await writeFile(this.queueFile, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  }

  async upsertEntry(entry) {
    const queue = await this.readQueue();
    const index = queue.findIndex((item) => item.id === entry.id);
    if (index >= 0) queue[index] = entry;
    else queue.unshift(entry);
    await this.writeQueue(queue);
  }
}

function findOrderInResponse(body, mesaOrderId) {
  if (!body) return null;
  if (Array.isArray(body)) {
    return body.find((item) => matchesOrderId(item, mesaOrderId)) || null;
  }
  if (Array.isArray(body.items)) {
    return body.items.find((item) => matchesOrderId(item, mesaOrderId)) || null;
  }
  if (Array.isArray(body.orders)) {
    return body.orders.find((item) => matchesOrderId(item, mesaOrderId)) || null;
  }
  if (matchesOrderId(body, mesaOrderId)) return body;
  return null;
}

function matchesOrderId(item = {}, mesaOrderId) {
  return [item.id, item.orderId, item.mesaOrderId, item.externalId].filter(Boolean).includes(mesaOrderId);
}

async function readResponseBody(response) {
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } catch {
    return null;
  }
}

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

function addHistory(history = [], status, message) {
  return [
    {
      status,
      at: new Date().toISOString(),
      message
    },
    ...history
  ].slice(0, 25);
}

function sanitizeEntry(entry) {
  return {
    ...entry,
    order: {
      ...entry.order,
      customer: {
        ...entry.order?.customer,
        phone: maskPhone(entry.order?.customer?.phone)
      }
    }
  };
}

function formatReviewEntry(entry) {
  const order = entry.order || {};
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    customer: {
      name: order.customer?.name || "Cliente WhatsApp",
      phoneMasked: maskPhone(order.customer?.phone)
    },
    items: Array.isArray(order.order?.items) ? order.order.items : [],
    reason: entry.reviewReason || entry.review?.reason || "needs_review",
    message: entry.review?.message || entry.lastError || "",
    rawMessage: order.order?.notes || "",
    status: entry.status,
    attempts: entry.attempts || 0
  };
}

function maskPhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return `***${digits.slice(-4)}`;
}

const defaultService = new MesaIntegrationService();

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export async function sendOrderToMesa(order) {
  return defaultService.sendOrderToMesa(order);
}

export async function checkMesaHealth() {
  return defaultService.checkMesaHealth();
}

export async function retryPendingOrders() {
  return defaultService.retryPendingOrders();
}
