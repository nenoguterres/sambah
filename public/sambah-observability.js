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
  $("#observabilityNotice").textContent = message;
  $("#observabilityNotice").classList.toggle("error", Boolean(error));
}

function kpi(label, value) {
  return `<article class="eco-kpi"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function row(title, item, action = "") {
  return `<article class="eco-table-card">
    <header><strong>${esc(title)}</strong><small>${esc(item.status || item.severity || item.stage || "")}</small></header>
    <pre class="eco-pre">${esc(JSON.stringify(item, null, 2))}</pre>
    ${action}
  </article>`;
}

function resolveButton(alert) {
  if (alert.status === "resolved") return "";
  return `<button class="eco-secondary" data-resolve-alert="${esc(alert.id)}" type="button">Resolver alerta</button>`;
}

async function load() {
  const [health, metrics, traces, alerts] = await Promise.all([
    getJson("/api/sambah-observability/health"),
    getJson("/api/sambah-observability/metrics"),
    getJson("/api/sambah-observability/traces?limit=30"),
    getJson("/api/sambah-observability/alerts")
  ]);
  $("#healthState").textContent = health.status || "operational";
  $("#healthKpis").innerHTML = [
    kpi("total_events", metrics.total_events),
    kpi("pending_events", metrics.pending_events),
    kpi("failed_events", metrics.failed_events),
    kpi("dead_letter_events", metrics.dead_letter_events),
    kpi("machine_alerts_open", metrics.machine_alerts_open),
    kpi("security_incidents_open", metrics.security_incidents_open),
    kpi("security_incidents_critical", metrics.security_incidents_critical),
    kpi("security_actions_mocked", metrics.security_actions_mocked)
  ].join("");
  $("#alertList").innerHTML = (alerts.items || []).slice(0, 20).map((alert) => row(alert.type, alert, resolveButton(alert))).join("") || '<p class="eco-muted">Sem alertas operacionais.</p>';
  $("#traceList").innerHTML = (traces.items || []).slice(0, 20).map((trace) => row(trace.stage, trace)).join("") || '<p class="eco-muted">Sem traces recentes.</p>';
  document.querySelectorAll("[data-resolve-alert]").forEach((button) => {
    button.addEventListener("click", () => resolveAlert(button.dataset.resolveAlert));
  });
  notice("Cockpit sincronizado em modo simulado.");
}

async function resolveAlert(id) {
  const result = await postJson(`/api/sambah-observability/alerts/${encodeURIComponent(id)}/resolve`, { resolved_by: "cockpit" });
  notice(result.ok ? `Alerta resolvido: ${id}` : result.error, !result.ok);
  await load();
}

async function simulateCriticalAlert() {
  const result = await postJson("/api/sambah-observability/simulate-critical-alert", {
    type: "cockpit.critical.demo",
    severity: "high",
    message: "Alerta critico simulado pelo Cockpit"
  });
  notice(result.ok ? `Alerta criado: ${result.alert.id}` : result.error, !result.ok);
  await load();
}

async function searchCorrelation() {
  const id = $("#cockpitCorrelationInput").value.trim();
  if (!id) return notice("Informe um correlationId.", true);
  const result = await getJson(`/api/sambah-observability/correlation/${encodeURIComponent(id)}`);
  $("#cockpitCorrelationResult").innerHTML = [
    ...(result.events || []).map((item) => row(item.type, item)),
    ...(result.traces || []).map((item) => row(item.stage, item))
  ].join("") || '<p class="eco-muted">Nada encontrado para esta correlacao.</p>';
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshCockpit").addEventListener("click", load);
  $("#criticalAlert").addEventListener("click", simulateCriticalAlert);
  $("#cockpitCorrelationSearch").addEventListener("click", searchCorrelation);
  load();
});
