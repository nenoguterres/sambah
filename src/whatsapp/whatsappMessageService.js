import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildMesaOrder } from "../mesaIntegrationService.js";
import { parseWhatsAppWebhookPayload } from "./whatsappWebhookParser.js";

const DEFAULT_SESSIONS_FILE = "data/whatsapp-sessions.json";
const DEFAULT_MESSAGES_FILE = "data/whatsapp-messages.json";
const CONFIRM_WORDS = new Set(["confirmar", "sim", "pode", "fechar", "manda"]);
const CHANGE_WORDS = new Set(["alterar", "corrigir", "nao", "não"]);

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
    return {
      ok: true,
      total: sessions.length,
      items: sessions.map(sanitizeSession)
    };
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

  async handleIncoming(payload, services = {}) {
    const normalized = parseWhatsAppWebhookPayload(payload);
    await this.appendMessage({ direction: "in", normalized });
    const action = normalizedAction(normalized.message);
    if (action === "confirm") return this.confirmPendingDraft(normalized, services);
    if (action === "change") return this.requestDraftChange(normalized);

    const { conversationService, menuService, draftService, eventService, mesaService, auditService } = services;
    const menuCache = await menuService.cacheSnapshot();
    const classificationPayload = {
      ...normalized.raw,
      source: "whatsapp",
      eventId: normalized.messageId || normalized.raw.eventId,
      from: normalized.from,
      phone: normalized.from,
      message: normalized.message,
      text: normalized.message,
      customer: normalized.customer
    };
    const classification = await conversationService.classify(classificationPayload, menuCache);

    if (classification.intent === "immediate_order") {
      const draft = await draftService.createDraft({
        text: normalized.message,
        customer: normalized.customer,
        source: "WhatsApp / samBah!",
        menu: menuCache
      });
      if (draft.status !== "needs_review") {
        await this.saveSession({
          phone: normalized.from,
          lastIntent: "immediate_order",
          draftId: draft.id,
          status: "awaiting_confirmation"
        });
      }
      await auditService?.record?.({
        type: "whatsapp_order_draft_created",
        status: draft.status === "needs_review" ? "warning" : "info",
        source: "whatsapp",
        message: "Pedido WhatsApp convertido em rascunho aguardando confirmacao",
        context: { draftId: draft.id, messageId: normalized.messageId, status: draft.status },
        dedupeKey: normalized.messageId ? `wa-draft:${normalized.messageId}` : draft.id
      });
      const responseText = draft.status === "needs_review"
        ? autoResponse("needs_review")
        : `Entendi teu pedido assim:\n${formatDraftSummary(draft)}\n\nResponde CONFIRMAR para enviar ou ALTERAR para corrigir.`;
      return this.sendAndReturn(normalized, responseText, { intent: "immediate_order", route: "draft", draft });
    }

    if (classification.intent === "event_lead" || classification.intent === "reservation") {
      const leadResult = await eventService.createLead({
        ...classificationPayload,
        classification,
        source: "whatsapp / samBah!"
      });
      await auditService?.record?.({
        type: "whatsapp_event_lead_created",
        status: "info",
        source: "agenda_insano",
        message: "WhatsApp registrado na Agenda Insano",
        context: { leadId: leadResult.lead.id, intent: classification.intent, route: "agenda_insano" },
        dedupeKey: normalized.messageId ? `wa-event:${normalized.messageId}` : leadResult.lead.id
      });
      return this.sendAndReturn(normalized, autoResponse(classification.intent), {
        intent: classification.intent,
        route: "agenda_insano",
        lead: leadResult.lead
      });
    }

    if (classification.intent === "human_request") {
      const target = classification.assignee === "Kazuko" ? "kazuko" : "neno";
      return this.sendAndReturn(normalized, autoResponse("human_request", { target }), {
        intent: "human_request",
        route: "human",
        assignee: classification.assignee || "geral"
      });
    }

    if (classification.intent === "menu_request") {
      return this.sendAndReturn(normalized, menuResponse(menuCache), {
        intent: "menu_request",
        route: "menu"
      });
    }

    if (classification.intent === "needs_review") {
      await auditService?.record?.({
        type: "whatsapp_needs_review",
        status: "warning",
        source: "whatsapp",
        message: "Mensagem WhatsApp deixada para revisao",
        context: { messageId: normalized.messageId, reason: classification.reason },
        dedupeKey: normalized.messageId ? `wa-review:${normalized.messageId}` : undefined
      });
      return this.sendAndReturn(normalized, autoResponse("needs_review"), {
        intent: "needs_review",
        route: "review"
      });
    }

    return this.sendAndReturn(normalized, classification.responseText || autoResponse("needs_review"), {
      intent: classification.intent,
      route: classification.route
    });
  }

  async confirmPendingDraft(normalized, services) {
    const { draftService, menuService, mesaService, auditService } = services;
    const session = await this.findSession(normalized.from);
    if (!session || session.status !== "awaiting_confirmation" || !session.draftId) {
      return this.sendAndReturn(normalized, autoResponse("needs_review"), {
        intent: "needs_review",
        route: "review",
        confirmation: "not_found"
      });
    }
    const menuCache = await menuService.cacheSnapshot();
    const result = await draftService.confirmDraft(session.draftId, menuCache);
    if (!result.ok) {
      await this.saveSession({ ...session, status: "needs_review" });
      return this.sendAndReturn(normalized, autoResponse("needs_review"), {
        intent: "needs_review",
        route: "review",
        draft: result.draft
      });
    }
    const mesaOrder = buildMesaOrder(result.order);
    const queueEntry = await mesaService.enqueueOrder(mesaOrder);
    const mesaResult = await mesaService.sendOrderToMesa(queueEntry);
    await this.saveSession({ ...session, status: "confirmed", updatedAt: this.now().toISOString() });
    await auditService?.record?.({
      type: "whatsapp_order_confirmed",
      status: mesaResult.ok ? "success" : "warning",
      source: "whatsapp",
      message: mesaResult.ok ? "Pedido WhatsApp confirmado e enviado ao Mesa" : "Pedido WhatsApp confirmado e mantido na fila Mesa",
      context: { draftId: session.draftId, queueId: queueEntry.id, mesaStatus: mesaResult.ok ? "accepted" : "pending" },
      dedupeKey: `wa-confirm:${session.draftId}`
    });
    return this.sendAndReturn(normalized, "Pedido encaminhado! Agora e com a cozinha.", {
      intent: "immediate_order",
      route: "mesa",
      draft: result.draft,
      mesa: { status: mesaResult.ok ? "accepted" : "pending", queueId: queueEntry.id }
    });
  }

  async requestDraftChange(normalized) {
    const session = await this.findSession(normalized.from);
    if (session) await this.saveSession({ ...session, status: "awaiting_change" });
    return this.sendAndReturn(normalized, "Me manda como fica o pedido certinho que eu reorganizo.", {
      intent: "immediate_order",
      route: "draft_change"
    });
  }

  async sendAndReturn(normalized, responseText, extra = {}) {
    const sendResult = await this.provider.sendText({
      to: normalized.from,
      text: responseText,
      metadata: { messageId: normalized.messageId, intent: extra.intent }
    });
    await this.appendMessage({ direction: "out", normalized, text: responseText, sendResult });
    return {
      ok: true,
      provider: this.provider.name,
      normalized,
      responseText,
      whatsapp: sendResult,
      sent: sendResult.sent === true,
      ...extra
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
      status: input.status || existing?.status || "awaiting_confirmation",
      createdAt: existing?.createdAt || input.createdAt || now,
      updatedAt: input.updatedAt || now
    };
    const next = existing
      ? sessions.map((item) => (item.phone === phone ? session : item))
      : [session, ...sessions];
    await this.writeSessions(next);
    return session;
  }

  async appendMessage({ direction, normalized, text, sendResult }) {
    const messages = await this.readMessages();
    messages.unshift({
      id: `${direction}_${this.now().getTime()}_${Math.random().toString(16).slice(2)}`,
      direction,
      provider: normalized.provider,
      phone: normalized.from,
      customerName: normalized.customer?.name || "",
      messageId: normalized.messageId,
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

function normalizedAction(text = "") {
  const normalized = normalizeText(text);
  if (CONFIRM_WORDS.has(normalized)) return "confirm";
  if (CHANGE_WORDS.has(normalized)) return "change";
  return "";
}

function autoResponse(intent, { target } = {}) {
  if (intent === "event_lead") {
    return "Show! Recebi tua solicitacao de evento.\nVou direcionar para a Agenda Insano e a equipe segue contigo.";
  }
  if (intent === "reservation") {
    return "Recebi tua solicitacao para o Xeriffe.\nA equipe confere e segue contigo.";
  }
  if (intent === "human_request" && target === "kazuko") {
    return "Te levo direto para a Kazuko:\nhttps://wa.me/5551997920292";
  }
  if (intent === "human_request") {
    return "Te levo direto para o atendimento:\nhttps://wa.me/5551980413745";
  }
  return "Bah, preciso confirmar melhor isso contigo.\nVou deixar tua mensagem para revisao da equipe.";
}

function menuResponse(menuCache = {}) {
  const items = Array.isArray(menuCache.items) ? menuCache.items : [];
  const available = items.filter((item) => item.available !== false && item.availability?.available !== false).slice(0, 6);
  if (!available.length) return "O cardapio oficial vem do Mesa do Xeriffe. A equipe pode te mandar as opcoes atualizadas por aqui.";
  const lines = available.map((item) => `- ${item.name || item.productId}${Number.isFinite(Number(item.price)) ? `: R$ ${Number(item.price).toFixed(2).replace(".", ",")}` : ""}`);
  return `Cardapio do Mesa agora:\n${lines.join("\n")}`;
}

function formatDraftSummary(draft = {}) {
  const items = Array.isArray(draft.items) ? draft.items : [];
  if (!items.length) return draft.rawText || "Pedido sem itens oficiais encontrados.";
  return items.map((item) => `${item.qty || 1}x ${item.name || item.productId}${item.note ? ` (${item.note})` : ""}`).join("\n");
}

function sanitizeSession(session = {}) {
  return {
    ...session,
    phone: maskPhone(session.phone)
  };
}

function sanitizeMessage(message = {}) {
  return {
    ...message,
    phone: maskPhone(message.phone)
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

function normalizeText(value = "") {
  return String(value)
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
