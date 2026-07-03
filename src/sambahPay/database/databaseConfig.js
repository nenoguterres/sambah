export function getDatabaseConfig(env = globalThis.process?.env || {}) {
  const mode = normalizeMode(env.DATABASE_MODE || "json");
  const databaseUrl = env.DATABASE_URL || "";
  return {
    mode,
    databaseUrl,
    maskedDatabaseUrl: maskDatabaseUrl(databaseUrl),
    isJson: mode === "json",
    isPostgres: mode === "postgres",
    postgresConfigured: Boolean(databaseUrl)
  };
}

export function normalizeMode(value = "json") {
  const mode = String(value || "json").trim().toLowerCase();
  return mode === "postgres" ? "postgres" : "json";
}

export function maskDatabaseUrl(value = "") {
  if (!value) return "";
  return String(value).replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:[masked]@");
}
