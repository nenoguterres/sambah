export class SambahMetaWhatsappService {
  constructor({ channelService, env = globalThis.process?.env || {} } = {}) {
    this.channel = channelService;
    this.verifyToken = env.META_VERIFY_TOKEN
      || env.WHATSAPP_META_VERIFY_TOKEN
      || env.SAMBAH_META_VERIFY_TOKEN
      || env.WHATSAPP_VERIFY_TOKEN
      || "sambah_local_verify";
  }

  verify(query) {
    if (query.get("hub.verify_token") !== this.verifyToken) return { ok: false, statusCode: 403, error: "invalid_verify_token" };
    return { ok: true, statusCode: 200, rawBody: query.get("hub.challenge") || "", contentType: "text/plain; charset=utf-8" };
  }

  async receiveWebhook(payload = {}) {
    const value = payload.entry?.[0]?.changes?.[0]?.value;
    if (!value) return { ok: false, statusCode: 400, error: "invalid_meta_payload" };
    if (Array.isArray(value.statuses) && value.statuses.length) return { ok: true, ignored: true, reason: "status_event" };
    if (!Array.isArray(value.messages) || !value.messages.length) return { ok: true, ignored: true, reason: "no_message" };

    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];
    const phone = message?.from;
    const text = message?.text?.body;
    if (!phone) return { ok: false, statusCode: 400, error: "invalid_meta_payload" };
    if (!text) return { ok: true, ignored: true, reason: "non_text_message" };

    return this.channel.receiveMessage({
      channel: "whatsapp",
      phone,
      name: contact?.profile?.name || "",
      message: text
    });
  }
}
