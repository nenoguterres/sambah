import { parseWhatsAppIncoming } from "../whatsappConversationService.js";
import { getRuntimeConfig } from "../config.js";
import { createWhatsAppV2OperationalEngine } from "./v2/whatsappV2LabEngine.js";
import { FileWhatsAppV2ConversationRepository } from "./v2/inMemoryRepositories.js";
import { join } from "node:path";

export async function whatsappMaintenanceHandler(payload = {}, { conversationService, messageService, auditService, whatsappProvider = null, runtimeConfig = getRuntimeConfig() } = {}) {
  const incoming = parseWhatsAppIncoming(payload);
  const conversationResult = await conversationService.recordNeutralIncoming(incoming);
  const messageResult = messageService ? await messageService.handleIncoming(payload) : null;
  if (conversationResult.duplicate) {
    await safeAuditRecord(auditService, {
      type: "whatsapp_duplicate_message_ignored",
      status: "info",
      source: "meta_whatsapp",
      message: "Mensagem WhatsApp duplicada ignorada antes da V2",
      context: {
        messageId: incoming.messageId || "",
        phone: maskPhone(incoming.telefone || ""),
        automaticReplyCreated: false,
        sent: false
      },
      dedupeKey: incoming.messageId ? `whatsapp-duplicate:${incoming.messageId}` : undefined
    });
    return {
      ok: true,
      handled: false,
      duplicate: true,
      engine: runtimeConfig.whatsappV2?.enabled ? "v2" : "disabled",
      reason: "duplicate_message",
      automaticReplyCreated: false,
      sent: false,
      conversa: conversationResult.conversa,
      message: conversationResult.message,
      normalized: messageResult?.normalized || null
    };
  }

  if (runtimeConfig.whatsappV2?.enabled === true) {
    const v2Repository = createWhatsAppV2Repository(runtimeConfig);
    const reservation = await reserveIncomingMessage(v2Repository, incoming);
    if (reservation.duplicate) {
      await safeAuditRecord(auditService, {
        type: "whatsapp_duplicate_message_ignored",
        status: "info",
        source: "meta_whatsapp",
        message: "Mensagem WhatsApp duplicada ignorada antes da automacao V2",
        context: {
          messageId: incoming.messageId || "",
          phone: maskPhone(incoming.telefone || ""),
          automaticReplyCreated: false,
          sent: false
        },
        dedupeKey: incoming.messageId ? `whatsapp-duplicate:${incoming.messageId}` : undefined
      });
      return {
        ok: true,
        handled: false,
        duplicate: true,
        engine: "v2",
        reason: "duplicate_message",
        automaticReplyCreated: false,
        sent: false,
        conversa: conversationResult.conversa,
        message: conversationResult.message,
        normalized: messageResult?.normalized || null
      };
    }
    const processed = await processWhatsAppV2(incoming, runtimeConfig, {
      conversationRepository: v2Repository,
      reserved: reservation.reserved
    });
    if (processed.state?.mode === "human" || processed.state?.serviceState === "HUMANO") {
      const humanResult = await conversationService.markHuman?.(conversationResult.conversa.id);
      if (humanResult?.ok) conversationResult.conversa = humanResult.conversa;
    }
    const reply = processed.replies?.[0] || null;
    if (!reply) {
      await safeAuditRecord(auditService, {
        type: "whatsapp_v2_no_automatic_reply",
        status: "info",
        source: "meta_whatsapp",
        message: "WhatsApp V2 processou entrada sem resposta automatica",
        context: {
          messageId: incoming.messageId || "",
          phone: maskPhone(incoming.telefone || ""),
          mode: "operational",
          source: processed.source || "",
          reason: processed.source === "humanState" ? "human_state_blocks_automation" : "no_reply_created"
        },
        dedupeKey: incoming.messageId ? `whatsapp-v2-no-reply:${incoming.messageId}` : undefined
      });
      return {
        ok: true,
        handled: true,
        engine: "v2",
        mode: "operational",
        reason: processed.source === "humanState" ? "human_state_blocks_automation" : "no_reply_created",
        automaticReplyCreated: false,
        sent: false,
        aiCalled: false,
        senderCalled: false,
        conversa: conversationResult.conversa,
        message: conversationResult.message,
        normalized: messageResult?.normalized || null
      };
    }

    if (runtimeConfig.whatsappV2?.autoReplyEnabled !== true) {
      await safeAuditRecord(auditService, {
        type: "whatsapp_v2_auto_reply_disabled",
        status: "warning",
        source: "meta_whatsapp",
        message: "WhatsApp V2 gerou resposta mas auto-reply esta desativado",
        context: {
          messageId: incoming.messageId || "",
          phone: maskPhone(incoming.telefone || ""),
          mode: "operational",
          source: processed.source || "",
          sent: false
        },
        dedupeKey: incoming.messageId ? `whatsapp-v2-auto-disabled:${incoming.messageId}` : undefined
      });
      return {
        ok: true,
        handled: true,
        engine: "v2",
        mode: "operational",
        reason: "whatsapp_auto_reply_disabled",
        automaticReplyCreated: false,
        sent: false,
        aiCalled: false,
        senderCalled: false,
        conversa: conversationResult.conversa,
        message: conversationResult.message,
        normalized: messageResult?.normalized || null
      };
    }

    const correlationId = incoming.messageId ? `wa-v2-reply:${incoming.messageId}` : "";
    const outboundCommand = buildV2OutboundCommand({ incoming, reply, correlationId });
    let sendResult = null;
    let sendAttempted = false;
    let reason = "whatsapp_sender_disabled";
    if (runtimeConfig.whatsappV2?.sendEnabled === true) {
      sendAttempted = true;
      if (!runtimeConfig.whatsappBusiness?.accessToken || !runtimeConfig.whatsappBusiness?.phoneNumberId) {
        sendResult = { ok: false, sent: false, status: "meta_configuration_incomplete", error: "meta_configuration_incomplete" };
        reason = "meta_configuration_incomplete";
      } else if (typeof whatsappProvider?.sendMessage !== "function") {
        sendResult = { ok: false, sent: false, status: "meta_provider_unavailable", error: "meta_provider_unavailable" };
        reason = "meta_send_failed";
      } else {
        sendResult = await whatsappProvider?.sendMessage?.({
          to: outboundCommand.recipient,
          message: { type: "text", text: outboundCommand.text },
          phoneNumberId: outboundCommand.phoneNumberId
        });
        reason = sendResult?.sent ? "sent" : "meta_send_failed";
      }
    }
    const outboundResult = await conversationService.recordOutgoing(conversationResult.conversa.id, {
      text: outboundCommand.text,
      correlationId: outboundCommand.correlationId,
      sendResult,
      status: sendResult?.sent ? "sent" : sendResult?.status || reason,
      metaMessageType: sendResult?.metaMessageType || reply.type || "text"
    });
    if (messageService?.appendMessage) {
      await messageService.appendMessage({
        direction: "out",
        normalized: {
          provider: "meta",
          from: incoming.telefone || "",
          customer: { name: incoming.nome || incoming.profileName || "", phone: incoming.telefone || "" },
          messageId: outboundCommand.correlationId,
          correlationId: outboundCommand.correlationId,
          message: outboundCommand.text
        },
        text: outboundCommand.text,
        sendResult
      });
    }
    await safeAuditRecord(auditService, {
      type: sendResult?.sent ? "whatsapp_v2_operational_reply_sent" : "whatsapp_v2_operational_reply_not_sent",
      status: sendResult?.sent ? "info" : "warning",
      source: "meta_whatsapp",
      message: sendResult?.sent ? "WhatsApp V2 respondeu pelo provider Meta" : "WhatsApp V2 gerou resposta sem envio Meta",
      context: {
        messageId: incoming.messageId || "",
        phone: maskPhone(incoming.telefone || ""),
        mode: "operational",
        source: processed.source || "",
        automaticReplyCreated: true,
        sent: Boolean(sendResult?.sent),
        reason,
        aiEnabled: false,
        autoReplyEnabled: true,
        sendEnabled: runtimeConfig.whatsappV2?.sendEnabled === true,
        senderCalled: sendAttempted,
        providerStatus: sendResult?.status || ""
      },
      dedupeKey: incoming.messageId ? `whatsapp-v2-operational:${incoming.messageId}` : undefined
    });
    return {
      ok: sendResult?.sent || !sendAttempted,
      handled: true,
      engine: "v2",
      mode: "operational",
      reason,
      automaticReplyCreated: true,
      sent: Boolean(sendResult?.sent),
      aiCalled: false,
      senderCalled: sendAttempted,
      outboxCreated: true,
      messageId: outboundResult.message?.id || "",
      providerMessageId: sendResult?.providerMessageId || "",
      outboundCommand: {
        conversationId: outboundCommand.conversationId,
        recipient: outboundCommand.recipient,
        text: outboundCommand.text,
        interactive: outboundCommand.interactive,
        correlationId: outboundCommand.correlationId,
        phoneNumberIdReceived: outboundCommand.phoneNumberId ? true : false
      },
      conversa: outboundResult.conversa || conversationResult.conversa,
      message: conversationResult.message,
      outboundMessage: outboundResult.message || null,
      normalized: messageResult?.normalized || null,
      operational: {
        source: processed.source || "",
        replyType: reply.type || "text",
        metaMessageType: sendResult?.metaMessageType || reply.type || "text",
        fallbackUsed: Boolean(sendResult?.fallbackUsed)
      }
    };
  }

  await safeAuditRecord(auditService, {
    type: "whatsapp_v2_disabled",
    status: "warning",
    source: "meta_whatsapp",
    message: "WhatsApp V2 disabled; inbound message recorded without automation",
    context: {
      messageId: incoming.messageId || "",
      phone: maskPhone(incoming.telefone || ""),
      messageType: incoming.tipo || "",
      automaticReplyCreated: false
    },
    dedupeKey: incoming.messageId ? `whatsapp-v2-disabled:${incoming.messageId}` : undefined
  });
  return {
    ok: true,
    handled: false,
    engine: "disabled",
    reason: "whatsapp_v2_disabled",
    automaticReplyCreated: false,
    sent: false,
    conversa: conversationResult.conversa,
    message: conversationResult.message,
    normalized: messageResult?.normalized || null
  };
}

