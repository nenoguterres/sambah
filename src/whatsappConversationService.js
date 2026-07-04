import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";
import { extractWhatsAppMessageText } from "./whatsapp/whatsappWebhookParser.js";

const INTENT_RESPONSES = {
  pedido: "Perfeito. Tu quer delivery, retirada ou esta no local?",
  delivery: "Me passa teu nome, bairro/endereco e o que deseja pedir.",
  retirada: "Me passa teu nome, telefone, horario de retirada e o que deseja pedir.",
  mesa: "Me informa o numero da mesa e o que deseja pedir.",
  evento: "Perfeito. Me passa data, local e numero aproximado de pessoas.",
  food_truck: "Legal. Para montar a proposta do food truck, preciso de data, cidade, horario e quantidade de pessoas.",
  corporativo: "Perfeito. Me informa empresa, data, local, quantidade de pessoas e tipo de evento.",
  xeriffe: "Buenas! Voce quer reservar mesa, fazer uma festa ou ver o cardapio do Xeriffe?",
  reclamacao: "Entendi. Vou chamar alguem da equipe para resolver isso com atencao.",
  humano: "Claro. Vou encaminhar para uma pessoa da equipe.",
  cardapio: "Te mando o cardapio. Voce quer pedir agora ou so consultar as opcoes?",
  desconhecido: "Nao quero te enrolar. Pode me dizer se e pedido, evento, food truck, empresa ou Xeriffe?"
};

const HUMAN_INTENTS = new Set(["humano", "reclamacao"]);
const OPPORTUNITY_INTENTS = new Set(["evento", "food_truck", "corporativo", "xeriffe", "reserva", "festa"]);

