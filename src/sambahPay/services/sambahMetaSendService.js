import { readFileSync } from "node:fs";

export class SambahMetaSendService {
  constructor({ env = globalThis.process?.env || {}, fetchImpl = globalThis.fetch } = {}) {
    const localEnv = loadLocalEnv();
    this.phoneNumberId = firstEnv(env, localEnv, ["META_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_META_PHONE_NUMBER_ID", "SAMBAH_META_PHONE_NUMBER_ID"]);
    this.wabaId = firstEnv(env, localEnv, ["META_WABA_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "SAMBAH_META_WABA_ID"]);
    this.accessToken = firstEnv(env, localEnv, ["META_ACCESS_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_META_ACCESS_TOKEN", "SAMBAH_META_ACCESS_TOKEN", "WHATSAPP_TOKEN"]);
    this.apiVersion = firstEnv(env, localEnv, ["META_API_VERSION", "WHATSAPP_META_API_VERSION", "SAMBAH_META_API_VERSION"]) || "v21.0";
    this.fetch = fetchImpl;
  }

  debug() {
    return {
      ok: true,
      phoneNumberId: this.phoneNumberId,
      wabaId: this.wabaId,
      apiVersion: this.apiVersion
    };
  }

  async sendText(input = {}) {
    const to = normalizePhone(input.to);
    const message = String(input.message || "").trim();
    if (!to) return { ok: false, statusCode: 400, error: "to_required" };
    if (!message) return { ok: false, statusCode: 400, error: "message_required" };
    if (!this.phoneNumberId || !this.accessToken) return { ok: false, statusCode: 400, error: "meta_credentials_missing" };

    const endpoint = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    console.log("[sambah-meta-send] phoneNumberId", this.phoneNumberId);
    console.log("[sambah-meta-send] endpoint", endpoint);
    const response = await this.fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: message }
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.log("[sambah-meta-send] error status", response.status);
      console.log("[sambah-meta-send] error code", body?.error?.code);
      console.log("[sambah-meta-send] error message", body?.error?.message);
      console.log("[sambah-meta-send] error data", JSON.stringify(body?.error?.error_data || null));
      console.log("[sambah-meta-send] response body", JSON.stringify(body));
      return { ok: false, statusCode: response.status, error: "meta_send_failed", meta: body };
    }
    return { ok: true, provider: "meta_whatsapp_cloud_api", statusCode: response.status, meta: body };
  }
}

function firstEnv(env, localEnv, keys) {
  for (const key of keys) {
    if (env[key]) return env[key];
  }
  for (const key of keys) {
    if (localEnv[key]) return localEnv[key];
  }
  return "";
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function loadLocalEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    return Object.fromEntries(raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }));
  } catch {
    return {};
  }
}
