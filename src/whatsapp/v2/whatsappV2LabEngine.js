import crypto from "node:crypto";
import { assertWhatsAppV2ResponseContract } from "./responseContract.js";
import { InMemoryWhatsAppV2ConversationRepository, InMemoryWhatsAppV2OutboxRepository } from "./inMemoryRepositories.js";
import { routePortalInsanoMessage } from "./portalInsanoEngine.js";

const HUMAN_IDLE_TTL_MS = 30 * 60 * 1000;
const CONVERSATION_IDLE_TTL_MS = 30 * 60 * 1000;
const HUMAN_ACKNOWLEDGEMENT_TEXT = "Recebi tua mensagem e já avisei a equipe. O atendimento humano continua aberto. Para consultar cardápio, evento ou orçamento agora, digita início e volta ao Portal Insano.";

export function createWhatsAppV2LabEngine(options = {}) {
  const operationLog = [];
  const conversationRepository = options.conversationRepository || new InMemoryWhatsAppV2ConversationRepository({ operationLog });
  const outboxRepository = options.outboxRepository || new InMemoryWhatsAppV2OutboxRepository({ operationLog });
  const sender = options.sender;
  if (!sender) throw new Error("WHATSAPP_V2_LAB_SENDER_REQUIRED");
  const processor = new WhatsAppV2LabProcessor({ conversationRepository, outboxRepository, sender, menuService: options.menuService, observeOnly: options.observeOnly === true });
  return { processor, conversationRepository, outboxRepository, sender, operationLog };
}

export function createWhatsAppV2OperationalEngine(options = {}) {
  const operationLog = [];
  const conversationRepository = options.conversationRepository || new InMemoryWhatsAppV2ConversationRepository({ operationLog });
  const processor = new WhatsAppV2LabProcessor({
    conversationRepository,
    outboxRepository: null,
    sender: null,
    menuService: options.menuService,
    externalDelivery: true
  });
  return { processor, conversationRepository, operationLog };
}

export class WhatsAppV2LabProcessor {
  constructor({ conversationRepository, outboxRepository, sender, menuService = null, observeOnly = false, externalDelivery = false }) {
    this.conversationRepository = conversationRepository;
    this.outboxRepository = outboxRepository;
    this.sender = sender;
    this.menuService = menuService;
    this.observeOnly = observeOnly;
    this.externalDelivery = externalDelivery;
  }

  async handleIncoming(payload = {}) {
    const message = normalizeIncoming(payload);
    const traceId = crypto.randomUUID();
    const reserved = message.reserved === true ? true : await this.conversationRepository.reserveMessage(message.messageId);
    if (!reserved) return { ok: true, duplicate: true, traceId, repliesSent: 0 };

    try {
      const loadedState = await this.conversationRepository.get(message.conversationId);
      const humanExpiry = expireHumanStateIfNeeded(loadedState, message.receivedAt);
      const conversationExpiry = expireConversationStateIfNeeded(humanExpiry.state, message.receivedAt, humanExpiry.expired);
      const currentState = conversationExpiry.state;
      const nextHistory = [...(currentState.history || []), { messageId: message.messageId, text: message.text, at: message.receivedAt }];
      const menuCache = await this.menuService?.getMenuCache?.() || await this.menuService?.cacheSnapshot?.() || { items: [], categories: [] };
      const routed = routePortalInsanoMessage({
        state: {
          ...currentState,
          phone: message.from,
          sambahConversationId: message.sambahConversationId || currentState.sambahConversationId || null,
          history: nextHistory
        },
        message,
        menuCache
      });
      const result = assertWhatsAppV2ResponseContract(addEffectiveHumanAcknowledgement(routed, humanExpiry, this.externalDelivery));
      const nextState = {
        ...result.nextState,
        updatedAt: new Date(message.receivedAt).toISOString(),
        lastProcessedMessageId: message.messageId
      };
      await this.conversationRepository.save(nextState);

      let outboxItem = null;
      let repliesSent = 0;
      if (result.replies.length === 1 && !this.observeOnly && !this.externalDelivery) {
        outboxItem = await this.outboxRepository.add({
          conversationId: message.conversationId,
          messageId: message.messageId,
          reply: result.replies[0],
          to: message.from,
          traceId
        });
        const sent = await this.sendOutbox(outboxItem.id, traceId);
        repliesSent = sent.sent ? 1 : 0;
      }

      await this.conversationRepository.markMessageProcessed(message.messageId);
      return {
        ok: true,
        duplicate: false,
        traceId,
        source: result.source,
        repliesObserved: result.replies.length,
        replies: result.replies,
        actions: result.actions,
        repliesSent,
        state: nextState,
        humanStateExpired: humanExpiry.expired,
        conversationStateExpired: conversationExpiry.expired,
        outboxId: outboxItem?.id || null,
        mode: this.externalDelivery ? "operational" : this.observeOnly ? "observe_only" : "lab_send_fake"
      };
    } catch (error) {
      await this.conversationRepository.markMessageFailed(message.messageId, error);
      throw error;
    }
  }

