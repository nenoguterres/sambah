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
  return {
    nodeEnv: env.NODE_ENV || "development",
    port: Number(env.PORT || 3000),
    baseUrl: env.BASE_URL || API_BASES.local,
    publicBaseUrl: env.PUBLIC_BASE_URL || "https://insanofoodtruck.com.br",
    corsOrigins: parseList(env.CORS_ORIGINS, DEFAULT_CORS_ORIGINS),
    whatsappNumber: env.WHATSAPP_NUMBER || "5551980413745",
    dataDir: env.DATA_DIR || "data"
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
