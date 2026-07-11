import crypto from "node:crypto";
import { assertWhatsAppV2ResponseContract } from "./responseContract.js";
import { InMemoryWhatsAppV2ConversationRepository, InMemoryWhatsAppV2OutboxRepository } from "./inMemoryRepositories.js";
import { routePortalInsanoMessage } from "./portalInsanoEngine.js";

export function createWhatsAppV2LabEngine(options = {}) {
  const operationLog = [];
  const conversationRepository = options.conversationRepository || new InMemoryWhatsAppV2ConversationRepository({ operationLog });
  const outboxRepository = options.outboxRepository || new InMemoryWhatsAppV2OutboxRepository({ operationLog });
  const sender = options.sender;
  if (!sender) throw new Error("WHATSAPP_V2_LAB_SENDER_REQUIRED");
  const processor = new WhatsAppV2LabProcessor({ conversationRepository, outboxRepository, sender, observeOnly: options.observeOnly === true });
  return { processor, conversationRepository, outboxRepository, sender, operationLog };
}

export function createWhatsAppV2OperationalEngine(options = {}) {
  const operationLog = [];
  const conversationRepository = options.conversationRepository || new InMemoryWhatsAppV2ConversationRepository({ operationLog });
  const processor = new WhatsAppV2LabProcessor({
    conversationRepository,
    outboxRepository: null,
    sender: null,
    externalDelivery: true
  });
  return { processor, conversationRepository, operationLog };
}

export class WhatsAppV2LabProcessor {
  constructor({ conversationRepository, outboxRepository, sender, observeOnly = false, externalDelivery = false }) {
    this.conversationRepository = conversationRepository;
    this.outboxRepository = outboxRepository;
    this.sender = sender;
    this.observeOnly = observeOnly;
    this.externalDelivery = externalDelivery;
  }

  async handleIncoming(payload = {}) {
    const message = normalizeIncoming(payload);
    const traceId = crypto.randomUUID();
    const reserved = message.reserved === true ? true : await this.conversationRepository.reserveMessage(message.messageId);
    if (!reserved) return { ok: true, duplicate: true, traceId, repliesSent: 0 };

    try {
      const currentState = await this.conversationRepository.get(message.conversationId);
      const nextHistory = [...(currentState.history || []), { messageId: message.messageId, text: message.text, at: message.receivedAt }];
      const routed = routePortalInsanoMessage({ state: { ...currentState, history: nextHistory }, message });
      const result = assertWhatsAppV2ResponseContract(routed);
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

function normalizeIncoming(payload = {}) {
  if (!payload.messageId || !payload.from) throw new Error("INVALID_WHATSAPP_V2_INCOMING_MESSAGE");
  return {
    messageId: String(payload.messageId),
    conversationId: String(payload.conversationId || payload.from),
    from: String(payload.from),
    text: String(payload.text || "").trim(),
    receivedAt: payload.receivedAt || new Date().toISOString(),
    reserved: payload.reserved === true
  };
}
