import { normalizeWhatsAppPhone, whatsappPhoneAliases } from "../phoneNumber.js";

export class MetaCloudWhatsAppProvider {
  constructor({ config = {}, fetchImpl = globalThis.fetch } = {}) {
    this.name = "meta";
    this.config = config;
    this.fetch = fetchImpl;
    this.timeoutMs = Math.max(1000, Number(config.timeoutMs || config.requestTimeoutMs || 10000));
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

  async sendMessage({ to, message, phoneNumberId = "" } = {}) {
    const sendPhoneNumberId = String(phoneNumberId || this.config.phoneNumberId || "").trim();
    if (!sendPhoneNumberId || !this.config.accessToken) {
      return {
        ok: false,
        provider: this.name,
        sent: false,
        status: "meta_configuration_incomplete",
        error: "meta_configuration_incomplete"
      };
    }

    const version = this.config.apiVersion || "v25.0";
    const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(sendPhoneNumberId)}/messages`;
    try {
      const normalizedTo = preferredMetaRecipient(to);
      const outbound = buildMetaMessagePayload({ to: normalizedTo, message });
      const firstAttempt = await sendMetaPayload(this.fetch, endpoint, this.config.accessToken, outbound.body, { timeoutMs: this.timeoutMs });
      let attempt = firstAttempt;
      const retryTo = metaBrazilianAllowedListRetryNumber(normalizedTo, firstAttempt.body);
      if (!firstAttempt.response.ok && retryTo) {
        const retryOutbound = buildMetaMessagePayload({ to: retryTo, message });
        const retryAttempt = await sendMetaPayload(this.fetch, endpoint, this.config.accessToken, retryOutbound.body, { timeoutMs: this.timeoutMs });
        attempt = {
          ...retryAttempt,
          retried: true,
          originalTo: normalizedTo,
          retryTo,
          firstResponse: sanitizeMetaPayload(firstAttempt.body, this.config.accessToken)
        };
      }
      let fallback = null;
      if (!attempt.response.ok && outbound.interactive && !attempt.retried) {
        fallback = await sendMetaPayload(this.fetch, endpoint, this.config.accessToken, buildTextPayload({ to: normalizedTo, text: outbound.fallbackText }), { timeoutMs: this.timeoutMs });
        attempt = fallback;
      }
      const providerMessageId = extractProviderMessageId(attempt.body);
      const accepted = Boolean(attempt.response.ok && providerMessageId);
      return {
        ok: accepted,
        provider: this.name,
        sent: accepted,
        status: attempt.response.ok ? (providerMessageId ? "sent" : "meta_missing_message_id") : "meta_error",
        httpStatus: attempt.response.status,
        response: sanitizeMetaPayload(attempt.body, this.config.accessToken),
        providerMessageId,
        metaMessageType: fallback?.response?.ok ? "text_fallback" : outbound.type,
        fallbackUsed: Boolean(fallback?.response?.ok && providerMessageId),
        ...(attempt.retried ? {
          retried: true,
          originalTo: attempt.originalTo,
          retryTo: attempt.retryTo,
          firstResponse: attempt.firstResponse
        } : {})
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        return {
          ok: false,
          provider: this.name,
          sent: false,
          status: "meta_timeout",
          error: "meta_timeout"
        };
      }
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

async function sendMetaPayload(fetchImpl, endpoint, accessToken, body, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const responseBody = await readBody(response);
    return { response, body: responseBody };
  } finally {
    clearTimeout(timeout);
  }
}

function buildMetaMessagePayload({ to, message = {} } = {}) {
  if (message.type === "product_card" && Array.isArray(message.buttons) && message.buttons.length > 0) {
    const imageUrl = /^https:\/\//i.test(String(message.imageUrl || "").trim()) ? String(message.imageUrl).trim() : "";
    return {
      type: "interactive_product_card",
      interactive: true,
      fallbackText: String(message.text || ""),
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          ...(imageUrl ? { header: { type: "image", image: { link: imageUrl } } } : {}),
          body: { text: trimMetaText(message.text || "Produto") },
          action: {
            buttons: message.buttons.slice(0, 3).map((button) => ({
              type: "reply",
              reply: { id: String(button.id).slice(0, 256), title: trimMetaButtonTitle(button.title) }
            }))
          }
        }
      }
    };
  }
  if (message.type === "url_button" && message.url) {
    const fallbackText = `${message.text || ""}\n${message.buttonText || "ABRIR"}: ${message.url}`.trim();
    return {
      type: "interactive_cta_url",
      interactive: true,
      fallbackText,
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: trimMetaText(message.text || "Abrir link") },
          action: {
            name: "cta_url",
            parameters: {
              display_text: trimMetaButtonTitle(message.buttonText || "ABRIR"),
              url: String(message.url).slice(0, 2000)
            }
          }
        }
      }
    };
  }
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
            button: trimMetaButtonTitle(message.menu.buttonText || message.menu.title || "Opcoes"),
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
  if (responseBody?.error?.code !== 131030) return "";
  const aliases = whatsappPhoneAliases(phone);
  return aliases.find((alias) => alias !== String(phone || "").replace(/\D/g, "")) || "";
}

function preferredMetaRecipient(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || normalizeWhatsAppPhone(value);
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
