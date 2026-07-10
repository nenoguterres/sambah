import { createWhatsAppV2State } from "./conversationState.js";

export class InMemoryWhatsAppV2ConversationRepository {
  constructor({ operationLog = [] } = {}) {
    this.states = new Map();
    this.messageStatuses = new Map();
    this.operations = operationLog;
  }

  async reserveMessage(messageId) {
    this.operations.push("reserveMessage");
    if (this.messageStatuses.has(messageId)) return false;
    this.messageStatuses.set(messageId, { status: "reserved", updatedAt: new Date().toISOString() });
    return true;
  }

  async get(conversationId) {
    this.operations.push("loadState");
    return structuredClone(this.states.get(conversationId) || createWhatsAppV2State(conversationId));
  }

  async save(state) {
    this.operations.push("saveState");
    this.states.set(state.conversationId, structuredClone(state));
    return structuredClone(state);
  }

  async markMessageProcessed(messageId) {
    this.operations.push("markProcessed");
    this.messageStatuses.set(messageId, { status: "processed", updatedAt: new Date().toISOString() });
  }

  async markMessageFailed(messageId, error) {
    this.operations.push("markFailed");
    this.messageStatuses.set(messageId, { status: "failed", error: String(error?.message || error), updatedAt: new Date().toISOString() });
  }
}

export class InMemoryWhatsAppV2OutboxRepository {
  constructor({ operationLog = [] } = {}) {
    this.items = new Map();
    this.byMessageId = new Map();
    this.sequence = 0;
    this.operations = operationLog;
  }

  async add(entry) {
    this.operations.push("createOutbox");
    const existingId = this.byMessageId.get(entry.messageId);
    if (existingId) return structuredClone(this.items.get(existingId));
    const now = new Date().toISOString();
    const item = {
      id: `wa-v2-outbox-${++this.sequence}`,
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      reply: structuredClone(entry.reply),
      to: entry.to,
      traceId: entry.traceId,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      sentAt: null
    };
    this.items.set(item.id, item);
    this.byMessageId.set(item.messageId, item.id);
    return structuredClone(item);
  }

  async markSending(id) {
    this.operations.push("markSending");
    const item = this.items.get(id);
    if (!item || item.status === "sent" || item.status === "cancelled") return item ? structuredClone(item) : null;
    item.status = "sending";
    item.attempts += 1;
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  }

  async markSent(id) {
    this.operations.push("markOutboxSent");
    const item = this.items.get(id);
    if (!item) return null;
    item.status = "sent";
    item.lastError = null;
    item.updatedAt = new Date().toISOString();
    item.sentAt = item.updatedAt;
    return structuredClone(item);
  }

  async markFailed(id, error) {
    this.operations.push("markOutboxFailed");
    const item = this.items.get(id);
    if (!item) return null;
    item.status = "failed";
    item.lastError = String(error?.message || error);
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  }

  list() {
    return [...this.items.values()].map((item) => structuredClone(item));
  }
}
