const el = (selector) => document.querySelector(selector);

const actionLabels = {
  checkout: "Checkout",
  wallet: "Wallet",
  autoserve: "AutoServe",
  audit: "Auditoria",
  settings: "Configuracoes"
};
const roles = ["ADMIN", "GERENTE", "CAIXA", "OPERADOR", "ATENDENTE", "AUDITOR"];
let currentMatrix = null;

document.addEventListener("DOMContentLoaded", () => {
  populateRoleSelects(document);
  bindCreateForm();
  loadUsers();
});

async function loadUsers() {
  try {
    const [usersResponse, matrixResponse] = await Promise.all([
      fetch("/api/auth/users"),
      fetch("/api/sambah-pay/permissions/matrix")
    ]);
    const usersPayload = await usersResponse.json();
    const matrixPayload = await matrixResponse.json();
    if (!usersResponse.ok || usersPayload.ok === false) throw new Error(usersPayload.error || "users_load_failed");
    if (!matrixResponse.ok || matrixPayload.ok === false) throw new Error(matrixPayload.error || "matrix_load_failed");
    currentMatrix = matrixPayload;
    renderUsers(usersPayload, matrixPayload);
  } catch (error) {
    el("#usersStatus").textContent = "Falha ao carregar usuarios";
    el("#usersGrid").innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
  }
}

function renderUsers(usersPayload, matrixPayload) {
  const users = usersPayload.users || [];
  el("#usersStatus").textContent = `${users.length} usuarios internos`;
  el("#usersMode").textContent = usersPayload.mode === "mock" ? "modo mock" : "sessao interna";
  el("#usersGrid").innerHTML = users.length ? users.map((user) => userCard(user, matrixPayload)).join("") : `<div class="empty-box">Nenhum usuario interno cadastrado.</div>`;
  populateRoleSelects(el("#usersGrid"));
  bindUserActions();
}

function userCard(user, matrixPayload) {
  const permissions = matrixPayload.matrix?.[user.role] || {};
  const chips = Object.entries(actionLabels).map(([key, label]) => {
    const value = permissions[key] || "Bloqueado";
    const allowed = value === "Liberado" || value === "Parcial";
    return `<span class="permission-chip ${allowed ? "allowed" : ""}">${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
  }).join("");
  return `<article class="user-card" data-user-card="${escapeHtml(user.username)}">
    <header>
      <div>
        <h3>${escapeHtml(user.displayName || user.username)}</h3>
        <small>@${escapeHtml(user.username)}</small>
      </div>
      <span class="role-pill ${user.active ? "" : "inactive"}">${escapeHtml(user.active ? user.role : "INATIVO")}</span>
    </header>
    <div class="permission-list">${chips}</div>
    <form class="inline-form" data-user-update="${escapeHtml(user.username)}">
      <label>Nome<input name="displayName" value="${escapeHtml(user.displayName || user.username)}"></label>
      <label>Perfil<select name="role" data-selected-role="${escapeHtml(user.role)}"></select></label>
      <button class="secondary-button" type="submit">Salvar</button>
    </form>
    <form class="inline-form" data-user-password="${escapeHtml(user.username)}">
      <label>Nova senha<input name="password" type="password" autocomplete="new-password" placeholder="minimo 8 caracteres"></label>
      <button class="secondary-button" type="submit">Trocar senha</button>
    </form>
    <button class="danger-button" type="button" data-user-status="${escapeHtml(user.username)}" data-active="${user.active ? "false" : "true"}">${user.active ? "Desativar" : "Ativar"}</button>
  </article>`;
}

function bindCreateForm() {
  const form = el("#createUserForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const result = await sendJson("/api/auth/users", "POST", payload);
    showActionStatus(result.ok ? "Usuario criado" : result.message || result.error, !result.ok);
    if (result.ok) {
      form.reset();
      populateRoleSelects(form);
      await loadUsers();
    }
  });
}

function bindUserActions() {
  document.querySelectorAll("[data-user-update]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = form.dataset.userUpdate;
      const result = await sendJson(`/api/auth/users/${encodeURIComponent(username)}`, "PATCH", Object.fromEntries(new FormData(form).entries()));
      showActionStatus(result.ok ? "Usuario atualizado" : result.message || result.error, !result.ok);
      if (result.ok) await loadUsers();
    });
  });
  document.querySelectorAll("[data-user-password]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = form.dataset.userPassword;
      const result = await sendJson(`/api/auth/users/${encodeURIComponent(username)}/password`, "POST", Object.fromEntries(new FormData(form).entries()));
      showActionStatus(result.ok ? "Senha alterada" : result.message || result.error, !result.ok);
      if (result.ok) form.reset();
    });
  });
  document.querySelectorAll("[data-user-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const username = button.dataset.userStatus;
      const active = button.dataset.active === "true";
      const result = await sendJson(`/api/auth/users/${encodeURIComponent(username)}/status`, "POST", { active });
      showActionStatus(result.ok ? "Status atualizado" : result.message || result.error, !result.ok);
      if (result.ok) await loadUsers();
    });
  });
}

async function sendJson(path, method, body) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return { ...payload, httpStatus: response.status };
}

function populateRoleSelects(root) {
  root.querySelectorAll('select[name="role"]').forEach((select) => {
    const selected = select.dataset.selectedRole || select.value || "ATENDENTE";
    select.innerHTML = roles.map((role) => `<option value="${role}" ${role === selected ? "selected" : ""}>${role}</option>`).join("");
  });
}

function showActionStatus(message, error = false) {
  const status = el("#userActionStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", Boolean(error));
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
