import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseWhatsAppWebhookPayload } from "./whatsappWebhookParser.js";

const DEFAULT_SESSIONS_FILE = "data/whatsapp-sessions.json";
const DEFAULT_MESSAGES_FILE = "data/whatsapp-messages.json";

export class WhatsAppMessageService {
  constructor({ provider, sessionsFile = DEFAULT_SESSIONS_FILE, messagesFile = DEFAULT_MESSAGES_FILE, now = () => new Date() } = {}) {
    this.provider = provider;
    this.sessionsFile = sessionsFile;
    this.messagesFile = messagesFile;
    this.now = now;
  }

  status() {
    return this.provider.status();
  }

  async sessions() {
    const sessions = await this.readSessions();
    return { ok: true, total: sessions.length, items: sessions.map(sanitizeSession) };
  }

  async clearSession(phone, { draftId = "" } = {}) {
    const normalized = normalizePhone(phone);
    const sessions = await this.readSessions();
    const next = sessions.filter((item) => {
      if (normalized && item.phone === normalized) return false;
      if (draftId && item.draftId === draftId) return false;
      return true;
    });
    await this.writeSessions(next);
    return { ok: true, removed: sessions.length - next.length };
  }

  async history({ limit = 10 } = {}) {
    const messages = await this.readMessages();
    return {
      ok: true,
      total: messages.length,
      received: messages.filter((item) => item.direction === "in").slice(0, limit).map(sanitizeMessage),
      sent: messages.filter((item) => item.direction === "out").slice(0, limit).map(sanitizeMessage)
    };
  }

  async recordMetaStatus(status = {}) {
    const providerMessageId = String(status.id || "").trim();
    if (!providerMessageId) return { ok: false, updated: false, reason: "missing_status_id" };
    const messages = await this.readMessages();
    let updated = false;
    const next = messages.map((message) => {
      if (!matchesProviderMessageId(message, providerMessageId)) return message;
      updated = true;
      return {
        ...message,
        status: status.status || message.status,
        providerMessageId,
        recipientId: status.recipient_id || message.recipientId || "",
        deliveredAt: status.status === "delivered" ? metaTimestamp(status.timestamp) : message.deliveredAt || null,
        readAt: status.status === "read" ? metaTimestamp(status.timestamp) : message.readAt || null,
        failedAt: status.status === "failed" ? metaTimestamp(status.timestamp) : message.failedAt || null,
        statusUpdatedAt: this.now().toISOString(),
        statusPayload: sanitizeMetaStatus(status)
      };
    });
    if (updated) await this.writeMessages(next);
    return { ok: true, updated, providerMessageId, status: status.status || "" };
  }

  async handleIncoming(payload) {
    const normalized = parseWhatsAppWebhookPayload(payload);
    await this.appendMessage({ direction: "in", normalized });
    return {
      ok: true,
      provider: this.provider.name,
      normalized,
      engine: "disabled",
      reason: "whatsapp_engine_disabled",
      responseText: "",
      sent: false,
      automaticReplyCreated: false
    };
  }

  async findSession(phone) {
    const normalized = normalizePhone(phone);
    const sessions = await this.readSessions();
    return sessions.find((item) => item.phone === normalized) || null;
  }

  async saveSession(input) {
    const phone = normalizePhone(input.phone);
    if (!phone) return null;
    const now = this.now().toISOString();
    const sessions = await this.readSessions();
    const existing = sessions.find((item) => item.phone === phone);
    const session = {
      phone,
      lastIntent: input.lastIntent || existing?.lastIntent || "",
      draftId: input.draftId || existing?.draftId || "",
      status: input.status || existing?.status || "manual",
      createdAt: existing?.createdAt || input.createdAt || now,
      updatedAt: input.updatedAt || now
    };
    const next = existing ? sessions.map((item) => (item.phone === phone ? session : item)) : [session, ...sessions];
    await this.writeSessions(next);
    return session;
  }

  async appendMessage({ direction, normalized, text, sendResult }) {
    const messages = await this.readMessages();
    const providerMessageId = sendResult?.response?.messages?.[0]?.id || "";
    messages.unshift({
      id: `${direction}_${this.now().getTime()}_${Math.random().toString(16).slice(2)}`,
      direction,
      provider: normalized.provider,
      phone: normalized.from,
      customerName: normalized.customer?.name || "",
      messageId: normalized.messageId,
      providerMessageId,
      text: text || normalized.message,
      status: sendResult?.status || "received",
      httpStatus: sendResult?.httpStatus || null,
      response: sendResult?.response || null,
      createdAt: this.now().toISOString()
    });
    await this.writeMessages(messages.slice(0, 200));
  }

  async readSessions() {
    try {
      const raw = await readFile(this.sessionsFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.sessions)) return parsed.sessions;
      if (parsed.phone) return [parsed];
      return Object.values(parsed).filter((item) => item && typeof item === "object");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async writeSessions(sessions) {
    await mkdir(dirname(this.sessionsFile), { recursive: true });
    await writeFile(this.sessionsFile, `${JSON.stringify(sessions, null, 2)}\n`, "utf8");
  }

  async readMessages() {
    try {
      const raw = await readFile(this.messagesFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async writeMessages(messages) {
    await mkdir(dirname(this.messagesFile), { recursive: true });
    await writeFile(this.messagesFile, `${JSON.stringify(messages, null, 2)}\n`, "utf8");
  }
}

function sanitizeSession(session = {}) {
  return { ...session, phone: maskPhone(session.phone) };
}

function sanitizeMessage(message = {}) {
  return { ...message, phone: maskPhone(message.phone) };
}

function matchesProviderMessageId(message = {}, providerMessageId = "") {
  if (!providerMessageId) return false;
  if (message.providerMessageId === providerMessageId) return true;
  if (message.messageId === providerMessageId) return true;
  const responseMessages = Array.isArray(message.response?.messages) ? message.response.messages : [];
  return responseMessages.some((item) => item?.id === providerMessageId);
}

function metaTimestamp(value = "") {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function sanitizeMetaStatus(status = {}) {
  return {
    id: status.id || "",
    status: status.status || "",
    timestamp: status.timestamp || "",
    recipient_id: status.recipient_id || "",
    errors: Array.isArray(status.errors) ? status.errors.map((error) => ({ code: error.code, title: error.title, message: error.message, error_data: error.error_data })) : []
  };
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return digits.length >= 10 ? `55${digits}` : digits;
}

function maskPhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : "";
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
