import crypto from "node:crypto";
import { response, assertWhatsAppV2ResponseContract } from "./responseContract.js";
import { InMemoryWhatsAppV2ConversationRepository, InMemoryWhatsAppV2OutboxRepository } from "./inMemoryRepositories.js";
import { FakeWhatsAppV2MetaSender } from "./fakeMetaSender.js";

export function createWhatsAppV2LabEngine(options = {}) {
  const operationLog = [];
  const conversationRepository = options.conversationRepository || new InMemoryWhatsAppV2ConversationRepository({ operationLog });
  const outboxRepository = options.outboxRepository || new InMemoryWhatsAppV2OutboxRepository({ operationLog });
  const sender = options.sender || new FakeWhatsAppV2MetaSender();
  const processor = new WhatsAppV2LabProcessor({ conversationRepository, outboxRepository, sender });
  return { processor, conversationRepository, outboxRepository, sender, operationLog };
}

export class WhatsAppV2LabProcessor {
  constructor({ conversationRepository, outboxRepository, sender }) {
    this.conversationRepository = conversationRepository;
    this.outboxRepository = outboxRepository;
    this.sender = sender;
  }

  async handleIncoming(payload = {}) {
    const message = normalizeIncoming(payload);
    const traceId = crypto.randomUUID();
    const reserved = await this.conversationRepository.reserveMessage(message.messageId);
    if (!reserved) return { ok: true, duplicate: true, traceId, repliesSent: 0 };

    try {
      const currentState = await this.conversationRepository.get(message.conversationId);
      const nextHistory = [...(currentState.history || []), { messageId: message.messageId, text: message.text, at: message.receivedAt }];
      const routed = routeLabMessage({ state: { ...currentState, history: nextHistory }, message });
      const result = assertWhatsAppV2ResponseContract(routed);
      const nextState = {
        ...result.nextState,
        updatedAt: new Date(message.receivedAt).toISOString(),
        lastProcessedMessageId: message.messageId
      };
      await this.conversationRepository.save(nextState);

      let outboxItem = null;
      let repliesSent = 0;
      if (result.replies.length === 1) {
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
      return { ok: true, duplicate: false, traceId, source: result.source, repliesSent, state: nextState, outboxId: outboxItem?.id || null };
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

function routeLabMessage({ state, message }) {
  const text = normalizeText(message.text);
  if (state.mode === "human") {
    return { handled: true, source: "humanMode", nextState: state, replies: [], actions: [{ type: "notify_operator" }] };
  }
  if (text === "humano" || text === "atendente" || text === "6") {
    return response(
      "humanHandoffFlow",
      { ...state, mode: "human", activeFlow: null, activeStep: null },
      "Certo. O atendimento humano foi solicitado. Tu nao precisa repetir tudo de novo.",
      [{ type: "notify_operator" }]
    );
  }
  if (text === "oi" || text === "ola" || text === "menu") {
    return response(
      "welcomeFlow",
      { ...state, mode: "bot", activeFlow: null, activeStep: null },
      "Buenas! O que tu precisa agora? 1. Fazer pedido 3. Orcamento para evento 6. Atendimento humano"
    );
  }
  return response("fallbackFlow", state, "Nao consegui identificar com seguranca. Digita menu ou humano.");
}

function normalizeIncoming(payload = {}) {
  if (!payload.messageId || !payload.from) throw new Error("INVALID_WHATSAPP_V2_INCOMING_MESSAGE");
  return {
    messageId: String(payload.messageId),
    conversationId: String(payload.conversationId || payload.from),
    from: String(payload.from),
    text: String(payload.text || "").trim(),
    receivedAt: payload.receivedAt || new Date().toISOString()
  };
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