  async sendOutbox(id, traceId = crypto.randomUUID()) {
    this.conversationRepository.operations?.push("sendOutbox");
    const item = await this.outboxRepository.markSending(id);
    if (!item || item.status === "sent" || item.status === "cancelled") return { sent: false, status: item?.status || "missing" };
    try {
      await this.sender.send({ to: item.to, ...item.reply, traceId });
      await this.outboxRepository.markSent(id);
      return { sent: true, status: "sent" };
    } catch (error) {
      await this.outboxRepository.markFailed(id, error);
      return { sent: false, status: "failed" };
    }
  }
}

function expireConversationStateIfNeeded(state = {}, receivedAt = "", alreadyExpired = false) {
  if (alreadyExpired) return { state, expired: true };
  const updatedAt = Date.parse(state.updatedAt || "");
  const receivedTime = Date.parse(receivedAt || "");
  if (!Number.isFinite(updatedAt) || !Number.isFinite(receivedTime) || receivedTime - updatedAt <= CONVERSATION_IDLE_TTL_MS) {
    return { state, expired: false };
  }
  return {
    expired: true,
    state: {
      ...state,
      mode: "bot",
      serviceState: "AUTOMATICO",
      areaId: null,
      activeMenu: "portal_main_menu",
      menuStack: [],
      navigationStack: ["PORTAL_INSANO"],
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      flowData: {},
      foodtruckSubstate: null,
      conversationExpiredAt: new Date(receivedTime).toISOString(),
      conversationPreviousUpdatedAt: state.updatedAt || null
    }
  };
}

function addEffectiveHumanAcknowledgement(result = {}, humanExpiry = {}, enabled = false) {
  if (!enabled || humanExpiry.expired || result.source !== "humanState" || result.replies?.length) return result;
  return {
    ...result,
    replies: [{ type: "text", text: HUMAN_ACKNOWLEDGEMENT_TEXT }],
    actions: [...(result.actions || []), { type: "human_acknowledgement" }]
  };
}

function expireHumanStateIfNeeded(state = {}, receivedAt = "") {
  if (!isHumanState(state)) return { state, expired: false };
  const updatedAt = Date.parse(state.updatedAt || "");
  const receivedTime = Date.parse(receivedAt || "");
  if (!Number.isFinite(updatedAt) || !Number.isFinite(receivedTime) || receivedTime - updatedAt <= HUMAN_IDLE_TTL_MS) {
    return { state, expired: false };
  }
  return {
    expired: true,
    state: {
      ...state,
      mode: "bot",
      serviceState: "AUTOMATICO",
      areaId: null,
      activeMenu: "portal_main_menu",
      menuStack: [],
      navigationStack: ["PORTAL_INSANO"],
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      foodtruckSubstate: null,
      humanModeExpiredAt: new Date(receivedTime).toISOString(),
      humanModePreviousUpdatedAt: state.updatedAt || null
    }
  };
}

function isHumanState(state = {}) {
  return state.mode === "human" || state.serviceState === "HUMANO";
}

function normalizeIncoming(payload = {}) {
  if (!payload.messageId || !payload.from) throw new Error("INVALID_WHATSAPP_V2_INCOMING_MESSAGE");
  return {
    messageId: String(payload.messageId),
    conversationId: String(payload.conversationId || payload.from),
    from: String(payload.from),
    text: String(payload.text || "").trim(),
    receivedAt: payload.receivedAt || new Date().toISOString(),
    sambahConversationId: String(payload.sambahConversationId || "").trim() || null,
    reserved: payload.reserved === true
  };
}
