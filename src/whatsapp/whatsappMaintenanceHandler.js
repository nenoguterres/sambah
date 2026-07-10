import { parseWhatsAppIncoming } from "../whatsappConversationService.js";
import { getRuntimeConfig } from "../config.js";
import { createWhatsAppV2LabEngine } from "./v2/whatsappV2LabEngine.js";
import { FileWhatsAppV2ConversationRepository } from "./v2/inMemoryRepositories.js";
import { join } from "node:path";

export async function whatsappMaintenanceHandler(payload = {}, { conversationService, messageService, auditService, runtimeConfig = getRuntimeConfig() } = {}) {
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
    const observed = await observeWhatsAppV2(incoming, runtimeConfig);
    await safeAuditRecord(auditService, {
      type: "whatsapp_v2_observe_only",
      status: "info",
      source: "meta_whatsapp",
      message: "WhatsApp V2 observou entrada local sem resposta automatica",
      context: {
        messageId: incoming.messageId || "",
        phone: maskPhone(incoming.telefone || ""),
        mode: "observe_only",
        source: observed.source || "",
        repliesObserved: observed.repliesObserved || 0,
        automaticReplyCreated: false,
        sent: false,
        aiEnabled: false,
        autoReplyEnabled: false,
        sendEnabled: false
      },
      dedupeKey: incoming.messageId ? `whatsapp-v2-observe:${incoming.messageId}` : undefined
    });
    return {
      ok: true,
      handled: true,
      engine: "v2",
      mode: "observe_only",
      reason: "whatsapp_v2_observe_only",
      automaticReplyCreated: false,
      sent: false,
      aiCalled: false,
      senderCalled: false,
      outboxCreated: false,
      conversa: conversationResult.conversa,
      message: conversationResult.message,
      normalized: messageResult?.normalized || null,
      observed: {
        source: observed.source || "",
        repliesObserved: observed.repliesObserved || 0,
        duplicate: observed.duplicate === true
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

async function observeWhatsAppV2(incoming = {}, runtimeConfig = getRuntimeConfig()) {
  const engine = createWhatsAppV2LabEngine({
    observeOnly: true,
    conversationRepository: new FileWhatsAppV2ConversationRepository({
      filePath: join(runtimeConfig.dataDir || "data", "whatsapp-v2-state.json")
    })
  });
  return engine.processor.handleIncoming({
    messageId: incoming.messageId || "",
    conversationId: incoming.telefone || incoming.from || incoming.phone || "",
    from: incoming.telefone || incoming.from || incoming.phone || "",
    text: incoming.text || incoming.message || incoming.transcricao || "",
    receivedAt: new Date().toISOString()
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