export class WhatsAppConversationService {
  constructor({ filePath, now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
  }

  async list() {
    const data = await this.#read();
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
    const updated = {
      ...base,
      nome: base.nome || incoming.nome || incoming.profileName || "Cliente WhatsApp",
      telefone: base.telefone || incoming.telefone,
      ultimaMensagem: incoming.text || incoming.transcricao || describeMessageType(incoming.tipo),
      ultimaInteracao: now,
      updatedAt: now,
      intencao: intent,
      status,
      respostaSugerida,
      configuracaoPendente: Boolean(configStatus),
      audio: incoming.tipo === "audio" ? {
        mediaId: incoming.mediaId,
        transcricao: incoming.transcricao || "",
        status: configStatus || "transcricao_pendente"
      } : base.audio || null,
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
      respostaSugerida,
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
    const enabled = runtimeConfig.whatsappBusiness?.sendEnabled === true;
    const hasCredentials = Boolean(runtimeConfig.whatsappBusiness?.accessToken && runtimeConfig.whatsappBusiness?.phoneNumberId);
    const canSend = enabled && hasCredentials && whatsappProvider && data.conversas[index].telefone;
    const sendResult = canSend
      ? await whatsappProvider.sendText({ to: data.conversas[index].telefone, text })
      : null;
    const sendStatus = sendResult
      ? sendResult.status
      : enabled && hasCredentials
        ? "envio_real_indisponivel"
        : "registrada_sem_envio";
    const message = {
      id: `msg_${crypto.randomUUID()}`,
      direction: "out",
      type: "text",
      text,
      createdAt: now,
      status: sendStatus,
      httpStatus: sendResult?.httpStatus || null,
      response: sendResult?.response || null
    };
    const updated = {
      ...data.conversas[index],
      status: sendResult?.sent ? "aguardando_cliente" : enabled && !hasCredentials ? "erro_configuracao" : data.conversas[index].status,
      ultimaInteracao: now,
      updatedAt: now,
      mensagens: [...(data.conversas[index].mensagens || []), message].slice(-60)
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, enviado: Boolean(sendResult?.sent), reason: sendStatus, sendResult, conversa: this.#withPriority(updated), message };
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
  const completedOrder = extractCompletedOrderFromConversation(conversation, incoming);
  if (completedOrder) {
    try {
      await crmService.salvarPrecomanda({
        ...completedOrder,
        origem: "whatsapp",
        source: "whatsapp",
        canal: "whatsapp",
        channel: "whatsapp",
        operacao: "SamBah",
        pipeline: "pedido_whatsapp",
        status: completedOrder.pagamento ? "novo" : "aguardando_pagamento",
        proximo_passo: completedOrder.pagamento ? "Conferir pedido e confirmar com cliente" : "Confirmar forma de pagamento"
      });
    } catch {
      // O webhook nao pode cair por falha secundaria de CRM.
    }
    return;
  }
  if (intent === "pedido") return;
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

function extractCompletedOrderFromConversation(conversation = {}, incoming = {}) {
  const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
  if (!messages.length) return null;
  const currentIndex = findCurrentMessageIndex(messages, incoming);
  const previousOut = previousOutboundText(messages, currentIndex);
  if (!normalizeText(previousOut).includes("ja anotei a ideia do pedido")) return null;
  const promptIndex = findLastOrderPromptIndex(messages, currentIndex);
  if (promptIndex < 0) return null;
  const answers = messages
    .slice(promptIndex + 1, currentIndex + 1)
    .filter((message) => message?.direction === "in")
    .map((message) => String(message.text || message.transcricao || "").trim())
    .filter(Boolean);
  if (answers.length < 3) return null;
  const serviceText = answers[2] || "";
  const serviceType = normalizeOrderServiceType(serviceText);
  if (!serviceType) return null;
  const itemName = answers[1] || "";
  const payment = extractPaymentMethod(answers.slice(2).join(" "));
  return {
    nome: answers[0] || conversation.nome || "Cliente WhatsApp",
    whatsapp: conversation.telefone || incoming.telefone,
    itens: itemName ? [{ nome: itemName, quantidade: 1 }] : [],
    tipo: serviceType,
    type: serviceType,
    pagamento: payment,
    endereco: serviceType === "entrega" ? extractDeliveryAddress(serviceText) : "",
    observacoes: `Pedido iniciado pelo WhatsApp. Mensagens: ${answers.join(" | ")}`,
    mensagem_whatsapp_sugerida: "Pedido recebido pelo SamBah. Conferir itens, pagamento e confirmar com o cliente."
  };
}

function findCurrentMessageIndex(messages = [], incoming = {}) {
  const id = incoming.messageId || "";
  if (id) {
    const index = messages.findIndex((message) => message?.id === id);
    if (index >= 0) return index;
  }
  return messages.length - 1;
}

function previousOutboundText(messages = [], currentIndex = messages.length - 1) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const message = messages[index] || {};
    if (message.direction === "out" && message.text) return message.text;
  }
  return "";
}

function findLastOrderPromptIndex(messages = [], currentIndex = messages.length - 1) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const message = messages[index] || {};
    if (message.direction === "out" && normalizeText(message.text || "").includes("vamos montar teu pedido")) return index;
  }
  return -1;
}

function normalizeOrderServiceType(value = "") {
  const normalized = normalizeText(value);
  if (/\b(delivery|entrega|entregar)\b/.test(normalized)) return "entrega";
  if (/\b(retirada|retirar|busco|buscar)\b/.test(normalized)) return "retirada";
  if (/\b(local|mesa|consumo no local|consumir no local)\b/.test(normalized)) return "local";
  return "";
}

function extractPaymentMethod(value = "") {
  const normalized = normalizeText(value);
  if (/\bpix\b/.test(normalized)) return "pix";
  if (/\bcartao|cartao|credito|debito\b/.test(normalized)) return "cartao";
  if (/\bdinheiro\b/.test(normalized)) return "dinheiro";
  return "";
}

function extractDeliveryAddress(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/\b(delivery|entrega|entregar)\b/gi, "").trim();
}

function describeMessageType(type) {
  if (type === "audio") return "Audio recebido";
  if (type === "image") return "Imagem recebida";
  if (type === "document") return "Documento recebido";
  if (type === "interactive") return "Mensagem interativa recebida";
  return "Mensagem recebida";
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
