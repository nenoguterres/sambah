import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";
import { buildSambahAiAudit, classifySambahIntent } from "./intentEngine.js";
import { resolveConversationFlow } from "./flowManager.js";
import { extractWhatsAppMessageText } from "./whatsapp/whatsappWebhookParser.js";
import { shouldCollectWhatsappOrderItem, summarizeWhatsappOrder } from "./whatsappOrderService.js";

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
const HUMAN_WAIT_MESSAGE = "Já te coloquei para atendimento humano. Aguarda um instante que vamos te responder por aqui.";
const HUMAN_STILL_WAITING_MESSAGE = "To contigo, vivente. Tua conversa segue na fila do atendimento humano. Se quiser continuar comigo, me diz o que tu precisa agora.";
const HUMAN_CANCELLED_MESSAGE = "Feito! Cancelei a espera pelo atendimento humano. Seguimos por aqui. Me diz, o que tu precisa agora?";
const EVENT_DETAILS_RECEIVED_MESSAGE = "Show! Recebi os dados iniciais do evento. Vou deixar isso encaminhado para a equipe montar o orçamento. Se tiver mais algum detalhe importante, pode me mandar por aqui.";
const EVENT_DETAILS_COMPLEMENT_MESSAGE = "Recebi esse complemento do evento. Vou manter tudo junto no atendimento para a equipe seguir contigo.";
const CONVERSATION_MODES = Object.freeze({
  AUTO: "AUTO",
  AGUARDANDO_HUMANO: "AGUARDANDO_HUMANO",
  HUMANO_ASSUMIU: "HUMANO_ASSUMIU"
});
const HUMAN_CANCEL_TERMS = new Set(["cancelar", "cancela", "voltar", "continuar", "sambah"]);
const HUMAN_GREETING_TERMS = new Set(["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "buenas"]);
const HUMAN_AUTO_INTENTS = new Set(["pedido", "cardapio", "pagamento", "evento", "food_truck", "corporativo", "granja"]);
const OPPORTUNITY_INTENTS = new Set(["evento", "food_truck", "corporativo", "xeriffe", "reserva", "festa"]);
const ORDER_STATES = new Set([
  "AGUARDANDO_NOME",
  "COMANDA_EM_ANDAMENTO",
  "COMANDA_PRONTA",
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
const ORDER_CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;
const FLOW_TTL_MS = 30 * 60 * 1000;
const EXPIRABLE_ORDER_STATES = new Set(["AGUARDANDO_NOME", "COMANDA_EM_ANDAMENTO", "COMANDA_PRONTA", "ENVIADO_PARA_MESA_COMANDA", "AGUARDANDO_PEDIDO_MESA"]);
const HARD_RESET_REPLY = "Atendimento reiniciado. Me manda um oi para começarmos de novo.";
const EXPIRED_FLOW_REPLY = "Tu quer continuar o orcamento anterior ou comecar de novo?\n\n1. Continuar orcamento anterior\n2. Comecar novo atendimento\n3. Falar com humano";
const EXPIRED_FLOW_INVALID_REPLY = "Me responde com 1 para continuar o orcamento anterior, 2 para comecar novo atendimento ou 3 para falar com humano.";

export class WhatsAppConversationService {
  constructor({ filePath, now = () => new Date(), orderService = null } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.orderService = orderService;
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
    const conversation = data.conversas.find((item) => item.id === id || phonesMatch(item.telefone, id));
    return conversation ? { ok: true, conversa: this.#withPriority(conversation) } : { ok: false, error: "Conversa nao encontrada" };
  }

  async recordIncoming(payload = {}, { runtimeConfig = {}, crmService = null } = {}) {
    const incoming = parseWhatsAppIncoming(payload);
    const now = this.now().toISOString();
    const data = await this.#read();
    const id = incoming.telefone ? `wa_${incoming.telefone}` : `wa_${crypto.randomUUID()}`;
    const existing = data.conversas.find((item) => item.id === id || phonesMatch(item.telefone, incoming.telefone));
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
    let contextBase = sanitizeProductionFlowState(resetStaleOrderContext(base, now));
    if (contextBase.orderContextExpired && this.orderService) {
      await this.orderService.cancelOrder(base.id, "Contexto de pedido expirado por inatividade").catch(() => null);
    }
    const textForIntent = incoming.text || incoming.transcricao || incoming.caption || "";
    const globalCommand = detectProductionGlobalCommand(textForIntent);
    const beforeFlowLog = summarizeFlowState(contextBase);
    if (globalCommand === "reset") {
      const updated = buildHardResetConversation(contextBase, incoming, message, now);
      if (existing) {
        data.conversas = data.conversas.map((item) => (item.id === existing.id ? updated : item));
      } else {
        data.conversas.push(updated);
      }
      await this.#write(data);
      console.info("whatsapp.production_flow_safety", {
        messageId: message.id,
        from: incoming.telefone,
        normalizedText: normalizeText(textForIntent),
        globalCommand,
        before: beforeFlowLog,
        after: summarizeFlowState(updated),
        reply: HARD_RESET_REPLY
      });
      return {
        ok: true,
        conversa: this.#withPriority(updated),
        message,
        intent: "reset",
        aiDecision: null,
        respostaSugerida: HARD_RESET_REPLY,
        sendEnabled: runtimeConfig.whatsappBusiness?.sendEnabled === true,
        voiceReplyEnabled: runtimeConfig.ai?.voiceReplyEnabled === true
      };
    }
    if (globalCommand === "human") {
      const updated = buildHumanHandoffConversation(contextBase, incoming, message, now);
      if (existing) {
        data.conversas = data.conversas.map((item) => (item.id === existing.id ? updated : item));
      } else {
        data.conversas.push(updated);
      }
      await this.#write(data);
      console.info("whatsapp.production_flow_safety", {
        messageId: message.id,
        from: incoming.telefone,
        normalizedText: normalizeText(textForIntent),
        globalCommand,
        before: beforeFlowLog,
        after: summarizeFlowState(updated),
        reply: HUMAN_WAIT_MESSAGE
      });
      return {
        ok: true,
        conversa: this.#withPriority(updated),
        message,
        intent: "humano",
        aiDecision: buildHumanHandoffAiDecision(),
        respostaSugerida: HUMAN_WAIT_MESSAGE,
        sendEnabled: runtimeConfig.whatsappBusiness?.sendEnabled === true,
        voiceReplyEnabled: runtimeConfig.ai?.voiceReplyEnabled === true
      };
    }
    const contextForExpiredChoice = buildImplicitExpiredFlowDecisionContext(contextBase, textForIntent, now);
    const expiredFlowChoice = await resolvePendingExpiredFlowDecision({
      conversation: contextForExpiredChoice,
      incoming,
      message,
      text: textForIntent,
      now,
      data,
      existing
    });
    if (expiredFlowChoice) {
      await this.#write(expiredFlowChoice.data);
      console.info("whatsapp.production_flow_safety", {
        messageId: message.id,
        from: incoming.telefone,
        normalizedText: normalizeText(textForIntent),
        globalCommand: expiredFlowChoice.globalCommand || globalCommand,
        before: beforeFlowLog,
        after: summarizeFlowState(expiredFlowChoice.conversa),
        reply: expiredFlowChoice.respostaSugerida
      });
      return {
        ok: true,
        conversa: this.#withPriority(expiredFlowChoice.conversa),
        message,
        intent: expiredFlowChoice.intent,
        aiDecision: expiredFlowChoice.aiDecision || null,
        respostaSugerida: expiredFlowChoice.respostaSugerida,
        sendEnabled: runtimeConfig.whatsappBusiness?.sendEnabled === true,
        voiceReplyEnabled: runtimeConfig.ai?.voiceReplyEnabled === true
      };
    }
    const currentMode = normalizeConversationMode(contextBase);
    const preIntentMode = resolvePreIntentMode(currentMode, textForIntent);
    const contextForIntent = withConversationMode(contextBase, preIntentMode.mode);
    const aiDecision = classifySambahIntent({
      message: textForIntent,
      conversationState: contextForIntent,
      orderContext: contextForIntent.mesaPedido || null,
      mesaOrderId: contextForIntent.mesaPedido?.id || "",
      paymentStatus: contextForIntent.statusCobranca || "",
      customerName: contextForIntent.nome || "",
      previousIntent: contextForIntent.aiDecision?.intent || contextForIntent.intencao || ""
    });
    const intent = mapAiIntentToWhatsAppIntent(aiDecision.intent);
    const respostaSugerida = suggestedWhatsAppResponse(intent);
    const modeDecision = resolvePostIntentMode({
      mode: preIntentMode.mode,
      text: textForIntent,
      intent,
      aiDecision,
      preIntentAction: preIntentMode.action
    });
    const isHumanHandoff = modeDecision.mode === CONVERSATION_MODES.AGUARDANDO_HUMANO;
    const status = configStatus
      || (modeDecision.mode === CONVERSATION_MODES.HUMANO_ASSUMIU
        ? (contextBase.status || "aguardando_humano")
        : isHumanHandoff
        ? "aguardando_humano"
        : aiDecision.allowedAction === "NO_ACTION"
          ? (contextBase.status || "aguardando_equipe")
          : "aguardando_equipe");
    const orderState = modeDecision.action === "cancel_human"
      ? ""
      : nextOrderState(contextForIntent, incoming, intent, modeDecision.mode);
    const orderSync = await syncWhatsappOrderFromIncoming({
      orderService: this.orderService,
      conversation: contextForIntent,
      incoming,
      intent,
      orderState,
      aiDecision
    });
    const whatsappOrder = orderSync.order ? summarizeWhatsappOrder(orderSync.order) : contextForIntent.whatsappOrder || null;
    const paymentStatus = nextPaymentStatus(contextForIntent, incoming);
    const flowDecision = resolveConversationFlow({
      conversation: contextForIntent,
      text: textForIntent,
      intent,
      mode: modeDecision.mode,
      now
    });
    const eventQuote = flowDecision.handled
      ? eventQuoteFromActiveFlow(flowDecision.activeFlow, contextForIntent.eventQuote)
      : nextEventQuoteState(contextForIntent, incoming, intent);
    const effectiveConversationState = orderState || humanMetadataState(modeDecision.mode) || aiDecision.conversationState || "";
    const modeAllowsControlledReply = Boolean(modeDecision.reply) && modeDecision.mode !== CONVERSATION_MODES.HUMANO_ASSUMIU;
    const aiDecisionForMode = modeDecision.mode === CONVERSATION_MODES.HUMANO_ASSUMIU
      ? { ...aiDecision, allowedAction: "NO_ACTION" }
      : modeAllowsControlledReply && aiDecision.allowedAction === "NO_ACTION"
        ? { ...aiDecision, allowedAction: "ANSWER_INFO", requiresHuman: modeDecision.mode === CONVERSATION_MODES.AGUARDANDO_HUMANO }
        : aiDecision;
    const persistedAiDecision = {
      ...aiDecisionForMode,
      previousConversationState: aiDecision.conversationState || aiDecision.state || "IDLE",
      conversationState: effectiveConversationState || "IDLE",
      state: effectiveConversationState || "IDLE",
      conversationMode: modeDecision.mode,
      modeReason: modeDecision.reason
    };
    const aiAudit = {
      ...buildSambahAiAudit({
        message: textForIntent,
        conversationState: contextBase,
        previousIntent: contextBase.aiDecision?.intent || contextBase.intencao || ""
      }, persistedAiDecision),
      nextState: effectiveConversationState || "IDLE",
      conversationState: persistedAiDecision.conversationState
    };
    const updated = {
      ...contextBase,
      nome: contextBase.nome || incoming.nome || incoming.profileName || "Cliente WhatsApp",
      telefone: contextBase.telefone || incoming.telefone,
      ultimaMensagem: incoming.text || incoming.transcricao || describeMessageType(incoming.tipo),
      ultimaInteracao: now,
      updatedAt: now,
      intencao: intent,
      mode: modeDecision.mode,
      atendimentoEstado: humanMetadataState(modeDecision.mode) || orderState || "",
      eventQuote: eventQuote.eventQuote,
      activeFlow: flowDecision.handled ? flowDecision.activeFlow : contextForIntent.activeFlow || null,
      activeStep: flowDecision.handled ? flowDecision.activeStep || contextForIntent.activeStep || "" : contextForIntent.activeStep || "",
      flowData: flowDecision.handled ? flowDecision.flowData || contextForIntent.flowData || null : contextForIntent.flowData || null,
      flowUpdatedAt: flowDecision.handled ? flowDecision.flowUpdatedAt || flowDecision.activeFlow?.updatedAt || contextForIntent.flowUpdatedAt || "" : contextForIntent.flowUpdatedAt || "",
      nextAction: flowDecision.handled ? flowDecision.nextAction || "" : contextForIntent.nextAction || "",
      whatsappOrder,
      mesaPedido: contextBase.mesaPedido || null,
      statusCobranca: paymentStatus || contextBase.statusCobranca || "",
      status,
      respostaSugerida: modeDecision.mode === CONVERSATION_MODES.HUMANO_ASSUMIU
        ? ""
        : flowDecision.reply || modeDecision.reply || eventQuote.reply || (isHumanHandoff ? HUMAN_WAIT_MESSAGE : respostaSugerida),
      humanHandoff: nextHumanHandoffState(contextBase, {
        now,
        intent,
        aiDecision,
        messageId: message.id,
        modeDecision
      }),
      lastOrderContextResetAt: contextBase.orderContextExpired ? now : contextBase.lastOrderContextResetAt || "",
      orderContextExpired: undefined,
      aiDecision: persistedAiDecision,
      aiAuditTrail: [...(contextBase.aiAuditTrail || []), {
        ...aiAudit,
        at: now
      }].slice(-20),
      configuracaoPendente: Boolean(configStatus),
      audio: incoming.tipo === "audio" ? {
        mediaId: incoming.mediaId,
        transcricao: incoming.transcricao || "",
        status: configStatus || "transcricao_pendente"
      } : contextBase.audio || null,
      mensagens: [...(contextBase.mensagens || []), message].slice(-60)
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
    console.info("whatsapp.production_flow_safety", {
      messageId: message.id,
      from: incoming.telefone,
      normalizedText: normalizeText(textForIntent),
      globalCommand,
      before: beforeFlowLog,
      after: summarizeFlowState(updated),
      reply: updated.respostaSugerida || ""
    });

    return {
      ok: true,
      conversa: this.#withPriority(updated),
      message,
      intent,
      aiDecision: persistedAiDecision,
      respostaSugerida: updated.respostaSugerida,
      sendEnabled: runtimeConfig.whatsappBusiness?.sendEnabled === true,
      voiceReplyEnabled: runtimeConfig.ai?.voiceReplyEnabled === true
    };
  }

  async addOutgoing(id, body = {}, { runtimeConfig = {}, whatsappProvider = null } = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || phonesMatch(item.telefone, id));
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
      provider: sendResult?.provider || "",
      providerMessageId: sendResult?.response?.messages?.[0]?.id || "",
      httpStatus: sendResult?.httpStatus || null,
      response: sendResult?.response || null,
      retried: Boolean(sendResult?.retried),
      originalTo: sendResult?.originalTo || "",
      retryTo: sendResult?.retryTo || "",
      attempts: Array.isArray(sendResult?.attempts) ? sendResult.attempts : []
    };
    const updated = {
      ...data.conversas[index],
      mode: nextOutgoingMode(data.conversas[index], sendResult, { manual: true }),
      status: nextOutgoingStatus(data.conversas[index], sendResult, { manual: true }),
      humanHandoff: nextOutgoingHumanHandoff(data.conversas[index], sendResult, { manual: true, now }),
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
    const index = data.conversas.findIndex((item) => item.id === id || phonesMatch(item.telefone, id));
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
      mode: nextOutgoingMode(data.conversas[index], sendResult, { text }),
      status: nextOutgoingStatus(data.conversas[index], sendResult),
      humanHandoff: nextOutgoingHumanHandoff(data.conversas[index], sendResult, { text, now }),
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
      const hasPhoneMatch = recipientPhone && phonesMatch(conversation.telefone, recipientPhone);
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

  async attachWhatsappOrder(id, order = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || phonesMatch(item.telefone, id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const summary = summarizeWhatsappOrder(order);
    const nextState = summary?.status === "sent_to_mesa" || summary?.status === "mesa_pending"
      ? "PEDIDO_MESA_RECEBIDO"
      : summary?.status === "cancelled"
        ? "CANCELADO"
        : "COMANDA_EM_ANDAMENTO";
    const mesaPedido = summary?.mesaOrderId ? {
      id: summary.mesaOrderId,
      nome: summary.customerName || data.conversas[index].nome || "Cliente WhatsApp",
      telefone: summary.phone || data.conversas[index].telefone || "",
      origem: "WHATSAPP_SAMBAH",
      statusFinanceiro: "A_COBRAR",
      correlationId: summary.conversationId || data.conversas[index].id,
      linkedAt: now
    } : data.conversas[index].mesaPedido || null;
    const updated = {
      ...data.conversas[index],
      whatsappOrder: summary,
      atendimentoEstado: nextState,
      mesaPedido,
      statusCobranca: mesaPedido ? "A_COBRAR" : data.conversas[index].statusCobranca || "",
      respostaSugerida: mesaPedido
        ? "Pedido enviado para a Mesa. Agora me diz a forma de pagamento: Pix, cartao, dinheiro ou a cobrar."
        : data.conversas[index].respostaSugerida,
      updatedAt: now,
      ultimaInteracao: now
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, conversa: this.#withPriority(updated) };
  }

  async linkMesaOrder(id, order = {}) {
    const data = await this.#read();
    const index = data.conversas.findIndex((item) => item.id === id || phonesMatch(item.telefone, id));
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
    const matches = data.conversas.filter((item) => phonesMatch(item.telefone, phone));
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
    const index = data.conversas.findIndex((item) => item.id === id || phonesMatch(item.telefone, id));
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
    const index = data.conversas.findIndex((item) => item.id === id || phonesMatch(item.telefone, id));
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
    const index = data.conversas.findIndex((item) => item.id === id || phonesMatch(item.telefone, id));
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const atendimentoEstado = status === "humano"
      ? "HUMANO"
      : status === "resolvido" && data.conversas[index].atendimentoEstado === "HUMANO"
        ? ""
        : data.conversas[index].atendimentoEstado;
    const nextStatus = status === "humano" ? "aguardando_humano" : status;
    data.conversas[index] = {
      ...data.conversas[index],
      status: nextStatus,
      mode: status === "humano"
        ? CONVERSATION_MODES.AGUARDANDO_HUMANO
        : status === "resolvido"
          ? CONVERSATION_MODES.AUTO
          : normalizeConversationMode(data.conversas[index]),
      atendimentoEstado,
      respostaSugerida: status === "humano" ? HUMAN_WAIT_MESSAGE : data.conversas[index].respostaSugerida,
      humanHandoff: status === "humano"
        ? nextHumanHandoffState(data.conversas[index], { now, intent: "humano", aiDecision: { allowedAction: "HANDOFF_HUMAN" }, messageId: "" })
        : status === "resolvido"
          ? { ...(data.conversas[index].humanHandoff || {}), status: "resolvido", resolvedAt: now }
          : data.conversas[index].humanHandoff,
      updatedAt: now
    };
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

function normalizeConversationMode(conversation = {}) {
  const mode = String(conversation.mode || "").toUpperCase();
  if (Object.values(CONVERSATION_MODES).includes(mode)) return mode;
  return CONVERSATION_MODES.AUTO;
}

function humanMetadataState(mode = CONVERSATION_MODES.AUTO) {
  return [CONVERSATION_MODES.AGUARDANDO_HUMANO, CONVERSATION_MODES.HUMANO_ASSUMIU].includes(mode) ? "HUMANO" : "";
}

function withConversationMode(conversation = {}, mode = CONVERSATION_MODES.AUTO) {
  if (mode === CONVERSATION_MODES.AUTO) {
    return {
      ...conversation,
      mode,
      atendimentoEstado: conversation.atendimentoEstado === "HUMANO" ? "" : conversation.atendimentoEstado || ""
    };
  }
  if (mode === CONVERSATION_MODES.AGUARDANDO_HUMANO) {
    return {
      ...conversation,
      mode,
      atendimentoEstado: conversation.atendimentoEstado === "HUMANO" ? "" : conversation.atendimentoEstado || ""
    };
  }
  return {
    ...conversation,
    mode,
    atendimentoEstado: humanMetadataState(mode) || conversation.atendimentoEstado || ""
  };
}

function resolvePreIntentMode(mode = CONVERSATION_MODES.AUTO, text = "") {
  const normalized = normalizeText(text);
  if (mode === CONVERSATION_MODES.HUMANO_ASSUMIU) {
    return { mode, action: "human_assumed" };
  }
  if (mode !== CONVERSATION_MODES.AGUARDANDO_HUMANO) {
    return { mode: CONVERSATION_MODES.AUTO, action: "auto" };
  }
  if (HUMAN_CANCEL_TERMS.has(normalized)) {
    return { mode: CONVERSATION_MODES.AUTO, action: "cancel_human", reply: HUMAN_CANCELLED_MESSAGE };
  }
  return { mode, action: "waiting_human" };
}

function resolvePostIntentMode({ mode = CONVERSATION_MODES.AUTO, text = "", intent = "", aiDecision = {}, preIntentAction = "" } = {}) {
  const normalized = normalizeText(text);
  if (preIntentAction === "cancel_human") {
    return { mode: CONVERSATION_MODES.AUTO, action: "cancel_human", reason: "human_cancelled", reply: HUMAN_CANCELLED_MESSAGE };
  }
  if (mode === CONVERSATION_MODES.HUMANO_ASSUMIU) {
    return { mode, action: "human_assumed", reason: "human_operator_active", reply: "" };
  }
  if (mode === CONVERSATION_MODES.AGUARDANDO_HUMANO) {
    if (HUMAN_GREETING_TERMS.has(normalized)) {
      return {
        mode,
        action: "still_waiting_human",
        reason: "human_waiting_greeting",
        reply: HUMAN_STILL_WAITING_MESSAGE
      };
    }
    if (HUMAN_AUTO_INTENTS.has(intent)
      || aiDecision.allowedAction === "CREATE_ORDER_DRAFT"
      || aiDecision.allowedAction === "SHOW_MENU") {
      return {
        mode: CONVERSATION_MODES.AUTO,
        action: "resume_auto",
        reason: "useful_intent_resumed_auto",
        reply: ""
      };
    }
    return { mode, action: "waiting_human", reason: "human_waiting", reply: HUMAN_WAIT_MESSAGE };
  }
  if (HUMAN_INTENTS.has(intent) || aiDecision.allowedAction === "HANDOFF_HUMAN") {
    return {
      mode: CONVERSATION_MODES.AGUARDANDO_HUMANO,
      action: "request_human",
      reason: "human_requested",
      reply: HUMAN_WAIT_MESSAGE
    };
  }
  return { mode: CONVERSATION_MODES.AUTO, action: "auto", reason: "auto_flow", reply: "" };
}

function nextOrderState(conversation = {}, incoming = {}, intent = "", mode = CONVERSATION_MODES.AUTO) {
  const current = conversation.atendimentoEstado || "";
  const text = normalizeText(incoming.text || incoming.transcricao || "");
  if (mode !== CONVERSATION_MODES.AUTO) return "";
  if (isCancelIntent(text)) return "CANCELADO";
  if (HUMAN_INTENTS.has(intent)) return "";
  if (["COMANDA_EM_ANDAMENTO", "COMANDA_PRONTA"].includes(current)) return "COMANDA_EM_ANDAMENTO";
  if (current === "AGUARDANDO_NOME" && text) return "ENVIADO_PARA_MESA_COMANDA";
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
  if (intent === "pedido" || text === "1") return "COMANDA_EM_ANDAMENTO";
  return current;
}

function resetStaleOrderContext(conversation = {}, nowIso = new Date().toISOString()) {
  if (!isStaleOrderContext(conversation, nowIso)) return conversation;
  return {
    ...conversation,
    mode: normalizeConversationMode(conversation),
    atendimentoEstado: "",
    whatsappOrder: null,
    statusCobranca: "",
    respostaSugerida: "",
    aiDecision: null,
    orderContextExpired: true
  };
}

function isStaleOrderContext(conversation = {}, nowIso = "") {
  const state = String(conversation.atendimentoEstado || "").toUpperCase();
  if (!EXPIRABLE_ORDER_STATES.has(state)) return false;
  if (conversation.mesaPedido?.id || conversation.statusCobranca) return false;
  const lastInteraction = Date.parse(conversation.ultimaInteracao || conversation.updatedAt || conversation.createdAt || "");
  const nowTime = Date.parse(nowIso);
  if (!Number.isFinite(lastInteraction) || !Number.isFinite(nowTime)) return false;
  return nowTime - lastInteraction > ORDER_CONTEXT_TTL_MS;
}

function detectProductionGlobalCommand(text = "") {
  const normalized = normalizeText(text);
  if (["reset", "reiniciar", "zerar atendimento", "limpar conversa"].includes(normalized)) return "reset";
  if (["humano", "atendente"].includes(normalized)) return "human";
  return "";
}

async function resolvePendingExpiredFlowDecision({ conversation = {}, incoming = {}, message = {}, text = "", now = new Date().toISOString(), data = { conversas: [] }, existing = null } = {}) {
  if (!hasPendingExpiredFlowDecision(conversation)) return null;
  const choice = normalizeExpiredFlowChoice(text);
  if (!choice) {
    const updated = {
      ...conversation,
      ultimaMensagem: incoming.text || incoming.transcricao || describeMessageType(incoming.tipo),
      ultimaInteracao: now,
      updatedAt: now,
      respostaSugerida: EXPIRED_FLOW_INVALID_REPLY,
      mensagens: [...(conversation.mensagens || []), message].slice(-60)
    };
    return buildPersistedExpiredChoiceResult({ data, existing, updated, intent: "expired_flow_invalid", respostaSugerida: EXPIRED_FLOW_INVALID_REPLY });
  }

  if (choice === "restart") {
    const updated = buildHardResetConversation(conversation, incoming, message, now);
    return buildPersistedExpiredChoiceResult({ data, existing, updated, intent: "reset", respostaSugerida: updated.respostaSugerida });
  }

  if (choice === "human") {
    const updated = buildHumanHandoffConversation(conversation, incoming, message, now);
    return buildPersistedExpiredChoiceResult({ data, existing, updated, intent: "humano", respostaSugerida: HUMAN_WAIT_MESSAGE, globalCommand: "human" });
  }

  const previousFlow = sanitizeActiveFlow(conversation.flowData?.expiredFlowSnapshot || conversation.activeFlow);
  const resumedFlow = previousFlow ? { ...previousFlow, updatedAt: now } : null;
  const cleanFlowData = clearExpiredFlowDecisionData(conversation.flowData);
  const resumedConversation = {
    ...conversation,
    activeFlow: resumedFlow,
    activeStep: "",
    flowData: cleanFlowData,
    flowUpdatedAt: now
  };
  const flowDecision = resolveConversationFlow({
    conversation: resumedConversation,
    text: "",
    intent: "",
    mode: CONVERSATION_MODES.AUTO,
    now
  });
  const updated = {
    ...resumedConversation,
    ultimaMensagem: incoming.text || incoming.transcricao || describeMessageType(incoming.tipo),
    ultimaInteracao: now,
    updatedAt: now,
    intencao: "evento",
    activeFlow: flowDecision.handled ? flowDecision.activeFlow : resumedFlow,
    activeStep: flowDecision.activeStep || "",
    flowData: flowDecision.flowData || cleanFlowData,
    flowUpdatedAt: flowDecision.flowUpdatedAt || now,
    nextAction: flowDecision.nextAction || resumedConversation.nextAction || "",
    respostaSugerida: flowDecision.reply || "Seguimos com o orcamento anterior. Me manda o proximo dado do evento.",
    mensagens: [...(conversation.mensagens || []), message].slice(-60)
  };
  return buildPersistedExpiredChoiceResult({ data, existing, updated, intent: "evento", respostaSugerida: updated.respostaSugerida });
}

function buildPersistedExpiredChoiceResult({ data = { conversas: [] }, existing = null, updated = {}, intent = "", respostaSugerida = "", globalCommand = "" } = {}) {
  const nextData = {
    ...data,
    conversas: existing
      ? data.conversas.map((item) => (item.id === existing.id ? updated : item))
      : [...(data.conversas || []), updated]
  };
  return { data: nextData, conversa: updated, intent, respostaSugerida, globalCommand, aiDecision: updated.aiDecision || null };
}

function hasPendingExpiredFlowDecision(conversation = {}) {
  return conversation.activeStep === "confirmExpiredFlow"
    || conversation.flowData?.pendingExpiredFlowDecision === true;
}

function buildImplicitExpiredFlowDecisionContext(conversation = {}, text = "", nowIso = new Date().toISOString()) {
  if (hasPendingExpiredFlowDecision(conversation)) return conversation;
  if (!normalizeExpiredFlowChoice(text)) return conversation;
  if (!isExpiredActiveFlowConversation(conversation, nowIso)) return conversation;
  return {
    ...conversation,
    activeStep: "confirmExpiredFlow",
    flowData: {
      ...(conversation.flowData && typeof conversation.flowData === "object" ? conversation.flowData : {}),
      pendingExpiredFlowDecision: true,
      expiredFlowSnapshot: conversation.activeFlow
    }
  };
}

function normalizeExpiredFlowChoice(text = "") {
  const normalized = normalizeText(text);
  if (normalized === "1" || normalized.includes("continuar")) return "continue";
  if (normalized === "2" || normalized.includes("comecar") || normalized.includes("começar") || normalized.includes("novo")) return "restart";
  if (normalized === "3" || normalized.includes("humano") || normalized.includes("atendente")) return "human";
  return "";
}

function isExpiredActiveFlowConversation(conversation = {}, nowIso = new Date().toISOString()) {
  if (!conversation?.activeFlow || typeof conversation.activeFlow !== "object") return false;
  const updatedAt = Date.parse(conversation.flowUpdatedAt || conversation.activeFlow.updatedAt || "");
  const now = Date.parse(nowIso);
  if (!Number.isFinite(updatedAt) || !Number.isFinite(now)) return false;
  return now - updatedAt > FLOW_TTL_MS;
}

function clearExpiredFlowDecisionData(flowData = null) {
  if (!flowData || typeof flowData !== "object") return null;
  const next = { ...flowData };
  delete next.pendingExpiredFlowDecision;
  delete next.expiredFlowSnapshot;
  return Object.keys(next).length ? next : null;
}

function buildHardResetConversation(conversation = {}, incoming = {}, message = {}, now = new Date().toISOString()) {
  return {
    ...conversation,
    nome: conversation.nome || incoming.nome || incoming.profileName || "Cliente WhatsApp",
    telefone: conversation.telefone || incoming.telefone,
    ultimaMensagem: incoming.text || incoming.transcricao || describeMessageType(incoming.tipo),
    ultimaInteracao: now,
    updatedAt: now,
    intencao: "reset",
    mode: CONVERSATION_MODES.AUTO,
    atendimentoEstado: "",
    activeFlow: null,
    activeStep: "",
    flowData: null,
    flowUpdatedAt: "",
    nextAction: "",
    eventQuote: null,
    draft: null,
    draftId: "",
    orderDraft: null,
    eventDraft: null,
    orcamentoDraft: null,
    whatsappOrder: null,
    mesaPedido: null,
    statusCobranca: "",
    respostaSugerida: HARD_RESET_REPLY,
    humanHandoff: null,
    orderContextExpired: undefined,
    aiDecision: null,
    aiAuditTrail: Array.isArray(conversation.aiAuditTrail) ? conversation.aiAuditTrail : [],
    mensagens: [...(conversation.mensagens || []), message].slice(-60)
  };
}

function buildHumanHandoffConversation(conversation = {}, incoming = {}, message = {}, now = new Date().toISOString()) {
  return {
    ...buildHardResetConversation(conversation, incoming, message, now),
    intencao: "humano",
    mode: CONVERSATION_MODES.AGUARDANDO_HUMANO,
    atendimentoEstado: "HUMANO",
    status: "aguardando_humano",
    respostaSugerida: HUMAN_WAIT_MESSAGE,
    aiDecision: buildHumanHandoffAiDecision(),
    humanHandoff: {
      status: "pendente",
      requestedAt: now,
      lastCustomerMessageAt: now,
      lastMessageId: message.id,
      pendingNoticeDue: false
    }
  };
}

function buildHumanHandoffAiDecision() {
  return {
    intent: "humano",
    allowedAction: "HANDOFF_HUMAN",
    requiresHuman: true,
    safeReply: HUMAN_WAIT_MESSAGE,
    conversationState: "HUMANO",
    state: "HUMANO"
  };
}

function sanitizeProductionFlowState(conversation = {}) {
  let next = conversation;
  const activeFlow = sanitizeActiveFlow(conversation.activeFlow);
  const eventQuote = sanitizeEventQuote(conversation.eventQuote);
  const flowData = sanitizeFlowData(conversation.flowData);
  if (activeFlow !== conversation.activeFlow || eventQuote !== conversation.eventQuote || flowData !== conversation.flowData) {
    next = {
      ...conversation,
      activeFlow,
      eventQuote,
      flowData
    };
  }
  return next;
}

function sanitizeActiveFlow(activeFlow = null) {
  if (!activeFlow || typeof activeFlow !== "object") return activeFlow || null;
  const slots = activeFlow.slots && typeof activeFlow.slots === "object" ? activeFlow.slots : null;
  if (!slots || !isLikelyYearValue(slots.people)) return activeFlow;
  return {
    ...activeFlow,
    status: activeFlow.status === "ready" ? "collecting" : activeFlow.status,
    slots: {
      ...slots,
      people: null
    }
  };
}

function sanitizeEventQuote(eventQuote = null) {
  if (!eventQuote || typeof eventQuote !== "object") return eventQuote || null;
  const slots = eventQuote.slots && typeof eventQuote.slots === "object" ? eventQuote.slots : null;
  if (!slots || !isLikelyYearValue(slots.people)) return eventQuote;
  return {
    ...eventQuote,
    status: eventQuote.status === "details_received" ? "collecting" : eventQuote.status,
    slots: {
      ...slots,
      people: null
    }
  };
}

function sanitizeFlowData(flowData = null) {
  if (!flowData || typeof flowData !== "object") return flowData || null;
  if (!isLikelyYearValue(flowData.people) && !isLikelyYearValue(flowData.pessoas) && !isLikelyYearValue(flowData.quantidade_pessoas)) return flowData;
  const next = { ...flowData };
  if (isLikelyYearValue(next.people)) delete next.people;
  if (isLikelyYearValue(next.pessoas)) delete next.pessoas;
  if (isLikelyYearValue(next.quantidade_pessoas)) delete next.quantidade_pessoas;
  return next;
}

function summarizeFlowState(conversation = {}) {
  return {
    activeFlow: conversation.activeFlow?.type || "",
    activeStep: conversation.activeStep || "",
    flowData: conversation.flowData || null,
    flowUpdatedAt: conversation.flowUpdatedAt || conversation.activeFlow?.updatedAt || "",
    activeFlowStatus: conversation.activeFlow?.status || "",
    activeFlowSlots: conversation.activeFlow?.slots || null
  };
}

function isLikelyYearValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1900 && number <= 2100;
}

async function syncWhatsappOrderFromIncoming({ orderService, conversation = {}, incoming = {}, intent = "", orderState = "", aiDecision = {} } = {}) {
  if (!orderService || !conversation?.id) return { ok: false, skipped: true };
  const text = incoming.text || incoming.transcricao || "";
  const normalized = normalizeText(text);
  if (!normalized || HUMAN_INTENTS.has(intent) || isCancelIntent(normalized)) return { ok: false, skipped: true };
  const isOrderFlow = intent === "pedido" || ["COMANDA_EM_ANDAMENTO", "COMANDA_PRONTA"].includes(orderState || conversation.atendimentoEstado || "");
  if (!isOrderFlow) return { ok: false, skipped: true };
  const allowedAction = aiDecision.allowedAction || "";
  if (!["CREATE_ORDER_DRAFT", "ADD_ORDER_ITEM"].includes(allowedAction)) {
    return { ok: false, skipped: true, reason: "ai_decision_not_order_item" };
  }

  const draft = await orderService.createDraftOrderFromConversation(conversation, {
    customerName: conversation.nome || incoming.nome || incoming.profileName || "Cliente WhatsApp",
    phone: conversation.telefone || incoming.telefone || ""
  });
  if (!draft.ok) return draft;
  if (allowedAction !== "ADD_ORDER_ITEM") return { ok: true, order: draft.order, created: draft.created };
  if (!shouldCollectWhatsappOrderItem(text)) return { ok: true, order: draft.order, created: draft.created };
  return orderService.addItemToOrder(conversation.id, { text });
}

function nextEventQuoteState(conversation = {}, incoming = {}, intent = "") {
  const current = conversation.eventQuote || null;
  const text = String(incoming.text || incoming.transcricao || "").trim();
  if (intent !== "evento") return { eventQuote: current, reply: "" };
  const details = [...(current?.details || [])];
  if (text) details.push({ text, receivedAt: new Date().toISOString() });
  const baseQuote = {
    ...(current || {}),
    status: current?.status || "collecting",
    details: details.slice(-10)
  };
  if (current?.status === "details_received") {
    return {
      eventQuote: { ...baseQuote, status: "details_received" },
      reply: EVENT_DETAILS_COMPLEMENT_MESSAGE
    };
  }
  if (current?.status === "collecting" || looksLikeEventDetails(text)) {
    return {
      eventQuote: { ...baseQuote, status: "details_received" },
      reply: EVENT_DETAILS_RECEIVED_MESSAGE
    };
  }
  return {
    eventQuote: baseQuote,
    reply: ""
  };
}

function eventQuoteFromActiveFlow(activeFlow = null, current = null) {
  if (!activeFlow || activeFlow.type !== "evento") return { eventQuote: current, reply: "" };
  return {
    eventQuote: {
      ...(current || {}),
      status: activeFlow.status === "ready" ? "details_received" : "collecting",
      slots: activeFlow.slots || {},
      updatedAt: activeFlow.updatedAt || new Date().toISOString()
    },
    reply: ""
  };
}

function looksLikeEventDetails(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(normalized)) return true;
  if (/\b\d{1,2}h(?:\d{2})?\b/.test(normalized)) return true;
  if (/\b\d+\s*(pessoas|pessoa|convidados|convidado)\b/.test(normalized)) return true;
  if (hasAny(normalized, ["porto alegre", "poa", "cidade", "local", "endereco", "centro", "bairro"])) return true;
  return false;
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

function nextOutgoingStatus(conversation = {}, sendResult = null, { manual = false } = {}) {
  if (!sendResult?.sent) return conversation.status;
  if (normalizeConversationMode(conversation) !== CONVERSATION_MODES.AUTO || HUMAN_INTENTS.has(conversation.intencao || "")) {
    return manual ? "aguardando_cliente" : "aguardando_humano";
  }
  return "aguardando_cliente";
}

function nextHumanHandoffState(conversation = {}, { now = new Date().toISOString(), intent = "", aiDecision = {}, messageId = "", modeDecision = null } = {}) {
  const current = conversation.humanHandoff || null;
  if (modeDecision?.action === "cancel_human") {
    return {
      ...(current || {}),
      status: "cancelado",
      cancelledAt: now,
      resolvedAt: now,
      pendingNoticeDue: false
    };
  }
  const isHuman = modeDecision?.mode === CONVERSATION_MODES.AGUARDANDO_HUMANO
    || modeDecision?.mode === CONVERSATION_MODES.HUMANO_ASSUMIU
    || HUMAN_INTENTS.has(intent)
    || aiDecision.allowedAction === "HANDOFF_HUMAN";
  if (!isHuman) return current;
  const alreadyWaitingHuman = Boolean(current?.requestedAt) || normalizeConversationMode(conversation) === CONVERSATION_MODES.AGUARDANDO_HUMANO;
  const pendingNoticeDue = alreadyWaitingHuman && !current?.waitMessageSentAt && current?.status !== "em_atendimento";
  return {
    status: current?.status === "em_atendimento" ? "em_atendimento" : "pendente",
    requestedAt: current?.requestedAt || now,
    lastCustomerMessageAt: now,
    lastMessageId: messageId || current?.lastMessageId || "",
    waitMessageSentAt: current?.waitMessageSentAt || "",
    pendingNoticeDue,
    assignedAt: current?.assignedAt || "",
    resolvedAt: ""
  };
}

function nextOutgoingHumanHandoff(conversation = {}, sendResult = null, { manual = false, text = "", now = new Date().toISOString() } = {}) {
  const current = conversation.humanHandoff || null;
  if (!current && normalizeConversationMode(conversation) === CONVERSATION_MODES.AUTO) return current;
  if (!sendResult?.sent) return current;
  if (manual) {
    return {
      ...(current || {}),
      status: "em_atendimento",
      assignedAt: current?.assignedAt || now,
      lastHumanReplyAt: now,
      pendingNoticeDue: false
    };
  }
  if (String(text || "").trim() === HUMAN_WAIT_MESSAGE) {
    return {
      ...(current || {}),
      status: current?.status || "pendente",
      waitMessageSentAt: current?.waitMessageSentAt || now,
      pendingNoticeDue: false
    };
  }
  return current;
}

function nextOutgoingMode(conversation = {}, sendResult = null, { manual = false, text = "" } = {}) {
  const mode = normalizeConversationMode(conversation);
  if (!sendResult?.sent) return mode;
  if (manual && mode === CONVERSATION_MODES.AGUARDANDO_HUMANO) return CONVERSATION_MODES.HUMANO_ASSUMIU;
  if (String(text || "").trim() === HUMAN_WAIT_MESSAGE) return CONVERSATION_MODES.AGUARDANDO_HUMANO;
  return mode;
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

function phonesMatch(left = "", right = "") {
  const leftAliases = phoneAliases(left);
  const rightAliases = phoneAliases(right);
  if (!leftAliases.size || !rightAliases.size) return false;
  return [...leftAliases].some((phone) => rightAliases.has(phone));
}

function phoneAliases(value = "") {
  const phone = normalizePhone(value);
  const aliases = new Set();
  if (!phone) return aliases;
  aliases.add(phone);
  if (phone.startsWith("55") && phone.length === 12) {
    aliases.add(`${phone.slice(0, 4)}9${phone.slice(4)}`);
  }
  if (phone.startsWith("55") && phone.length === 13 && phone[4] === "9") {
    aliases.add(`${phone.slice(0, 4)}${phone.slice(5)}`);
  }
  return aliases;
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
