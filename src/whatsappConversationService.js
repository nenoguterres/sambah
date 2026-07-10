import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";
import { extractWhatsAppMessageText } from "./whatsapp/whatsappWebhookParser.js";

export class WhatsAppConversationService {
  constructor({ filePath, messagesFile = "", now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.messagesFile = messagesFile;
    this.now = now;
  }

  async list() {
    const data = await this.#syncFromMessageHistory(await this.#read());
    const conversations = data.conversas.map((item) => this.#withPriority(item));
    return {
      ok: true,
      count: conversations.length,
      items: conversations.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    };
  }

  async get(id) {
    const data = await this.#read();
    const conversation = data.conversas.find((item) => item.id === id || item.telefone === normalizePhone(id));
    return conversation ? { ok: true, conversa: this.#withPriority(conversation) } : { ok: false, error: "Conversa nao encontrada" };
  }

  async recordIncoming(payload = {}) {
    const incoming = parseWhatsAppIncoming(payload);
    return this.recordNeutralIncoming(incoming);
  }

  async recordNeutralIncoming(incoming = {}) {
    const now = this.now().toISOString();
    const data = await this.#read();
    const telefone = normalizePhone(incoming.telefone || incoming.from || incoming.phone || "");
    const id = telefone ? `wa_${telefone}` : `wa_${crypto.randomUUID()}`;
    const existing = data.conversas.find((item) => item.id === id || item.telefone === telefone);
    const text = String(incoming.text || incoming.message || incoming.transcricao || "").trim();
    const incomingMessageId = String(incoming.messageId || "").trim();
    const existingMessage = incomingMessageId && Array.isArray(existing?.mensagens)
      ? existing.mensagens.find((item) => item.id === incomingMessageId)
      : null;
    if (existingMessage) {
      return {
        ok: true,
        duplicate: true,
        conversa: this.#withPriority(existing),
        message: existingMessage,
        engine: "disabled",
        automaticReplyCreated: false
      };
    }
    const message = {
      id: incomingMessageId || `msg_${crypto.randomUUID()}`,
      direction: "in",
      type: incoming.tipo || incoming.type || "text",
      text,
      transcricao: incoming.transcricao || "",
      mediaId: incoming.mediaId || "",
      rawType: incoming.rawType || incoming.type || "text",
      createdAt: now,
      status: "recebida"
    };
    const base = existing || {
      id,
      nome: incoming.nome || incoming.profileName || "Cliente WhatsApp",
      telefone,
      operation: "Insano",
      origem: "whatsapp",
      mensagens: [],
      createdAt: now
    };
    const updated = {
      ...base,
      nome: base.nome || incoming.nome || incoming.profileName || "Cliente WhatsApp",
      telefone: base.telefone || telefone,
      ultimaMensagem: text || describeMessageType(message.type),
      ultimaInteracao: now,
      updatedAt: now,
      status: base.status || "aguardando_equipe",
      respostaSugerida: "",
      automaticReplyCreated: false,
      whatsappEngine: "disabled",
      mensagens: [...(base.mensagens || []), message].slice(-60)
    };
    if (existing) data.conversas = data.conversas.map((item) => (item.id === existing.id ? updated : item));
    else data.conversas.push(updated);
    await this.#write(data);
    return {
      ok: true,
      conversa: this.#withPriority(updated),
      message,
      engine: "disabled",
      automaticReplyCreated: false
    };
  }

  async addOutgoing(id, body = {}, { runtimeConfig = {}, whatsappProvider = null } = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const text = String(body.text || body.message || "").trim();
    if (!text) return { ok: false, error: "Resposta vazia" };
    const outgoing = await sendOutgoingIfReady({ conversation: data.conversas[index], runtimeConfig, whatsappProvider, text });
    const message = {
      id: `msg_${crypto.randomUUID()}`,
      direction: "out",
      type: "text",
      text,
      createdAt: now,
      status: outgoing.status,
      httpStatus: outgoing.sendResult?.httpStatus || null,
      response: outgoing.sendResult?.response || null
    };
    const updated = {
      ...data.conversas[index],
      status: outgoing.conversationStatus || data.conversas[index].status,
      ultimaInteracao: now,
      updatedAt: now,
      mensagens: [...(data.conversas[index].mensagens || []), message].slice(-60)
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, enviado: Boolean(outgoing.sendResult?.sent), reason: outgoing.status, sendResult: outgoing.sendResult, conversa: this.#withPriority(updated), message };
  }

  async recordOutgoing(id, body = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const text = String(body.text || body.message || "").trim();
    if (!text) return { ok: false, error: "Resposta vazia" };
    const correlationId = String(body.correlationId || "").trim();
    if (correlationId) {
      const existing = (data.conversas[index].mensagens || []).find((message) => message.direction === "out" && message.correlationId === correlationId);
      if (existing) return { ok: true, duplicate: true, enviado: existing.status === "sent", reason: existing.status, conversa: this.#withPriority(data.conversas[index]), message: existing };
    }
    const sendResult = body.sendResult || null;
    const sendStatus = body.status || sendResult?.status || "registrada";
    const providerMessageId = sendResult?.providerMessageId || sendResult?.response?.messages?.[0]?.id || "";
    const message = {
      id: `msg_${crypto.randomUUID()}`,
      direction: "out",
      type: "text",
      text,
      createdAt: now,
      status: sendStatus,
      correlationId,
      providerMessageId,
      httpStatus: sendResult?.httpStatus || null,
      response: sendResult?.response || null,
      metaMessageType: sendResult?.metaMessageType || body.metaMessageType || "",
      fallbackUsed: Boolean(sendResult?.fallbackUsed)
    };
    const updated = {
      ...data.conversas[index],
      status: sendResult?.sent ? "aguardando_cliente" : data.conversas[index].status,
      ultimaInteracao: now,
      updatedAt: now,
      mensagens: [...(data.conversas[index].mensagens || []), message].slice(-60)
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, enviado: Boolean(sendResult?.sent), reason: sendStatus, conversa: this.#withPriority(updated), message };
  }

  async recordMetaStatus(status = {}) {
    const providerMessageId = String(status.id || "").trim();
    if (!providerMessageId) return { ok: false, updated: false, reason: "missing_status_id" };
    const recipientPhone = normalizePhone(status.recipient_id || status.recipientId || "");
    const data = await this.#read();
    let updated = false;
    const now = this.now().toISOString();
    data.conversas = data.conversas.map((conversation) => {
      const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
      const hasPhoneMatch = recipientPhone && normalizePhone(conversation.telefone) === recipientPhone;
      let conversationTouched = false;
      const nextMessages = messages.map((message) => {
        if (!matchesProviderMessageId(message, providerMessageId)) return message;
        conversationTouched = true;
        return {
          ...message,
          status: status.status || message.status,
          providerMessageId,
          recipientId: status.recipient_id || message.recipientId || "",
          deliveredAt: status.status === "delivered" ? metaTimestamp(status.timestamp) : message.deliveredAt || null,
          readAt: status.status === "read" ? metaTimestamp(status.timestamp) : message.readAt || null,
          failedAt: status.status === "failed" ? metaTimestamp(status.timestamp) : message.failedAt || null,
          statusUpdatedAt: now,
          statusPayload: sanitizeMetaStatus(status)
        };
      });
      if (!conversationTouched && !hasPhoneMatch) return conversation;
      updated = true;
      return { ...conversation, updatedAt: conversationTouched ? now : conversation.updatedAt, mensagens: conversationTouched ? nextMessages : messages };
    });
    if (updated) await this.#write(data);
    return { ok: true, updated, providerMessageId, status: status.status || "" };
  }

  async markHuman(id) {
    return this.#updateStatus(id, "humano");
  }

  async markResolved(id) {
    return this.#updateStatus(id, "resolvido");
  }

  async patchConversation(id, patch = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const allowedPatch = {
      assignedOperatorPhone: patch.assignedOperatorPhone || data.conversas[index].assignedOperatorPhone || "",
      assignedOperatorName: patch.assignedOperatorName || data.conversas[index].assignedOperatorName || "",
      callCenterStatus: patch.callCenterStatus || data.conversas[index].callCenterStatus || "",
      updatedAt: now
    };
    data.conversas[index] = { ...data.conversas[index], ...allowedPatch };
    await this.#write(data);
    return { ok: true, conversa: this.#withPriority(data.conversas[index]) };
  }

  async deleteMessage(id, messageId) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const targetMessageId = String(messageId || "").trim();
    if (!targetMessageId) return { ok: false, error: "Mensagem nao informada" };
    const conversation = data.conversas[index];
    const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
    const removed = messages.find((message) => message.id === targetMessageId);
    if (!removed) return { ok: false, error: "Mensagem nao encontrada" };
    const nextMessages = messages.filter((message) => message.id !== targetMessageId);
    const lastInbound = [...nextMessages].reverse().find((message) => message.direction === "in");
    const lastMessage = nextMessages[nextMessages.length - 1];
    const now = this.now().toISOString();
    const updated = {
      ...conversation,
      mensagens: nextMessages,
      ultimaMensagem: lastInbound?.text || lastInbound?.transcricao || lastMessage?.text || describeMessageType(lastMessage?.type) || "",
      ultimaInteracao: now,
      updatedAt: now
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, deleted: true, messageId: targetMessageId, removed: sanitizeDeletedMessage(removed), conversa: this.#withPriority(updated) };
  }

  async deleteConversation(id) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, statusCode: 404, error: "conversation_not_found", message: "Conversa nao encontrada" };
    const conversation = data.conversas[index];
    const eligibility = conversationDeletionEligibility(conversation);
    if (!eligibility.canDelete) {
      return { ok: false, statusCode: 409, error: "conversation_not_deletable", message: "Conversa ativa nao pode ser excluida", reason: eligibility.reason };
    }
    data.conversas.splice(index, 1);
    await this.#write(data);
    return { ok: true, deleted: true, conversationId: conversation.id || id, reason: eligibility.reason };
  }

  async #updateStatus(id, status) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    data.conversas[index] = { ...data.conversas[index], status, updatedAt: now };
    await this.#write(data);
    return { ok: true, conversa: this.#withPriority(data.conversas[index]) };
  }

  #withPriority(conversation) {
    const last = new Date(conversation.ultimaInteracao || conversation.updatedAt || conversation.createdAt || this.now()).getTime();
    const minutes = Math.max(0, Math.floor((this.now().getTime() - last) / 60000));
    let prioridade = "normal";
    if (conversation.status === "resolvido") prioridade = "baixa";
    else if (minutes >= 120) prioridade = "risco_de_perda";
    else if (minutes >= 30) prioridade = "alta";
    else if (minutes >= 15) prioridade = "media";
    else if (minutes >= 5) prioridade = "atencao";
    return { ...conversation, tempoParadoMinutos: minutes, prioridade, whatsappUrl: conversation.telefone ? `https://wa.me/${conversation.telefone}` : null };
  }

  async #read() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "{}");
      return { conversas: Array.isArray(parsed.conversas) ? parsed.conversas : [] };
    } catch (error) {
      if (error.code === "ENOENT") return { conversas: [] };
      throw error;
    }
  }

  async #write(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async #syncFromMessageHistory(data) {
    if (!this.messagesFile) return data;
    const history = await this.#readMessageHistory();
    if (!history.length) return data;
    const next = { conversas: [...data.conversas] };
    let changed = false;
    const ordered = history
      .filter((message) => message && message.phone && message.createdAt)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const historyMessage of ordered) {
      const phone = normalizePhone(historyMessage.phone);
      if (!phone) continue;
      const id = `wa_${phone}`;
      const index = next.conversas.findIndex((item) => item.id === id || item.telefone === phone);
      const existing = index >= 0 ? next.conversas[index] : null;
      const messages = Array.isArray(existing?.mensagens) ? existing.mensagens : [];
      const messageId = historyMessage.id || historyMessage.messageId || `history_${historyMessage.createdAt}_${phone}`;
      if (messages.some((message) => sameInboundHistoryMessage(message, historyMessage, messageId))) continue;
      const text = String(historyMessage.text || "").trim();
      const message = {
        id: messageId,
        direction: historyMessage.direction === "out" ? "out" : "in",
        type: "text",
        text,
        transcricao: "",
        mediaId: "",
        rawType: "text",
        createdAt: historyMessage.createdAt,
        status: normalizeHistoryStatus(historyMessage)
      };
      const base = existing || {
        id,
        nome: historyMessage.customerName || "Cliente WhatsApp",
        telefone: phone,
        operation: "Insano",
        origem: "whatsapp",
        mensagens: [],
        createdAt: historyMessage.createdAt
      };
      const updatedMessages = [...messages, message].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-60);
      const lastInbound = [...updatedMessages].reverse().find((item) => item.direction === "in");
      const lastMessage = updatedMessages[updatedMessages.length - 1];
      const updated = {
        ...base,
        nome: base.nome || historyMessage.customerName || "Cliente WhatsApp",
        telefone: base.telefone || phone,
        ultimaMensagem: lastInbound?.text || lastMessage?.text || "Mensagem recebida",
        ultimaInteracao: lastInbound?.createdAt || lastMessage?.createdAt || historyMessage.createdAt,
        updatedAt: lastMessage?.createdAt || historyMessage.createdAt,
        status: base.status || "aguardando_equipe",
        respostaSugerida: base.respostaSugerida || "",
        automaticReplyCreated: false,
        whatsappEngine: "disabled",
        configuracaoPendente: Boolean(base.configuracaoPendente),
        audio: base.audio || null,
        mensagens: updatedMessages
      };
      if (index >= 0) next.conversas[index] = updated;
      else next.conversas.push(updated);
      changed = true;
    }
    if (changed) await this.#write(next);
    return next;
  }

  async #readMessageHistory() {
    try {
      const raw = await readFile(this.messagesFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
}

export function parseWhatsAppIncoming(payload = {}) {
  const metaMessage = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const contact = payload.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
  const source = metaMessage || payload;
  const rawType = source.type || payload.messageType || "text";
  const tipo = normalizeMessageType(rawType);
  const text = String(metaMessage ? extractWhatsAppMessageText(metaMessage, payload) : source.message || source.text || source.body || payload.message || payload.text || "").trim();
  const audio = source.audio || payload.audio || {};
  return {
    messageId: source.id || payload.eventId || payload.messageId || "",
    telefone: normalizePhone(source.from || payload.from || payload.phone || payload.telefone || ""),
    nome: payload.name || payload.nome || contact?.profile?.name || "",
    profileName: contact?.profile?.name || "",
    tipo,
    rawType,
    text,
    caption: source.image?.caption || source.document?.caption || payload.caption || "",
    mediaId: audio.id || payload.media_id || payload.mediaId || "",
    transcricao: payload.transcription || payload.transcricao || ""
  };
}

function normalizeMessageType(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (["text", "audio", "image", "video", "document", "interactive", "button", "order"].includes(normalized)) return normalized;
  return "unknown";
}

function describeMessageType(type) {
  if (!type) return "";
  if (type === "audio") return "Audio recebido";
  if (type === "image") return "Imagem recebida";
  if (type === "document") return "Documento recebido";
  if (type === "interactive") return "Mensagem interativa recebida";
  return "Mensagem recebida";
}

function sanitizeDeletedMessage(message = {}) {
  return { id: message.id || "", direction: message.direction || "", type: message.type || "", createdAt: message.createdAt || "" };
}

function normalizeHistoryStatus(message = {}) {
  if (message.direction === "out" && message.status === "missing_meta_config") return "nao_enviada_configuracao_meta";
  if (message.direction === "out") return message.status || "registrada";
  return message.status || "recebida";
}

function sameInboundHistoryMessage(message = {}, historyMessage = {}, messageId = "") {
  if (message.id === messageId) return true;
  const historyProviderId = String(historyMessage.messageId || historyMessage.providerMessageId || "").trim();
  if (!historyProviderId || message.direction === "out") return false;
  return message.id === historyProviderId || message.messageId === historyProviderId || message.providerMessageId === historyProviderId;
}

async function sendOutgoingIfReady({ conversation = {}, runtimeConfig = {}, whatsappProvider = null, text = "" } = {}) {
  const enabled = runtimeConfig.whatsappBusiness?.sendEnabled === true;
  const hasCredentials = Boolean(runtimeConfig.whatsappBusiness?.accessToken && runtimeConfig.whatsappBusiness?.phoneNumberId);
  const canSend = Boolean(enabled && hasCredentials && whatsappProvider && conversation.telefone);
  if (canSend) {
    const sendResult = await whatsappProvider.sendText({ to: conversation.telefone, text });
    return { sendResult, status: sendResult?.status || "envio_real_indisponivel", conversationStatus: sendResult?.sent ? "aguardando_cliente" : conversation.status };
  }
  return { sendResult: null, status: enabled && hasCredentials ? "envio_real_indisponivel" : "registrada_sem_envio", conversationStatus: enabled && !hasCredentials ? "erro_configuracao" : conversation.status };
}

function conversationDeletionEligibility(conversation = {}) {
  const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
  const status = normalizeText(conversation.status || "");
  const origem = normalizeText(conversation.origem || conversation.source || "");
  if (messages.length === 0) return { canDelete: true, reason: "sem_mensagens" };
  if (conversation.teste === true || conversation.test === true || status === "teste" || origem === "teste") return { canDelete: true, reason: "marcada_como_teste" };
  if (["arquivada", "arquivado", "inativa", "inativo"].includes(status)) return { canDelete: true, reason: "inativa_ou_arquivada" };
  if (["resolvido", "desconhecido"].includes(status)) return { canDelete: true, reason: "sem_vinculo_operacional" };
  return { canDelete: false, reason: "conversa_ativa" };
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return digits.length >= 10 ? `55${digits}` : digits;
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

function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
