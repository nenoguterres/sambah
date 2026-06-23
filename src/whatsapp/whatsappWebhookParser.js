export function parseWhatsAppWebhookPayload(payload = {}) {
  if (isMetaWhatsAppPayload(payload)) return parseMetaPayload(payload);
  return parseMockPayload(payload);
}

export function isMetaWhatsAppPayload(payload = {}) {
  return Array.isArray(payload.entry) && Boolean(payload.entry[0]?.changes?.[0]?.value?.messages?.[0]);
}

function parseMetaPayload(payload) {
  const value = payload.entry?.[0]?.changes?.[0]?.value || {};
  const message = value.messages?.[0] || {};
  const contact = value.contacts?.[0] || {};
  const text = extractWhatsAppMessageText(message, payload);
  const from = normalizePhone(message.from || contact.wa_id || "");
  return {
    provider: "meta",
    source: "whatsapp",
    messageId: message.id || "",
    from,
    customer: {
      name: contact.profile?.name || "",
      phone: from
    },
    type: message.type || "",
    message: String(text || "").trim(),
    timestamp: message.timestamp || "",
    raw: payload
  };
}

export function extractWhatsAppMessageText(message = {}, payload = {}) {
  const interactive = message.interactive || {};
  const nfmReply = interactive.nfm_reply || {};
  return firstText([
    message.text?.body,
    message.button?.text,
    message.button?.payload,
    interactive.button_reply?.title,
    interactive.button_reply?.id,
    interactive.list_reply?.title,
    interactive.list_reply?.description,
    interactive.list_reply?.id,
    nfmReply.body,
    nfmReply.name,
    responseJsonText(nfmReply.response_json),
    message.image?.caption,
    message.video?.caption,
    message.document?.caption,
    message.order?.text,
    message.referral?.body,
    message.referral?.headline,
    payload.message,
    payload.text,
    payload.body
  ]);
}

function parseMockPayload(payload) {
  const from = normalizePhone(payload.from || payload.phone || payload.telefone || payload.customer?.phone || "");
  return {
    provider: "mock",
    source: payload.source || "whatsapp",
    messageId: payload.eventId || payload.messageId || "",
    from,
    customer: {
      name: payload.customer?.name || payload.name || payload.nome || "",
      phone: from
    },
    message: String(payload.message || payload.text || payload.body || payload.order?.notes || payload.notes || "").trim(),
    timestamp: payload.timestamp || "",
    raw: payload
  };
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return digits.length >= 10 ? `55${digits}` : digits;
}

function firstText(values = []) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function responseJsonText(value) {
  if (!value) return "";
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return "";
    return Object.values(parsed)
      .flatMap((item) => (item && typeof item === "object" ? Object.values(item) : [item]))
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(" ");
  } catch {
    return String(value || "").trim();
  }
}
