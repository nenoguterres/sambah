const $ = (selector) => document.querySelector(selector);

async function getJson(path) {
  const response = await fetch(path);
  return response.json();
}

async function postJson(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

function esc(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function notice(message, error = false) {
  $("#databaseNotice").textContent = message;
  $("#databaseNotice").classList.toggle("error", Boolean(error));
}

function kpi(label, value) {
  return `<article class="eco-kpi"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function row(title, item) {
  return `<article class="eco-table-card">
    <header><strong>${esc(title)}</strong><small>${esc(item.status || item.mode || item.name || "")}</small></header>
    <pre class="eco-pre">${esc(JSON.stringify(item, null, 2))}</pre>
  </article>`;
}

async function load() {
  const [health, config, migrations, repositories] = await Promise.all([
    getJson("/api/sambah-database/health"),
    getJson("/api/sambah-database/config"),
    getJson("/api/sambah-database/migrations"),
    getJson("/api/sambah-database/repositories")
  ]);
  $("#databaseMode").textContent = config.mode || "json";
  $("#databaseKpis").innerHTML = [
    kpi("migrations", migrations.total),
    kpi("tabelas_planejadas", repositories.plannedTables.length),
    kpi("postgres_configurado", config.postgresConfigured ? 1 : 0),
    kpi("json_ativo", health.json?.status === "active" ? 1 : 0)
  ].join("");
  $("#databaseHealth").innerHTML = [
    row("Config", config),
    row("Health", health)
  ].join("");
  $("#migrationList").innerHTML = migrations.items.map((item) => row(item.name, item)).join("");
  $("#repositoryList").innerHTML = repositories.plannedTables.map((table) => row(table, { table, status: "planned" })).join("");
  notice(config.mode === "json" ? "JSON/local ativo. PostgreSQL preparado como opcional." : "Modo PostgreSQL selecionado.");
}

async function dryRunMigrations() {
  const result = await postJson("/api/sambah-database/migrations/dry-run");
  await load();
  notice(result.ok ? `Dry-run pronto: ${result.migrations.length} migrations.` : result.error, !result.ok);
}

async function seedDemo() {
  const result = await postJson("/api/sambah-database/seed/demo");
  notice(result.ok ? result.message : result.error, !result.ok);
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshDatabase").addEventListener("click", load);
  $("#dryRunMigrations").addEventListener("click", dryRunMigrations);
  $("#seedDemo").addEventListener("click", seedDemo);
  load();
});
