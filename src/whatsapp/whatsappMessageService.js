import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseWhatsAppWebhookPayload } from "./whatsappWebhookParser.js";
import { maskWhatsAppPhone, normalizeWhatsAppPhone, sameWhatsAppPhone } from "./phoneNumber.js";

const DEFAULT_SESSIONS_FILE = "data/whatsapp-sessions.json";
const DEFAULT_MESSAGES_FILE = "data/whatsapp-messages.json";

export class WhatsAppMessageService {
  constructor({ provider, sessionsFile = DEFAULT_SESSIONS_FILE, messagesFile = DEFAULT_MESSAGES_FILE, now = () => new Date() } = {}) {
    this.provider = provider;
    this.sessionsFile = sessionsFile;
    this.messagesFile = messagesFile;
    this.now = now;
    this.messageMutationQueue = Promise.resolve();
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
      if (normalized && sameWhatsAppPhone(item.phone, normalized)) return false;
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
    return this.#mutateMessages(async () => {
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
    });
  }

  async handleIncoming(payload) {
    const normalized = parseWhatsAppWebhookPayload(payload);
    const appendResult = await this.appendMessage({ direction: "in", normalized });
    return {
      ok: true,
      provider: this.provider.name,
      normalized,
      duplicate: appendResult.duplicate,
      engine: "disabled",
      reason: "whatsapp_v2_disabled",
      responseText: "",
      sent: false,
      automaticReplyCreated: false
    };
  }

  async findSession(phone) {
    const normalized = normalizePhone(phone);
    const sessions = await this.readSessions();
    return sessions.find((item) => sameWhatsAppPhone(item.phone, normalized)) || null;
  }

  async saveSession(input) {
    const phone = normalizePhone(input.phone);
    if (!phone) return null;
    const now = this.now().toISOString();
    const sessions = await this.readSessions();
    const existing = sessions.find((item) => sameWhatsAppPhone(item.phone, phone));
    const session = {
      phone,
      lastIntent: input.lastIntent || existing?.lastIntent || "",
      draftId: input.draftId || existing?.draftId || "",
      status: input.status || existing?.status || "manual",
      createdAt: existing?.createdAt || input.createdAt || now,
      updatedAt: input.updatedAt || now
    };
    const next = existing ? sessions.map((item) => (sameWhatsAppPhone(item.phone, phone) ? session : item)) : [session, ...sessions];
    await this.writeSessions(next);
    return session;
  }

  async appendMessage({ direction, normalized, text, sendResult }) {
    return this.#mutateMessages(async () => {
      const messages = await this.readMessages();
      const messageId = String(normalized.messageId || "").trim();
      const correlationId = String(normalized.correlationId || "").trim();
      const providerMessageId = String(
        sendResult?.providerMessageId || sendResult?.response?.messages?.[0]?.id || ""
      ).trim();

      if (direction === "in" && messageId) {
        const existing = messages.find((item) => item.direction === "in" && item.messageId === messageId);
        if (existing) return { ok: true, duplicate: true, message: existing };
      }

      if (direction === "out" && (messageId || correlationId || providerMessageId)) {
        const existing = messages.find((item) => (
          item.direction === "out"
          && identifiersOverlap(
            messageIdentifiers(item),
            new Set([messageId, correlationId, providerMessageId].filter(Boolean))
          )
        ));
        if (existing) return { ok: true, duplicate: true, message: existing };
      }

      const message = {
        id: `${direction}_${this.now().getTime()}_${Math.random().toString(16).slice(2)}`,
        direction,
        provider: normalized.provider,
        phone: normalized.from,
        customerName: normalized.customer?.name || "",
        messageId,
        providerMessageId,
        correlationId,
        text: text || normalized.message,
        status: sendResult?.status || (direction === "out" ? "registrada_sem_envio" : "received"),
        httpStatus: sendResult?.httpStatus || null,
        response: sendResult?.response || null,
        errorCode: sendResult?.response?.error?.code || sendResult?.error || "",
        errorMessage: sendResult?.response?.error?.message || sendResult?.error || "",
        createdAt: this.now().toISOString()
      };
      messages.unshift(message);
      await this.writeMessages(messages.slice(0, 200));
      return { ok: true, duplicate: false, message };
    });
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
    let raw = "";
    try {
      raw = await readFile(this.messagesFile, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    try {
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      await this.#quarantineCorruptMessages(error);
      return [];
    }
  }

  async writeMessages(messages) {
    await mkdir(dirname(this.messagesFile), { recursive: true });
    const tempFile = `${this.messagesFile}.write-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
    try {
      await writeFile(tempFile, `${JSON.stringify(messages, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(tempFile, this.messagesFile);
    } catch (error) {
      await unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  async #quarantineCorruptMessages(error) {
    const stamp = this.now().toISOString().replace(/[^0-9]/g, "");
    const quarantineFile = `${this.messagesFile}.corrupt-${stamp}`;
    try {
      await rename(this.messagesFile, quarantineFile);
      console.info("whatsapp.messages.corrupt_quarantined", {
        status: "corrupt_quarantined",
        error: String(error?.message || error)
      });
    } catch (renameError) {
      if (renameError?.code !== "ENOENT") throw renameError;
    }
  }

  async #mutateMessages(operation) {
    const run = this.messageMutationQueue.then(operation, operation);
    this.messageMutationQueue = run.then(() => undefined, () => undefined);
    return run;
  }
}

function sanitizeSession(session = {}) {
  return { ...session, phone: maskPhone(session.phone) };
}

function sanitizeMessage(message = {}) {
  return { ...message, phone: maskPhone(message.phone) };
}

function messageIdentifiers(message = {}) {
  const identifiers = new Set([
    message.id,
    message.messageId,
    message.providerMessageId,
    message.correlationId,
    message.manualSendId
  ].map((value) => String(value || "").trim()).filter(Boolean));
  const responseMessages = Array.isArray(message.response?.messages) ? message.response.messages : [];
  for (const item of responseMessages) {
    const id = String(item?.id || "").trim();
    if (id) identifiers.add(id);
  }
  return identifiers;
}

function identifiersOverlap(left = new Set(), right = new Set()) {
  for (const identifier of left) {
    if (right.has(identifier)) return true;
  }
  return false;
}

function matchesProviderMessageId(message = {}, providerMessageId = "") {
  if (!providerMessageId) return false;
  return messageIdentifiers(message).has(providerMessageId);
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
    errors: Array.isArray(status.errors) ? status.errors.map((error) => ({ code: error.code, title: error.title, message: error.message })) : []
  };
}

function normalizePhone(value = "") {
  return normalizeWhatsAppPhone(value);
}

function maskPhone(value = "") {
  return maskWhatsAppPhone(value);
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
