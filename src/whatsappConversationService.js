import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";
import { buildSambahAiAudit, classifySambahIntent } from "./intentEngine.js";
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
const ORDER_STATES = new Set([
  "AGUARDANDO_NOME",
  "ENVIADO_PARA_MESA_COMANDA",
  "AGUARDANDO_PEDIDO_MESA",
  "PEDIDO_MESA_RECEBIDO",
  "AGUARDANDO_FORMA_PAGAMENTO",
  "COBRANCA_ENVIADA",
  "PAGAMENTO_CONFIRMADO",
  "A_COBRAR",
  "CANCELADO",
  "HUMANO"
]);

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
    const data = await this.#read();
    const id = incoming.telefone ? `wa_${incoming.telefone}` : `wa_${crypto.randomUUID()}`;
    const existing = data.conversas.find((item) => item.id === id || item.telefone === incoming.telefone);
    const configStatus = computeConfigStatus(incoming, runtimeConfig);
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
    const textForIntent = incoming.text || incoming.transcricao || incoming.caption || "";
    const aiDecision = classifySambahIntent({
      message: textForIntent,
      conversationState: base,
      orderContext: base.mesaPedido || null,
      mesaOrderId: base.mesaPedido?.id || "",
      paymentStatus: base.statusCobranca || "",
      customerName: base.nome || "",
      previousIntent: base.aiDecision?.intent || base.intencao || ""
    });
    const aiAudit = buildSambahAiAudit({
      message: textForIntent,
      conversationState: base,
      previousIntent: base.aiDecision?.intent || base.intencao || ""
    }, aiDecision);
    const intent = mapAiIntentToWhatsAppIntent(aiDecision.intent);
    const respostaSugerida = suggestedWhatsAppResponse(intent);
    const status = configStatus
      || (aiDecision.allowedAction === "NO_ACTION"
        ? (base.status || "aguardando_equipe")
        : HUMAN_INTENTS.has(intent) || aiDecision.allowedAction === "HANDOFF_HUMAN"
          ? "humano"
          : "aguardando_equipe");
    const orderState = nextOrderState(base, incoming, intent);
    const paymentStatus = nextPaymentStatus(base, incoming);
    const updated = {
      ...base,
      nome: base.nome || incoming.nome || incoming.profileName || "Cliente WhatsApp",
      telefone: base.telefone || incoming.telefone,
      ultimaMensagem: incoming.text || incoming.transcricao || describeMessageType(incoming.tipo),
      ultimaInteracao: now,
      updatedAt: now,
      intencao: intent,
      atendimentoEstado: orderState || base.atendimentoEstado || "",
      mesaPedido: base.mesaPedido || null,
      statusCobranca: paymentStatus || base.statusCobranca || "",
      status,
      respostaSugerida,
      aiDecision,
      aiAuditTrail: [...(base.aiAuditTrail || []), {
        ...aiAudit,
        at: now
      }].slice(-20),
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
      aiDecision,
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

  async linkMesaOrder(id, order = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const existingOrder = data.conversas[index].mesaPedido || null;
    const mesaPedido = {
      id: order.id || order.orderId || order.mesaOrderId || order.externalId || `mesa_${crypto.randomUUID()}`,
      nome: order.nome || order.customerName || order.customer?.name || data.conversas[index].nome || "Cliente WhatsApp",
      telefone: normalizePhone(order.telefone || order.whatsapp || order.phone || order.customer?.phone || data.conversas[index].telefone || ""),
      modo: order.modo || order.mode || order.tipo || order.type || order.customer?.serviceType || "",
      total: order.total ?? order.amount ?? order.valorTotal ?? null,
      origem: "WHATSAPP_SAMBAH",
      statusFinanceiro: normalizeFinancialStatus(order.statusFinanceiro || order.financialStatus || "A_COBRAR"),
      correlationId: order.correlationId || order.sambahAtendimentoId || data.conversas[index].id,
      linkedAt: now
    };
    if (existingOrder?.id === mesaPedido.id) {
      return { ok: true, duplicated: true, conversa: this.#withPriority(data.conversas[index]), mesaPedido: existingOrder };
    }
    const updated = {
      ...data.conversas[index],
      nome: mesaPedido.nome || data.conversas[index].nome,
      telefone: data.conversas[index].telefone || mesaPedido.telefone,
      atendimentoEstado: "PEDIDO_MESA_RECEBIDO",
      mesaPedido,
      statusCobranca: mesaPedido.statusFinanceiro,
      status: "aguardando_cliente",
      ultimaInteracao: now,
      updatedAt: now,
      respostaSugerida: "Boa, teu pedido ja chegou pela Comanda Mesa. Agora me diz a forma de pagamento: Pix, cartao, dinheiro ou a cobrar."
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, conversa: this.#withPriority(updated), mesaPedido };
  }

  async linkMesaOrderByReference(order = {}) {
    const conversationId = order.conversationId || order.sambahConversationId || order.atendimentoId || order.sambahAtendimentoId || "";
    if (conversationId) return this.linkMesaOrder(conversationId, order);

    const phone = normalizePhone(order.telefone || order.whatsapp || order.phone || order.customer?.phone || "");
    if (!phone) return { ok: false, error: "conversation_reference_required" };

    const data = await this.#read();
    const matches = data.conversas.filter((item) => item.telefone === phone);
    if (matches.length !== 1) {
      return {
        ok: false,
        error: matches.length > 1 ? "conversation_reference_ambiguous" : "conversation_not_found",
        phone
      };
    }
    return this.linkMesaOrder(matches[0].id, order);
  }

  async recordSambahPayCharge(id, payment = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const updated = {
      ...data.conversas[index],
      atendimentoEstado: "COBRANCA_ENVIADA",
      statusCobranca: "COBRANCA_ENVIADA",
      sambahPay: {
        paymentId: payment.id || payment.payment_id || "",
        status: payment.status || "pending",
        amount: payment.amount ?? null,
        createdAt: payment.createdAt || now
      },
      status: "aguardando_cliente",
      ultimaInteracao: now,
      updatedAt: now
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, conversa: this.#withPriority(updated) };
  }

  async markPaymentConfirmed(id, payment = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || item.telefone === normalizePhone(id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const updated = {
      ...data.conversas[index],
      atendimentoEstado: "PAGAMENTO_CONFIRMADO",
      statusCobranca: "PAGAMENTO_EFETUADO",
      sambahPay: {
        ...(data.conversas[index].sambahPay || {}),
        paymentId: payment.id || payment.payment_id || data.conversas[index].sambahPay?.paymentId || "",
        status: "paid",
        confirmedAt: now
      },
      status: "aguardando_equipe",
      ultimaInteracao: now,
      updatedAt: now
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, conversa: this.#withPriority(updated) };
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

function mapAiIntentToWhatsAppIntent(intent = "") {
  if (intent === "unknown") return "desconhecido";
  if (intent === "reclamar") return "reclamacao";
  if (String(intent).startsWith("pagamento")) return "pagamento";
  return intent || "desconhecido";
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
  if (isOrderConversation(conversation) || intent === "pedido" || ["delivery", "retirada", "mesa"].includes(intent)) return;
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

function nextOrderState(conversation = {}, incoming = {}, intent = "") {
  const current = conversation.atendimentoEstado || "";
  const text = normalizeText(incoming.text || incoming.transcricao || "");
  if (isCancelIntent(text)) return "CANCELADO";
  if (current === "AGUARDANDO_NOME" && text) return "ENVIADO_PARA_MESA_COMANDA";
  if (HUMAN_INTENTS.has(intent)) return current || "HUMANO";
  if (["ENVIADO_PARA_MESA_COMANDA", "AGUARDANDO_PEDIDO_MESA"].includes(current)) return "AGUARDANDO_PEDIDO_MESA";
  if (current === "PEDIDO_MESA_RECEBIDO") {
    if (isPixPaymentText(text)) return "COBRANCA_ENVIADA";
    if (isManualPaymentText(text)) return "A_COBRAR";
    return "AGUARDANDO_FORMA_PAGAMENTO";
  }
  if (current === "AGUARDANDO_FORMA_PAGAMENTO") {
    if (isPixPaymentText(text)) return "COBRANCA_ENVIADA";
    if (isManualPaymentText(text)) return "A_COBRAR";
    return current;
  }
  if (intent === "pedido" || text === "1") return "AGUARDANDO_NOME";
  return current;
}

function nextPaymentStatus(conversation = {}, incoming = {}) {
  const current = conversation.statusCobranca || "";
  const state = conversation.atendimentoEstado || "";
  const text = normalizeText(incoming.text || incoming.transcricao || "");
  if (!["PEDIDO_MESA_RECEBIDO", "AGUARDANDO_FORMA_PAGAMENTO"].includes(state)) return current;
  if (isPixPaymentText(text)) return "COBRANCA_ENVIADA";
  if (isManualPaymentText(text)) return "A_COBRAR";
  return current;
}

function isOrderConversation(conversation = {}) {
  return ORDER_STATES.has(conversation.atendimentoEstado || "");
}

function isPixPaymentText(text = "") {
  return text === "1" || /\bpix\b/.test(text) || text.includes("sambah pay");
}

function isManualPaymentText(text = "") {
  return text === "2" || text === "3" || text === "4" || ["cartao", "credito", "debito", "dinheiro", "a cobrar", "cobrar"].some((term) => text.includes(term));
}

function isCancelIntent(text = "") {
  return ["cancelar", "cancela", "desistir", "deixa pra depois"].some((term) => text.includes(term));
}

function normalizeFinancialStatus(value = "") {
  const normalized = normalizeText(value);
  if (normalized.includes("pagamento efetuado") || normalized.includes("pago") || normalized.includes("paid")) return "PAGAMENTO_EFETUADO";
  return "A_COBRAR";
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
