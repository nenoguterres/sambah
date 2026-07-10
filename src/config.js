import { readFileSync } from "node:fs";

export const API_BASES = {
  local: "http://localhost:3000",
  production: "https://api.insanofoodtruck.com.br",
  alternative: "https://api.sambahcrm.com.br"
};

export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://insanofoodtruck.com.br",
  "https://www.insanofoodtruck.com.br",
  "https://api.insanofoodtruck.com.br",
  "https://api.sambahcrm.com.br"
];

export function getBaseApi(env = globalThis.process?.env || {}) {
  return env.BASE_API || env.BASE_URL || env.SAMBAH_BASE_API || (env.NODE_ENV === "production" ? API_BASES.production : API_BASES.local);
}

export function getRuntimeConfig(env = globalThis.process?.env || {}) {
  const localEnv = loadLocalEnv();
  return {
    nodeEnv: env.NODE_ENV || "development",
    port: Number(env.PORT || 3000),
    baseUrl: env.BASE_URL || API_BASES.local,
    publicBaseUrl: env.PUBLIC_BASE_URL || "https://insanofoodtruck.com.br",
    corsOrigins: parseList(env.CORS_ORIGINS, DEFAULT_CORS_ORIGINS),
    whatsappNumber: env.WHATSAPP_NUMBER || "5551980413745",
    insanoWhatsappNumber: env.INSANO_WHATSAPP_NUMBER || "",
    sitePublicToken: env.SITE_PUBLIC_TOKEN || "",
    siteOrdersEnabled: env.SITE_ORDERS_ENABLED !== "false",
    dataDir: env.DATA_DIR || "data",
    whatsappBusiness: {
      provider: firstEnv(env, localEnv, ["WHATSAPP_PROVIDER"]) || "mock",
      sendEnabled: firstEnv(env, localEnv, ["WHATSAPP_SEND_ENABLED"]) === "true",
      verifyToken: firstEnv(env, localEnv, ["META_VERIFY_TOKEN", "WHATSAPP_META_VERIFY_TOKEN", "SAMBAH_META_VERIFY_TOKEN", "WHATSAPP_VERIFY_TOKEN"]),
      accessToken: firstEnv(env, localEnv, ["META_ACCESS_TOKEN", "WHATSAPP_META_ACCESS_TOKEN", "SAMBAH_META_ACCESS_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_TOKEN"]),
      phoneNumberId: firstEnv(env, localEnv, ["META_PHONE_NUMBER_ID", "WHATSAPP_META_PHONE_NUMBER_ID", "SAMBAH_META_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID"]),
      businessAccountId: firstEnv(env, localEnv, ["META_WABA_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "SAMBAH_META_WABA_ID"]),
      webhookSecret: env.SAMBAH_WEBHOOK_SECRET || env.WHATSAPP_WEBHOOK_SECRET || "",
      apiVersion: firstEnv(env, localEnv, ["META_API_VERSION", "WHATSAPP_META_API_VERSION", "SAMBAH_META_API_VERSION"]) || "v25.0",
      apiBaseUrl: env.WHATSAPP_API_BASE_URL || "https://graph.facebook.com",
      publicWebhookUrl: firstEnv(env, localEnv, ["WEBHOOK_PUBLIC_URL", "SAMBAH_PUBLIC_WEBHOOK_URL"])
    },
    whatsappV2: {
      enabled: env.WHATSAPP_V2_ENABLED === "true",
      sendEnabled: env.WHATSAPP_SEND_ENABLED === "true",
      aiEnabled: env.WHATSAPP_AI_ENABLED === "true",
      autoReplyEnabled: env.WHATSAPP_AUTO_REPLY_ENABLED === "true",
      mode: "observe_only"
    },
    perolaInstagram: {
      enabled: firstEnv(env, localEnv, ["PEROLA_INSTAGRAM_ENABLED"]) === "true",
      accessToken: firstEnv(env, localEnv, ["PEROLA_INSTAGRAM_ACCESS_TOKEN"]),
      userId: firstEnv(env, localEnv, ["PEROLA_INSTAGRAM_USER_ID"]),
      account: firstEnv(env, localEnv, ["PEROLA_INSTAGRAM_ACCOUNT"]),
      apiVersion: firstEnv(env, localEnv, ["PEROLA_INSTAGRAM_API_VERSION"]) || "v25.0",
      apiBaseUrl: firstEnv(env, localEnv, ["PEROLA_INSTAGRAM_API_BASE_URL"]) || "https://graph.instagram.com"
    },
    sambahWhatsapp: {
      neno: env.SAMBAH_WHATSAPP_NENO || "5551980413745",
      kazuko: env.SAMBAH_WHATSAPP_KAZUKO || "5551997920292"
    },
    ai: {
      provider: env.AI_PROVIDER || "openai",
      openaiApiKey: env.OPENAI_API_KEY || "",
      openaiModel: env.OPENAI_MODEL || "",
      openaiTranscribeModel: env.OPENAI_TRANSCRIBE_MODEL || "",
      openaiTtsModel: env.OPENAI_TTS_MODEL || "",
      openaiTtsVoice: env.OPENAI_TTS_VOICE || "",
      sttProvider: env.STT_PROVIDER || "google",
      googleApplicationCredentials: env.GOOGLE_APPLICATION_CREDENTIALS || "",
      googleSttLanguage: env.GOOGLE_STT_LANGUAGE || "pt-BR",
      ttsProvider: env.TTS_PROVIDER || "google",
      googleTtsLanguage: env.GOOGLE_TTS_LANGUAGE || "pt-BR",
      googleTtsVoice: env.GOOGLE_TTS_VOICE || "",
      voiceReplyEnabled: env.VOICE_REPLY_ENABLED === "true",
      humanHandoffEnabled: env.HUMAN_HANDOFF_ENABLED !== "false",
      hasTranscriptionCredentials: Boolean(env.OPENAI_API_KEY || env.GOOGLE_APPLICATION_CREDENTIALS)
    }
  };
}

export function isAllowedCorsOrigin(origin, env = globalThis.process?.env || {}) {
  if (!origin) return true;
  return getRuntimeConfig(env).corsOrigins.includes(origin);
}

export function getPublicConfig(env = globalThis.process?.env || {}) {
  const runtime = getRuntimeConfig(env);
  return {
    ok: true,
    baseApi: getBaseApi(env),
    publicBaseUrl: runtime.publicBaseUrl,
    bases: API_BASES,
    endpoints: {
      siteLead: "/api/site/lead",
      eventQuote: "/api/site/orcamento-evento",
      siteCardapio: "/api/site/cardapio",
      sitePedido: "/api/site/pedido",
      quickOrder: "/api/site/pedido-rapido",
      precomanda: "/api/site/precomanda",
      whatsapp: "/api/site/whatsapp",
      insanoLead: "/api/site/insano/lead",
      insanoPedido: "/api/site/insano/pedido",
      insanoEvento: "/api/site/insano/evento",
      insanoWhatsapp: "/api/site/insano/whatsapp"
    }
  };
}

function parseList(value, fallback) {
  if (!value) return [...fallback];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
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