function createWhatsAppV2Repository(runtimeConfig = getRuntimeConfig()) {
  return new FileWhatsAppV2ConversationRepository({
    filePath: join(runtimeConfig.dataDir || "data", "whatsapp-v2-state.json")
  });
}

function buildV2OutboundCommand({ incoming = {}, reply = {}, correlationId = "" } = {}) {
  const recipient = String(incoming.sendTo || incoming.telefone || incoming.from || incoming.phone || "").trim();
  return {
    conversationId: String(incoming.telefone || incoming.from || incoming.phone || "").trim(),
    recipient,
    text: renderV2ReplyAsText(reply),
    interactive: null,
    correlationId,
    phoneNumberId: String(incoming.phoneNumberIdReceived || "").trim()
  };
}

function renderV2ReplyAsText(reply = {}) {
  if (reply.type === "menu" && reply.menu) {
    const optionText = reply.menu.options?.map((item) => item.fallbackText || `${item.order}. ${item.title}`).join("\n") || "";
    return [
      reply.menu.title || "",
      reply.menu.body || "",
      optionText
    ].filter(Boolean).join("\n");
  }
  return String(reply.text || "");
}

async function reserveIncomingMessage(repository, incoming = {}) {
  const messageId = String(incoming.messageId || "").trim();
  if (!messageId) return { reserved: false, duplicate: false };
  const reserved = await repository.reserveMessage(messageId);
  return { reserved, duplicate: !reserved };
}

async function processWhatsAppV2(incoming = {}, runtimeConfig = getRuntimeConfig(), { conversationRepository = createWhatsAppV2Repository(runtimeConfig), reserved = false } = {}) {
  const engine = createWhatsAppV2OperationalEngine({
    conversationRepository
  });
  return engine.processor.handleIncoming({
    messageId: incoming.messageId || "",
    conversationId: incoming.telefone || incoming.from || incoming.phone || "",
    from: incoming.telefone || incoming.from || incoming.phone || "",
    text: incoming.text || incoming.message || incoming.transcricao || "",
    phoneNumberIdReceived: incoming.phoneNumberIdReceived || "",
    receivedAt: new Date().toISOString(),
    reserved
  });
}

function maskPhone(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

async function safeAuditRecord(auditService, entry) {
  try {
    await auditService?.record?.(entry);
  } catch (error) {
    console.info("whatsapp.maintenance.audit_failed", {
      status: "audit_failed",
      error: String(error?.message || error)
    });
  }
}
