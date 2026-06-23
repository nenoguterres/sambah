export class MetaCloudWhatsAppProvider {
  constructor({ config = {}, fetchImpl = globalThis.fetch } = {}) {
    this.name = "meta";
    this.config = config;
    this.fetch = fetchImpl;
  }

  status() {
    return {
      provider: this.name,
      configured: Boolean(this.config.phoneNumberId && this.config.accessToken),
      sendEnabled: this.config.sendEnabled === true,
      phoneNumberIdConfigured: Boolean(this.config.phoneNumberId),
      accessTokenConfigured: Boolean(this.config.accessToken),
      verifyTokenConfigured: Boolean(this.config.verifyToken)
    };
  }

  async sendText({ to, text } = {}) {
    if (!this.config.phoneNumberId || !this.config.accessToken) {
      return {
        ok: false,
        provider: this.name,
        sent: false,
        status: "missing_meta_config",
        error: "missing_meta_config"
      };
    }

    const version = this.config.apiVersion || "v21.0";
    const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(this.config.phoneNumberId)}/messages`;
    try {
      const response = await this.fetch(endpoint, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${this.config.accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: text }
        })
      });
      const body = await readBody(response);
      return {
        ok: response.ok,
        provider: this.name,
        sent: response.ok,
        status: response.ok ? "sent" : "meta_error",
        httpStatus: response.status,
        response: sanitizeMetaPayload(body, this.config.accessToken)
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        sent: false,
        status: "meta_request_failed",
        error: sanitizeMetaText(error.message, this.config.accessToken)
      };
    }
  }
}

async function readBody(response) {
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } catch {
    return null;
  }
}

function sanitizeMetaPayload(value, accessToken = "") {
  if (Array.isArray(value)) return value.map((item) => sanitizeMetaPayload(item, accessToken));
  if (!value || typeof value !== "object") return sanitizeMetaText(value, accessToken);
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = "[masked]";
      continue;
    }
    sanitized[key] = sanitizeMetaPayload(item, accessToken);
  }
  return sanitized;
}

function sanitizeMetaText(value, accessToken = "") {
  if (typeof value !== "string") return value;
  let text = value;
  if (accessToken) text = text.split(accessToken).join("[masked]");
  return text
    .replace(/(access_token=)[^&\s]+/gi, "$1[masked]")
    .replace(/(access_token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[masked]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/g, "$1[masked]");
}

function isSensitiveKey(key = "") {
  return /token|authorization|secret|password|credential/i.test(key);
}
