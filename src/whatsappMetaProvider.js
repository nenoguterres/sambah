export class WhatsAppMetaProvider {
  constructor({ config = {}, fetchImpl = globalThis.fetch } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  status() {
    return {
      provider: "meta",
      enabled: this.config.sendEnabled === true,
      configured: Boolean(this.config.accessToken && this.config.phoneNumberId),
      accessTokenConfigured: Boolean(this.config.accessToken),
      phoneNumberIdConfigured: Boolean(this.config.phoneNumberId),
      verifyTokenConfigured: Boolean(this.config.verifyToken),
      publicWebhookUrlConfigured: Boolean(this.config.publicWebhookUrl)
    };
  }

  async sendText({ to, text } = {}) {
    if (this.config.sendEnabled !== true) return { ok: false, sent: false, error: "whatsapp_send_disabled" };
    if (!this.config.accessToken || !this.config.phoneNumberId) return { ok: false, sent: false, error: "whatsapp_meta_not_configured" };
    const phone = String(to || "").replace(/\D/g, "");
    const message = String(text || "").trim();
    if (!phone || !message) return { ok: false, sent: false, error: "whatsapp_recipient_or_text_missing" };

    const version = this.config.apiVersion || "v21.0";
    const baseUrl = String(this.config.apiBaseUrl || "https://graph.facebook.com").replace(/\/$/, "");
    try {
      const response = await this.fetch(`${baseUrl}/${version}/${encodeURIComponent(this.config.phoneNumberId)}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "text",
          text: { preview_url: false, body: message }
        })
      });
      const payload = await readBody(response);
      return {
        ok: response.ok,
        sent: response.ok,
        httpStatus: response.status,
        messageId: response.ok ? payload?.messages?.[0]?.id || null : null,
        error: response.ok ? null : safeMetaError(payload, response.status)
      };
    } catch {
      return { ok: false, sent: false, error: "whatsapp_meta_unavailable" };
    }
  }
}

async function readBody(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeMetaError(payload, status) {
  return String(payload?.error?.message || `Meta respondeu HTTP ${status}`).slice(0, 240);
}
