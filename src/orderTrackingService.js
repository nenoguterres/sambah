import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_TRACKING_FILE = "data/order-tracking.json";

export class OrderTrackingService {
  constructor({ filePath = DEFAULT_TRACKING_FILE } = {}) {
    this.filePath = filePath;
  }

  async createTracking(record) {
    const items = await this.readAll();
    const now = new Date().toISOString();
    const normalized = {
      sambahOrderId: record.sambahOrderId,
      mesaOrderId: record.mesaOrderId || null,
      operation: record.operation || "",
      customerName: record.customerName || "",
      customerPhone: record.customerPhone || "",
      channel: record.channel || "site",
      serviceType: record.serviceType || "",
      paymentMethod: record.paymentMethod || "",
      lastMesaStatus: record.lastMesaStatus || "pending",
      lastWhatsappStatusSent: record.lastWhatsappStatusSent || "pre_order_sent",
      lastMessageSent: record.lastMessageSent || "Pré-comanda enviada para a equipe. O SamBah continua contigo pelo WhatsApp.",
      whatsappDeliveryStatus: record.whatsappDeliveryStatus || "wa_link_generated",
      queueId: record.queueId || null,
      createdAt: record.createdAt || now,
      updatedAt: now
    };
    const index = items.findIndex((item) => item.sambahOrderId === normalized.sambahOrderId);
    if (index >= 0) items[index] = { ...items[index], ...normalized, createdAt: items[index].createdAt };
    else items.unshift(normalized);
    await this.writeAll(items);
    return normalized;
  }

  async list({ limit = 100 } = {}) {
    const items = await this.readAll();
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return {
      ok: true,
      total: items.length,
      items: items.slice(0, normalizedLimit).map(enrichTrackingItem)
    };
  }

  async refreshStatuses({ mesaService, limit = 100 } = {}) {
    const items = await this.readAll();
    const now = new Date().toISOString();
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const refreshed = [];

    for (const item of items.slice(0, normalizedLimit)) {
      if (!item.mesaOrderId || isFinalStatus(item.lastMesaStatus)) {
        refreshed.push(enrichTrackingItem(item));
        continue;
      }

      const previousStatus = item.lastMesaStatus || "pending";
      const statusResult = await mesaService.getExternalOrderStatus(item.mesaOrderId);
      const nextStatus = statusResult.ok && statusResult.status ? statusResult.status : previousStatus;
      const message = statusToCustomerMessage(nextStatus, item.operation);
      const changed = nextStatus !== previousStatus;

      item.lastMesaStatus = nextStatus;
      item.pendingWhatsappMessage = message;
      item.whatsappUrl = buildTrackingWhatsAppUrl(item, message);
      item.needsCustomerNotification = changed || item.whatsappDeliveryStatus !== "sent";
      item.whatsappDeliveryStatus = item.needsCustomerNotification ? "pending_send" : item.whatsappDeliveryStatus || "wa_link_generated";
      item.lastStatusCheckedAt = now;
      item.lastStatusCheckError = statusResult.ok ? null : statusResult.error || "status_endpoint_unavailable";
      item.updatedAt = now;
      refreshed.push(enrichTrackingItem(item));
    }

    await this.writeAll(items);
    return {
      ok: true,
      refreshed: refreshed.length,
      items: refreshed
    };
  }

  async markWhatsappSent(sambahOrderId) {
    const items = await this.readAll();
    const item = items.find((entry) => entry.sambahOrderId === sambahOrderId);
    if (!item) return { ok: false, error: "tracking_not_found" };

    const message = item.pendingWhatsappMessage || statusToCustomerMessage(item.lastMesaStatus, item.operation);
    item.whatsappDeliveryStatus = "sent";
    item.lastWhatsappStatusSent = item.lastMesaStatus || "pending";
    item.needsCustomerNotification = false;
    item.lastMessageSent = message;
    item.pendingWhatsappMessage = "";
    item.updatedAt = new Date().toISOString();
    await this.writeAll(items);
    return { ok: true, item: enrichTrackingItem(item) };
  }

  async readAll() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeAll([]);
        return [];
      }
      throw error;
    }
  }

  async writeAll(items) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function enrichTrackingItem(item) {
  const message = item.pendingWhatsappMessage || statusToCustomerMessage(item.lastMesaStatus, item.operation);
  return {
    ...item,
    pendingWhatsappMessage: item.pendingWhatsappMessage || message,
    needsCustomerNotification: Boolean(item.needsCustomerNotification),
    whatsappUrl: item.whatsappUrl || buildTrackingWhatsAppUrl(item, message)
  };
}

function statusToCustomerMessage(status = "pending", operation = "") {
  const messages = {
    pending: "Recebi tua pré-comanda. A equipe já vai conferir.",
    pending_mesa: "O sistema de pedidos está em conferência. Recebi tua pré-comanda e a equipe vai confirmar pelo WhatsApp.",
    accepted: "Tua comanda foi recebida pela equipe. Já entrou na fila.",
    em_preparo: "Teu pedido entrou em preparo.",
    pronto: "Teu pedido ficou pronto.",
    pronto_para_retirada: "Teu pedido ficou pronto. Pode retirar no balcão.",
    saiu_para_entrega: "Teu pedido saiu para entrega.",
    entregue: "Pedido entregue. Obrigado por chamar o Insano.",
    finalizado: "Pedido finalizado. Obrigado por chamar o Insano.",
    cancelado: "Tua comanda precisa de atenção da equipe. Vamos te chamar por aqui.",
    erro: "Tivemos um ajuste no pedido. A equipe vai te chamar pelo WhatsApp."
  };
  return messages[status] || `Atualização do teu pedido no ${operation || "SamBah"}: ${status}.`;
}

function buildTrackingWhatsAppUrl(item, message) {
  const phone = String(item.customerPhone || "").replace(/\D/g, "");
  const text = buildTrackingWhatsAppMessage(item, message);
  return phone ? `https://wa.me/55${phone.replace(/^55/, "")}?text=${encodeURIComponent(text)}` : "";
}

function buildTrackingWhatsAppMessage(item, message) {
  const name = item.customerName || "cliente";
  return `Buenas, ${name}!
Atualização do teu pedido no ${item.operation || "SamBah"}:

Status: ${message}

O SamBah segue acompanhando por aqui.`;
}

function isFinalStatus(status = "") {
  return ["entregue", "finalizado", "cancelado"].includes(status);
}
