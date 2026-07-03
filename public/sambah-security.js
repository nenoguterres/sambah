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
  $("#securityNotice").textContent = message;
  $("#securityNotice").classList.toggle("error", Boolean(error));
}

function kpi(label, value) {
  return `<article class="eco-kpi"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function row(title, item, actions = "") {
  return `<article class="eco-table-card">
    <header><strong>${esc(title)}</strong><small>${esc(item.severity || item.status || item.eventType || "")}</small></header>
    <pre class="eco-pre">${esc(JSON.stringify(item, null, 2))}</pre>
    ${actions}
  </article>`;
}

function incidentActions(incident) {
  const actions = ["acknowledge", "resolve", "dismiss", "escalate", "block_device_mock", "notify_operator_mock", "trigger_siren_mock"];
  return `<div class="eco-actions">${actions.map((action) => `<button class="eco-secondary" data-action="${esc(action)}" data-id="${esc(incident.id)}" type="button">${esc(action)}</button>`).join("")}</div>`;
}

async function load() {
  const dashboard = await getJson("/api/sambah-security/dashboard");
  $("#securityUpdated").textContent = new Date().toLocaleString("pt-BR");
  $("#securityKpis").innerHTML = [
    kpi("incidentes", dashboard.totals.incidents),
    kpi("abertos", dashboard.totals.open),
    kpi("criticos", dashboard.totals.critical),
    kpi("acoes_mockadas", dashboard.totals.actions_mocked),
    kpi("eventos", dashboard.totals.events)
  ].join("");
  $("#incidentList").innerHTML = (dashboard.recent_incidents || []).map((incident) => row(incident.eventType, incident, incidentActions(incident))).join("") || '<p class="eco-muted">Sem incidentes registrados.</p>';
  $("#futureContracts").innerHTML = (dashboard.future_contracts || []).map((contract) => row(contract.eventType, contract)).join("") || '<p class="eco-muted">Nenhum contrato preparado ainda.</p>';
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => actionIncident(button.dataset.id, button.dataset.action));
  });
  notice("Security Bridge sincronizado em modo simulado.");
}

async function simulate(type) {
  const result = await postJson(`/api/sambah-security/simulate/${encodeURIComponent(type)}`, { actor: "security-panel" });
  notice(result.ok ? `Incidente criado: ${result.incident.id}` : result.error, !result.ok);
  await load();
}

async function actionIncident(id, action) {
  const result = await postJson(`/api/sambah-security/incidents/${encodeURIComponent(id)}/${encodeURIComponent(action)}`, { actor: "security-panel" });
  notice(result.ok ? `Acao registrada: ${action}` : result.error, !result.ok);
  await load();
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshSecurity").addEventListener("click", load);
  document.querySelectorAll("[data-sim]").forEach((button) => button.addEventListener("click", () => simulate(button.dataset.sim)));
  load();
});
