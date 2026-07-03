const el = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  el("#refreshAuditEvents").addEventListener("click", loadAuditEvents);
  loadAuditEvents();
});

async function loadAuditEvents() {
  try {
    const response = await fetch("/api/admin/auditoria");
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "audit_load_failed");
    renderAuditEvents(payload);
  } catch (error) {
    el("#auditStatus").textContent = "Falha ao carregar auditoria";
    el("#auditEventsBody").innerHTML = `<tr><td colspan="11"><div class="error-box">${escapeHtml(error.message)}</div></td></tr>`;
  }
}

function renderAuditEvents(payload) {
  const items = payload.items || [];
  el("#auditStatus").textContent = "Auditoria carregada";
  el("#auditCount").textContent = `${items.length} eventos`;
  el("#auditEventsBody").innerHTML = items.length
    ? items.map(eventRow).join("")
    : `<tr><td class="empty-cell" colspan="11">Nenhum evento de auditoria encontrado.</td></tr>`;
}

function eventRow(item) {
  const className = auditRowClass(item);
  return `<tr class="${className}">
    <td>${escapeHtml(formatDate(item.timestamp))}</td>
    <td><code>${escapeHtml(item.event || "-")}</code></td>
    <td>${escapeHtml(item.username || "-")}</td>
    <td>${escapeHtml(item.role || "-")}</td>
    <td>${escapeHtml(item.source || "-")}</td>
    <td>${escapeHtml(item.action || "-")}</td>
    <td class="${statusClass(item.status)}">${escapeHtml(item.status || "-")}</td>
    <td><code>${escapeHtml(item.route || "-")}</code></td>
    <td>${escapeHtml(item.method || "-")}</td>
    <td>${escapeHtml(item.reason || "-")}</td>
    <td>${escapeHtml(targetLabel(item))}</td>
  </tr>`;
}

function auditRowClass(item) {
  const event = String(item.event || "");
  const reason = String(item.reason || "").toLowerCase();
  if (event === "sambah_permission_denied" || reason.includes("permiss")) return "audit-row-denied";
  if (event === "sambah_user_password_changed") return "audit-row-password";
  if (event === "sambah_user_status_changed") return "audit-row-status";
  if (event === "sambah_user_created" || event === "sambah_user_updated") return "audit-row-user";
  return "";
}

function targetLabel(item) {
  const username = item.targetUsername || "";
  const role = item.targetRole || "";
  if (!username && !role) return "-";
  return role ? `${username} (${role})` : username;
}

function statusClass(status = "") {
  const value = String(status || "").toLowerCase();
  if (value === "success" || value === "info") return `status-${value}`;
  if (value === "warning") return "status-warning";
  if (value === "error" || value.includes("denied")) return "status-error";
  return "";
}

function formatDate(value = "") {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
