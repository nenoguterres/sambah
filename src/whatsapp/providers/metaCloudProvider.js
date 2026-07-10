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
    return this.sendMessage({ to, message: { type: "text", text } });
  }

  async sendMessage({ to, message } = {}) {
    if (!this.config.phoneNumberId || !this.config.accessToken) {
      return {
        ok: false,
        provider: this.name,
        sent: false,
        status: "meta_configuration_incomplete",
        error: "meta_configuration_incomplete"
      };
    }

    const version = this.config.apiVersion || "v25.0";
    const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(this.config.phoneNumberId)}/messages`;
    try {
      const outbound = buildMetaMessagePayload({ to, message });
      const firstAttempt = await sendMetaPayload(this.fetch, endpoint, this.config.accessToken, outbound.body);
      let attempt = firstAttempt;
      const retryTo = metaBrazilianAllowedListRetryNumber(to, firstAttempt.body);
      if (!firstAttempt.response.ok && retryTo) {
        const retryOutbound = buildMetaMessagePayload({ to: retryTo, message });
        const retryAttempt = await sendMetaPayload(this.fetch, endpoint, this.config.accessToken, retryOutbound.body);
        attempt = {
          ...retryAttempt,
          retried: true,
          originalTo: to,
          retryTo,
          firstResponse: sanitizeMetaPayload(firstAttempt.body, this.config.accessToken)
        };
      }
      let fallback = null;
      if (!attempt.response.ok && outbound.interactive && !attempt.retried) {
        fallback = await sendMetaPayload(this.fetch, endpoint, this.config.accessToken, buildTextPayload({ to, text: outbound.fallbackText }));
        attempt = fallback;
      }
      return {
        ok: attempt.response.ok,
        provider: this.name,
        sent: attempt.response.ok,
        status: attempt.response.ok ? "sent" : "meta_error",
        httpStatus: attempt.response.status,
        response: sanitizeMetaPayload(attempt.body, this.config.accessToken),
        providerMessageId: extractProviderMessageId(attempt.body),
        metaMessageType: fallback?.response?.ok ? "text_fallback" : outbound.type,
        fallbackUsed: Boolean(fallback?.response?.ok),
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

async function sendMetaPayload(fetchImpl, endpoint, accessToken, body) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const responseBody = await readBody(response);
  return { response, body: responseBody };
}

function buildMetaMessagePayload({ to, message = {} } = {}) {
  if (message.type === "menu" && Array.isArray(message.menu?.options) && message.menu.options.length > 0) {
    const options = message.menu.options;
    const fallbackText = message.text || options.map((item) => item.fallbackText || item.title).join("\n");
    if (options.length <= 3) {
      return {
        type: "interactive_button",
        interactive: true,
        fallbackText,
        body: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: trimMetaText(message.menu.body || message.text || "Escolha uma opcao:") },
            action: {
              buttons: options.map((item) => ({
                type: "reply",
                reply: { id: String(item.id).slice(0, 256), title: trimMetaButtonTitle(item.title) }
              }))
            }
          }
        }
      };
    }
    return {
      type: "interactive_list",
      interactive: true,
      fallbackText,
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: trimMetaText(message.menu.body || message.text || "Escolha uma opcao:") },
          action: {
            button: trimMetaButtonTitle(message.menu.title || "Opcoes"),
            sections: [{
              title: trimMetaButtonTitle(message.menu.title || "Menu"),
              rows: options.map((item) => ({
                id: String(item.id).slice(0, 200),
                title: trimMetaButtonTitle(item.title),
                description: trimMetaDescription(item.description || "")
              }))
            }]
          }
        }
      }
    };
  }
  return {
    type: "text",
    interactive: false,
    fallbackText: String(message.text || ""),
    body: buildTextPayload({ to, text: String(message.text || "") })
  };
}

function buildTextPayload({ to, text }) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: String(text || "") }
  };
}

function trimMetaText(value = "") {
  return String(value || "").slice(0, 1024);
}

function trimMetaButtonTitle(value = "") {
  return String(value || "Opcao").slice(0, 20);
}

function trimMetaDescription(value = "") {
  return String(value || "").slice(0, 72);
}

function extractProviderMessageId(body = {}) {
  return body?.messages?.[0]?.id || "";
}

function metaBrazilianAllowedListRetryNumber(phone = "", responseBody = {}) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits.startsWith("55") || digits.length !== 12) return "";
  if (responseBody?.error?.code !== 131030) return "";
  return `${digits.slice(0, 4)}9${digits.slice(4)}`;
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
