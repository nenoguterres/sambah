const el = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", loadPermissionMatrix);

async function loadPermissionMatrix() {
  try {
    const response = await fetch("/api/sambah-pay/permissions/matrix");
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "matrix_load_failed");
    renderMatrix(payload);
  } catch (error) {
    el("#matrixStatus").textContent = "Falha ao carregar matriz";
    el("#permissionsBody").innerHTML = `<tr><td colspan="6"><div class="error-box">${escapeHtml(error.message)}</div></td></tr>`;
  }
}

function renderMatrix(payload) {
  const actions = payload.actions || [];
  const roles = payload.roles || [];
  const matrix = payload.matrix || {};
  el("#matrixStatus").textContent = "Matriz carregada";
  el("#matrixMode").textContent = payload.mode === "internal" ? "Permissoes internas" : payload.mode === "mock" ? "Permissoes mockadas" : String(payload.mode || "");
  el("#permissionsHead").innerHTML = `<tr><th>Perfil</th>${actions.map((action) => `<th>${escapeHtml(action.label)}</th>`).join("")}</tr>`;
  el("#permissionsBody").innerHTML = roles.map((role) => {
    const cells = actions.map((action) => stateCell(matrix[role]?.[action.key]));
    return `<tr><td>${escapeHtml(role)}</td>${cells.join("")}</tr>`;
  }).join("");
}

function stateCell(value = "Bloqueado") {
  const css = value === "Liberado" ? "state-allowed" : value === "Parcial" ? "state-partial" : "state-blocked";
  return `<td><span class="state-pill ${css}">${escapeHtml(value)}</span></td>`;
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
