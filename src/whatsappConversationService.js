import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";
import {
  buildSambahEventMessage,
  buildSambahHumanSupportMessage,
  buildSambahInitialMessage,
  buildSambahMenuMessage,
  buildSambahOrderMessage
} from "./sambahPersonality.js";
import { detectIntent } from "./intentEngine.js";
import { clearActiveFlowPatch, handleActiveFlow } from "./flowManager.js";
import { routeConversation } from "./operationRouter.js";
import { extractWhatsAppMessageText } from "./whatsapp/whatsappWebhookParser.js";

const INTENT_RESPONSES = {
  pedido: buildSambahOrderMessage(),
  delivery: buildSambahOrderMessage(),
  retirada: buildSambahOrderMessage(),
  mesa: buildSambahOrderMessage(),
  evento: buildSambahEventMessage(),
  food_truck: buildSambahEventMessage(),
  corporativo: buildSambahEventMessage(),
  xeriffe: buildSambahEventMessage(),
  reclamacao: buildSambahHumanSupportMessage(),
  humano: buildSambahHumanSupportMessage(),
  cardapio: buildSambahMenuMessage(),
  desconhecido: buildSambahInitialMessage()
};

const HUMAN_INTENTS = new Set(["humano", "reclamacao"]);
const OPPORTUNITY_INTENTS = new Set(["evento", "food_truck", "corporativo", "xeriffe", "reserva", "festa"]);

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

  async recordIncoming(payload = {}, { runtimeConfig = {}, crmService = null } = {}) {
    const incoming = parseWhatsAppIncoming(payload);
    const now = this.now().toISOString();
    const textForIntent = incoming.text || incoming.transcricao || incoming.caption || "";
    const intentEngine = detectIntent(textForIntent);
    const operationRoute = routeConversation(intentEngine);
    const intent = detectWhatsAppIntent(textForIntent);
    const respostaSugerida = suggestedWhatsAppResponse(intent);
    const configStatus = computeConfigStatus(incoming, runtimeConfig);
    const status = configStatus || (HUMAN_INTENTS.has(intent) ? "humano" : "aguardando_equipe");
    const data = await this.#read();
    const id = incoming.telefone ? `wa_${incoming.telefone}` : `wa_${crypto.randomUUID()}`;
    const existing = data.conversas.find((item) => item.id === id || item.telefone === incoming.telefone);
    const message = {
      id: incoming.messageId || `msg_${crypto.randomUUID()}`,
      direction: "in",
      type: incoming.tipo,
      text: incoming.text,
      transcricao: incoming.transcricao,
      mediaId: incoming.mediaId,
      rawType: incoming.rawType,
      createdAt: now,
      status: configStatus || "recebida"
    };
    const base = existing || {
      id,
      nome: incoming.nome || incoming.profileName || "Cliente WhatsApp",
      telefone: incoming.telefone,
      operation: "Insano",
      origem: "whatsapp",
      mensagens: [],
      createdAt: now
    };
    const flowResult = handleActiveFlow({
      conversation: base,
      text: textForIntent,
      intent,
      now: this.now()
    });
    const flowPatch = flowResult?.clearFlow ? clearActiveFlowPatch() : flowResult?.patch || {};
    const flowResponse = flowResult?.responseText || respostaSugerida;
    const updated = {
      ...base,
      nome: base.nome || incoming.nome || incoming.profileName || "Cliente WhatsApp",
      telefone: base.telefone || incoming.telefone,
      ultimaMensagem: incoming.text || incoming.transcricao || describeMessageType(incoming.tipo),
      ultimaInteracao: now,
      updatedAt: now,
      intent: intentEngine.intent,
      intencao: intent,
      intentEngine,
      route: operationRoute,
      currentModule: operationRoute.module,
      nextAction: operationRoute.nextAction,
      status: flowResult?.status || status,
      respostaSugerida: flowResponse,
      configuracaoPendente: Boolean(configStatus),
      audio: incoming.tipo === "audio" ? {
        mediaId: incoming.mediaId,
        transcricao: incoming.transcricao || "",
        status: configStatus || "transcricao_pendente"
      } : base.audio || null,
      ...flowPatch,
      mensagens: [...(base.mensagens || []), message].slice(-60)
    };
    if (existing) {
      data.conversas = data.conversas.map((item) => (item.id === existing.id ? updated : item));
    } else {
      data.conversas.push(updated);
    }
    await this.#write(data);

    if (crmService && incoming.telefone) {
      await updateCrmFromConversation(crmService, updated, incoming, intent);
    }

    return {
      ok: true,
      conversa: this.#withPriority(updated),
      message,
      intent,
      intentEngine,
      operationRoute,
      respostaSugerida: flowResponse,
      sendEnabled: runtimeConfig.whatsappBusiness?.sendEnabled === true,
      voiceReplyEnabled: runtimeConfig.ai?.voiceReplyEnabled === true
    };
  }

  async addOutgoing(id, body = {}, { runtimeConfig = {}, whatsappProvider = null } = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const text = String(body.text || body.message || data.conversas[index].respostaSugerida || "").trim();
    if (!text) return { ok: false, error: "Resposta vazia" };
    const outgoing = await sendOutgoingIfReady({
      conversation: data.conversas[index],
      runtimeConfig,
      whatsappProvider,
      text
    });
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
    const sendResult = body.sendResult || null;
    const sendStatus = body.status || sendResult?.status || "registrada";
    const providerMessageId = sendResult?.response?.messages?.[0]?.id || "";
    const message = {
      id: `msg_${crypto.randomUUID()}`,
      direction: "out",
      type: "text",
      text,
      createdAt: now,
      status: sendStatus,
      providerMessageId,
      httpStatus: sendResult?.httpStatus || null,
      response: sendResult?.response || null
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
      return {
        ...conversation,
        updatedAt: conversationTouched ? now : conversation.updatedAt,
        mensagens: conversationTouched ? nextMessages : messages
      };
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
    return {
      ok: true,
      deleted: true,
      messageId: targetMessageId,
      removed: sanitizeDeletedMessage(removed),
      conversa: this.#withPriority(updated)
    };
  }

  async deleteConversation(id) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, statusCode: 404, error: "conversation_not_found", message: "Conversa nao encontrada" };
    const conversation = data.conversas[index];
    const eligibility = conversationDeletionEligibility(conversation);
    if (!eligibility.canDelete) {
      return {
        ok: false,
        statusCode: 409,
        error: "conversation_not_deletable",
        message: "Conversa ativa ou com vinculo operacional nao pode ser excluida",
        reason: eligibility.reason
      };
    }
    data.conversas.splice(index, 1);
    await this.#write(data);
    return {
      ok: true,
      deleted: true,
      conversationId: conversation.id || id,
      reason: eligibility.reason
    };
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
    return {
      ...conversation,
      tempoParadoMinutos: minutes,
      prioridade,
      whatsappUrl: conversation.telefone ? `https://wa.me/${conversation.telefone}` : null
    };
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
      if (messages.some((message) => message.id === messageId)) continue;
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
      const intent = detectWhatsAppIntent(text);
      const intentEngine = detectIntent(text);
      const operationRoute = routeConversation(intentEngine);
      const base = existing || {
        id,
        nome: historyMessage.customerName || "Cliente WhatsApp",
        telefone: phone,
        operation: "Insano",
        origem: "whatsapp",
        mensagens: [],
        createdAt: historyMessage.createdAt
      };
      const updatedMessages = [...messages, message]
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(-60);
      const lastInbound = [...updatedMessages].reverse().find((item) => item.direction === "in");
      const lastMessage = updatedMessages[updatedMessages.length - 1];
      const updated = {
        ...base,
        nome: base.nome || historyMessage.customerName || "Cliente WhatsApp",
        telefone: base.telefone || phone,
        ultimaMensagem: lastInbound?.text || lastMessage?.text || "Mensagem recebida",
        ultimaInteracao: lastInbound?.createdAt || lastMessage?.createdAt || historyMessage.createdAt,
        updatedAt: lastMessage?.createdAt || historyMessage.createdAt,
        intent: base.intent || intentEngine.intent,
        intencao: base.intencao || intent,
        intentEngine: base.intentEngine || intentEngine,
        route: base.route || operationRoute,
        currentModule: base.currentModule || operationRoute.module,
        nextAction: base.nextAction || operationRoute.nextAction,
        status: base.status || (HUMAN_INTENTS.has(intent) ? "humano" : "aguardando_equipe"),
        respostaSugerida: base.respostaSugerida || suggestedWhatsAppResponse(intent),
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
  const text = String(metaMessage
    ? extractWhatsAppMessageText(metaMessage, payload)
    : source.message || source.text || source.body || payload.message || payload.text || "").trim();
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

export function detectWhatsAppIntent(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return "desconhecido";
  if (hasAny(normalized, ["reclamacao", "reclamar", "problema", "errado", "atrasou", "ruim"])) return "reclamacao";
  if (hasAny(normalized, ["humano", "atendente", "falar com pessoa", "falar com alguem", "neno", "kazuko", "responsavel"])) return "humano";
  if (hasAny(normalized, ["delivery", "entrega", "entregar"])) return "delivery";
  if (hasAny(normalized, ["retirada", "retirar", "buscar", "pegar"])) return "retirada";
  if (hasAny(normalized, ["estou no local", "mesa", "minha mesa", "na mesa"])) return "mesa";
  if (hasAny(normalized, ["food truck", "foodtruck", "truck"])) return "food_truck";
  if (hasAny(normalized, ["corporativo", "empresa", "coffee", "ativacao", "feira"])) return "corporativo";
  if (hasAny(normalized, ["xeriffe", "obirici"])) return "xeriffe";
  if (hasAny(normalized, ["reserva", "reservar"])) return "reserva";
  if (hasAny(normalized, ["festa"])) return "festa";
  if (hasAny(normalized, ["evento", "casamento", "aniversario", "confraternizacao", "orcamento"])) return "evento";
  if (hasAny(normalized, ["cardapio", "menu", "preco", "valor"])) return "cardapio";
  if (hasAny(normalized, ["pedido", "pedir", "quero", "hamburguer", "burger", "pizza", "batata", "porcao"])) return "pedido";
  return "desconhecido";
}

export function suggestedWhatsAppResponse(intent) {
  return INTENT_RESPONSES[intent] || INTENT_RESPONSES.desconhecido;
}

function normalizeMessageType(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (["text", "audio", "image", "video", "document", "interactive", "button", "order"].includes(normalized)) return normalized;
  return "unknown";
}

function computeConfigStatus(incoming, runtimeConfig) {
  const business = runtimeConfig.whatsappBusiness || {};
  const ai = runtimeConfig.ai || {};
  if (incoming.tipo === "audio" && !business.accessToken) return "pendente_configuracao";
  if (incoming.tipo === "audio" && !ai.hasTranscriptionCredentials) return "pendente_configuracao";
  return "";
}

async function updateCrmFromConversation(crmService, conversation, incoming, intent) {
  const payload = {
    nome: conversation.nome || "Cliente WhatsApp",
    whatsapp: conversation.telefone,
    origem: "whatsapp",
    canal: "whatsapp",
    message: incoming.text || incoming.transcricao || describeMessageType(incoming.tipo),
    interesse: intent,
    pipeline: OPPORTUNITY_INTENTS.has(intent) ? "atendimento_whatsapp" : "atendimento_humano",
    status: conversation.status
  };
  try {
    await crmService.registrarAtendimentoComercial(payload);
  } catch {
    // O webhook nao pode cair por falha secundaria de CRM.
  }
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
  return {
    id: message.id || "",
    direction: message.direction || "",
    type: message.type || "",
    createdAt: message.createdAt || ""
  };
}

function normalizeHistoryStatus(message = {}) {
  if (message.direction === "out" && message.status === "missing_meta_config") return "nao_enviada_configuracao_meta";
  if (message.direction === "out") return message.status || "registrada";
  return message.status || "recebida";
}

async function sendOutgoingIfReady({ conversation = {}, runtimeConfig = {}, whatsappProvider = null, text = "" } = {}) {
  const enabled = runtimeConfig.whatsappBusiness?.sendEnabled === true;
  const hasCredentials = Boolean(runtimeConfig.whatsappBusiness?.accessToken && runtimeConfig.whatsappBusiness?.phoneNumberId);
  const canSend = Boolean(enabled && hasCredentials && whatsappProvider && conversation.telefone);
  if (canSend) {
    const sendResult = await whatsappProvider.sendText({ to: conversation.telefone, text });
    return {
      sendResult,
      status: sendResult?.status || "envio_real_indisponivel",
      conversationStatus: sendResult?.sent ? "aguardando_cliente" : conversation.status
    };
  }
  return {
    sendResult: null,
    status: enabled && hasCredentials ? "envio_real_indisponivel" : "registrada_sem_envio",
    conversationStatus: enabled && !hasCredentials ? "erro_configuracao" : conversation.status
  };
}

function conversationDeletionEligibility(conversation = {}) {
  const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
  const status = normalizeText(conversation.status || "");
  const origem = normalizeText(conversation.origem || conversation.source || "");
  const hasOperationalLink = Boolean(conversation.currentModule || conversation.nextAction || conversation.route?.module || conversation.intentEngine?.intent !== "unknown" && conversation.intentEngine?.intent);
  if (messages.length === 0) return { canDelete: true, reason: "sem_mensagens" };
  if (conversation.teste === true || conversation.test === true || status === "teste" || origem === "teste") return { canDelete: true, reason: "marcada_como_teste" };
  if (["arquivada", "arquivado", "inativa", "inativo"].includes(status)) return { canDelete: true, reason: "inativa_ou_arquivada" };
  if (!hasOperationalLink && ["resolvido", "desconhecido"].includes(status)) return { canDelete: true, reason: "sem_vinculo_operacional" };
  return { canDelete: false, reason: "conversa_ativa" };
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return digits.length >= 10 ? `55${digits}` : digits;
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(normalizeText(term)));
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
    errors: Array.isArray(status.errors)
      ? status.errors.map((error) => ({
          code: error.code,
          title: error.title,
          message: error.message,
          error_data: error.error_data
        }))
      : []
  };
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
