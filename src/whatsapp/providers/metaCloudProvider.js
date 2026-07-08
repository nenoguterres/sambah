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

    const version = this.config.apiVersion || "v25.0";
    const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(this.config.phoneNumberId)}/messages`;
    try {
      const firstAttempt = await sendMetaText(this.fetch, endpoint, this.config.accessToken, { to, text });
      let attempt = firstAttempt;
      const attempts = [buildMetaAttemptLog({ to, attempt: firstAttempt, accessToken: this.config.accessToken })];
      const retryTo = metaBrazilianAllowedListRetryNumber(to, firstAttempt.body);
      if (!firstAttempt.response.ok && retryTo) {
        const retryAttempt = await sendMetaText(this.fetch, endpoint, this.config.accessToken, { to: retryTo, text });
        attempts.push(buildMetaAttemptLog({ to: retryTo, attempt: retryAttempt, accessToken: this.config.accessToken }));
        attempt = {
          ...retryAttempt,
          retried: true,
          originalTo: to,
          retryTo,
          firstResponse: sanitizeMetaPayload(firstAttempt.body, this.config.accessToken)
        };
      }
      return {
        ok: attempt.response.ok,
        provider: this.name,
        sent: attempt.response.ok,
        status: attempt.response.ok ? "sent" : "meta_error",
        httpStatus: attempt.response.status,
        response: sanitizeMetaPayload(attempt.body, this.config.accessToken),
        attempts,
        ...(attempt.retried ? {
          retried: true,
          originalTo: attempt.originalTo,
          retryTo: attempt.retryTo,
          firstResponse: attempt.firstResponse
        } : {})
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

function buildMetaAttemptLog({ to = "", attempt = {}, accessToken = "" } = {}) {
  return {
    to,
    httpStatus: attempt.response?.status || null,
    ok: Boolean(attempt.response?.ok),
    response: sanitizeMetaPayload(attempt.body, accessToken)
  };
}

async function sendMetaText(fetchImpl, endpoint, accessToken, { to, text }) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
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
  return { response, body };
}

function metaBrazilianAllowedListRetryNumber(phone = "", responseBody = {}) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (responseBody?.error?.code !== 131030) return "";
  if (!digits.startsWith("55")) return "";
  if (digits.length === 12) return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  if (digits.length === 13 && digits[4] === "9") return `${digits.slice(0, 4)}${digits.slice(5)}`;
  return "";
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
