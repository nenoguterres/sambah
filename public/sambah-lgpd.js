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
  $("#lgpdNotice").textContent = message;
  $("#lgpdNotice").classList.toggle("error", Boolean(error));
}

function kpi(label, value) {
  return `<article class="eco-kpi"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function row(title, item, actions = "") {
  return `<article class="eco-table-card">
    <header><strong>${esc(title)}</strong><small>${esc(item.domain || item.status || item.classification || item.severity || "")}</small></header>
    <pre class="eco-pre">${esc(JSON.stringify(item, null, 2))}</pre>
    ${actions}
  </article>`;
}

function requestActions(request) {
  if (["fulfilled", "dismissed"].includes(request.status)) return "";
  return `<div class="eco-actions">
    <button class="eco-secondary" data-request="${esc(request.id)}" data-status="in_review" type="button">Em revisao</button>
    <button class="eco-secondary" data-request="${esc(request.id)}" data-status="fulfilled" type="button">Atender</button>
    <button class="eco-secondary" data-request="${esc(request.id)}" data-status="dismissed" type="button">Dispensar</button>
  </div>`;
}

async function load() {
  const dashboard = await getJson("/api/sambah-lgpd/dashboard");
  $("#lgpdUpdated").textContent = new Date().toLocaleString("pt-BR");
  $("#lgpdKpis").innerHTML = [
    kpi("logs_criticos", dashboard.totals.critical_logs),
    kpi("solicitacoes_abertas", dashboard.totals.open_privacy_requests),
    kpi("logs_financeiros", dashboard.totals.financial_logs),
    kpi("logs_seguranca", dashboard.totals.security_logs),
    kpi("politicas", dashboard.totals.policies)
  ].join("");
  $("#criticalLogs").innerHTML = (dashboard.recent_critical_logs || []).map((item) => row(item.type, item)).join("") || '<p class="eco-muted">Sem logs criticos.</p>';
  $("#privacyRequests").innerHTML = (dashboard.privacy_requests || []).map((item) => row(item.request_type, item, requestActions(item))).join("") || '<p class="eco-muted">Sem solicitacoes LGPD.</p>';
  $("#retentionPolicies").innerHTML = (dashboard.retention_policies || []).map((item) => row(item.label, item)).join("");
  document.querySelectorAll("[data-request]").forEach((button) => button.addEventListener("click", () => updateRequest(button.dataset.request, button.dataset.status)));
  notice("LGPD e logs sincronizados em modo simulado.");
}

async function createPrivacyRequest() {
  const result = await postJson("/api/sambah-lgpd/privacy-requests", {
    request_type: "access",
    requester: "cliente.demo@example.com",
    customer_id: "cliente-lgpd-demo",
    reason: "Solicitacao demo de acesso aos dados"
  });
  notice(result.ok ? `Solicitacao criada: ${result.request.id}` : result.error, !result.ok);
  await load();
}

async function updateRequest(id, status) {
  const result = await postJson(`/api/sambah-lgpd/privacy-requests/${encodeURIComponent(id)}`, { status, actor: "lgpd-panel" });
  notice(result.ok ? `Solicitacao atualizada: ${status}` : result.error, !result.ok);
  await load();
}

async function exportAudit() {
  const result = await getJson("/api/sambah-lgpd/audit/export?limit=50");
  notice(result.ok ? `Exportacao mascarada gerada: ${result.total} registros` : result.error, !result.ok);
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshLgpd").addEventListener("click", load);
  $("#createPrivacyRequest").addEventListener("click", createPrivacyRequest);
  $("#exportAudit").addEventListener("click", exportAudit);
  load();
});
