import { parseWhatsAppIncoming } from "../whatsappConversationService.js";

export async function whatsappMaintenanceHandler(payload = {}, { conversationService, messageService, auditService } = {}) {
  const incoming = parseWhatsAppIncoming(payload);
  const conversationResult = await conversationService.recordNeutralIncoming(incoming);
  const messageResult = messageService ? await messageService.handleIncoming(payload) : null;
  await safeAuditRecord(auditService, {
    type: "whatsapp_engine_disabled",
    status: "warning",
    source: "meta_whatsapp",
    message: "WhatsApp automatic engine disabled; inbound message recorded without automation",
    context: {
      messageId: incoming.messageId || "",
      phone: maskPhone(incoming.telefone || ""),
      messageType: incoming.tipo || "",
      automaticReplyCreated: false
    },
    dedupeKey: incoming.messageId ? `whatsapp-disabled:${incoming.messageId}` : undefined
  });
  return {
    ok: true,
    handled: false,
    engine: "disabled",
    reason: "whatsapp_engine_disabled",
    automaticReplyCreated: false,
    sent: false,
    conversa: conversationResult.conversa,
    message: conversationResult.message,
    normalized: messageResult?.normalized || null
  };
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
