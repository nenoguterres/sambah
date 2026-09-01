import { parseWhatsAppIncoming } from "../whatsappConversationService.js";
import { getRuntimeConfig } from "../config.js";
import { createWhatsAppV2OperationalEngine } from "./v2/whatsappV2LabEngine.js";
import { FileWhatsAppV2ConversationRepository } from "./v2/inMemoryRepositories.js";
import { join } from "node:path";

export async function whatsappMaintenanceHandler(payload = {}, { conversationService, messageService, auditService, menuService = null, whatsappProvider = null, eventEmailAlertService = null, runtimeConfig = getRuntimeConfig() } = {}) {
  const requestStartedAt = Date.now();
  const incoming = parseWhatsAppIncoming(payload);
  const conversationResult = await conversationService.recordNeutralIncoming(incoming);
  const messageResult = await safeHandleIncomingHistory(messageService, payload, incoming);
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

  if (runtimeConfig.whatsappV2?.enabled === true && !String(incoming.text || "").trim()) {
    await safeAuditRecord(auditService, {
      type: "whatsapp_non_text_message_recorded",
      status: "info",
      source: "meta_whatsapp",
      message: "Mensagem nao textual registrada sem disparar o Portal",
      context: {
        messageId: incoming.messageId || "",
        phone: maskPhone(incoming.telefone || ""),
        messageType: incoming.rawType || incoming.tipo || "unknown",
        automaticReplyCreated: false,
        sent: false
      },
      dedupeKey: incoming.messageId ? `whatsapp-non-text:${incoming.messageId}` : undefined
    });
    return {
      ok: true,
      handled: true,
      engine: "v2",
      reason: "non_text_message_recorded",
      automaticReplyCreated: false,
      sent: false,
      aiCalled: false,
      senderCalled: false,
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
    const processed = await processWhatsAppV2({
      ...incoming,
      sambahConversationId: conversationResult.conversa.id
    }, runtimeConfig, {
      conversationRepository: v2Repository,
      menuService,
      reserved: reservation.reserved
    });
    const processingMs = Date.now() - requestStartedAt;
    if (processed.state?.mode === "human" || processed.state?.serviceState === "HUMANO") {
      const humanResult = await conversationService.markHuman?.(conversationResult.conversa.id);
      if (humanResult?.ok) conversationResult.conversa = humanResult.conversa;
    }
    const operatorEmailAlert = await maybeSendOperatorEmail({
      processed,
      incoming,
      conversation: conversationResult.conversa,
      eventEmailAlertService,
      runtimeConfig
    });
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
          reason: processed.source === "humanState" ? "human_state_blocks_automation" : "no_reply_created",
          processingMs,
          engineLatency: processed.latency || null
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
          message: outboundCommand.message,
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
      await safeAppendOutgoingHistory(messageService, {
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
        providerStatus: sendResult?.status || "",
        processingMs,
        totalWebhookMs: Date.now() - requestStartedAt,
        engineLatency: processed.latency || null
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
        fallbackUsed: Boolean(sendResult?.fallbackUsed),
        processingMs,
        totalWebhookMs: Date.now() - requestStartedAt,
        engineLatency: processed.latency || null
      },
      operatorEmailAlert
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

async function maybeSendOperatorEmail({ processed = {}, incoming = {}, conversation = {}, eventEmailAlertService = null, runtimeConfig = getRuntimeConfig() } = {}) {
  const action = processed.actions?.find((item) => item.type === "notify_operator" && item.emailAlert === true);
  if (!action || !eventEmailAlertService) return null;
  const messageId = String(incoming.messageId || "").trim();
  const conversationId = conversation.id || processed.state?.sambahConversationId || processed.state?.conversationId || "";
  const base = String(runtimeConfig.eventFormPublicUrl || runtimeConfig.baseUrl || "https://sambah.onrender.com").trim();
  let origin = "https://sambah.onrender.com";
  try {
    origin = new URL(base).origin;
  } catch {}
  const conversationUrl = `${origin}/conversas?conversationId=${encodeURIComponent(conversationId)}`;
  const subject = `[WHATSAPP] ${action.subject || "Atendimento humano solicitado"}`;
  const body = [
    "O SamBah identificou uma solicitacao que precisa de atendimento humano.",
    "",
    `Cliente: ${conversation.nome || incoming.nome || incoming.profileName || "Cliente WhatsApp"}`,
    `Telefone: ${conversation.telefone || incoming.telefone || incoming.from || "Nao informado"}`,
    `Mensagem: ${incoming.text || incoming.message || "Nao informada"}`,
    action.summary ? `Resumo: ${action.summary}` : "",
    "",
    `ABRIR CONVERSA NO SAMBAH: ${conversationUrl}`
  ].filter(Boolean).join("\n");
  try {
    const created = await eventEmailAlertService.createAlert({
      eventRequestId: `whatsapp_${messageId || conversationId}`,
      conversationId,
      subject,
      body,
      conversationUrl
    });
    const sent = await eventEmailAlertService.sendAlert(created.alert.alertId);
    return {
      ok: sent.ok === true,
      status: sent.alert?.status || created.alert.status || "",
      alertId: created.alert.alertId,
      error: sent.error || ""
    };
  } catch (error) {
    return { ok: false, status: "FAILED", error: String(error?.message || error) };
  }
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
    message: normalizeV2ProviderMessage(reply),
    interactive: ["menu", "url_button", "product_card"].includes(reply.type) ? reply : null,
    correlationId,
    phoneNumberId: String(incoming.phoneNumberIdReceived || "").trim()
  };
}

function normalizeV2ProviderMessage(reply = {}) {
  if (["menu", "url_button", "product_card"].includes(reply.type)) return reply;
  return { type: "text", text: renderV2ReplyAsText(reply) };
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

async function processWhatsAppV2(incoming = {}, runtimeConfig = getRuntimeConfig(), { conversationRepository = createWhatsAppV2Repository(runtimeConfig), menuService = null, reserved = false } = {}) {
  const engine = createWhatsAppV2OperationalEngine({
    conversationRepository,
    menuService
  });
  return engine.processor.handleIncoming({
    messageId: incoming.messageId || "",
    conversationId: incoming.telefone || incoming.from || incoming.phone || "",
    sambahConversationId: incoming.sambahConversationId || "",
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

async function safeHandleIncomingHistory(messageService, payload, incoming = {}) {
  if (typeof messageService?.handleIncoming !== "function") return null;
  try {
    return await messageService.handleIncoming(payload);
  } catch (error) {
    console.info("whatsapp.message_history.inbound_failed", {
      status: "auxiliary_persistence_failed",
      messageId: incoming.messageId || "",
      phone: maskPhone(incoming.telefone || ""),
      error: String(error?.code || error?.message || error)
    });
    return null;
  }
}

async function safeAppendOutgoingHistory(messageService, entry) {
  try {
    return await messageService.appendMessage(entry);
  } catch (error) {
    console.info("whatsapp.message_history.outbound_failed", {
      status: "auxiliary_persistence_failed",
      messageId: entry?.normalized?.messageId || "",
      phone: maskPhone(entry?.normalized?.from || ""),
      error: String(error?.code || error?.message || error)
    });
    return null;
  }
}
