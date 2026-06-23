const state = { transcriptions: [], intents: [], handoffs: [], audit: [], role: localStorage.getItem("sambahVoiceRole") || "ATENDENTE", authMode: "mock", user: null };
const rolePermissions = {
  ADMIN: ["voice_checkout", "voice_wallet_topup", "voice_autoserve_release", "voice_handoff", "voice_audit_full", "voice_reprocess", "voice_cancel", "voice_session"],
  GERENTE: ["voice_checkout", "voice_wallet_topup_partial", "voice_autoserve_release_partial", "voice_handoff", "voice_audit_full", "voice_session"],
  CAIXA: ["voice_checkout", "voice_wallet_topup", "voice_audit_summary", "voice_session"],
  OPERADOR: ["voice_simulate", "voice_session", "voice_handoff"],
  ATENDENTE: ["voice_simulate", "voice_respond", "voice_handoff", "voice_intent"],
  AUDITOR: ["voice_audit_full", "voice_session"]
};
const metricLabels = {
  voice_messages: "Mensagens de voz",
  transcriptions: "Transcricoes",
  intents: "Intents",
  low_confidence_intents: "Baixa confianca",
  responses: "Respostas",
  handoffs: "Handoffs",
  checkouts: "Checkouts voz",
  wallet_topups: "Wallet topups",
  autoserve_releases: "AutoServe voz",
  understanding_failures: "Falhas entendimento"
};
const el = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", async () => {
  await initAuth();
  bindRoleSelector();
  bindModeSwitch();
  bindForms();
  applyPermissions();
  loadVoicePanel();
});
el("#refreshVoice").addEventListener("click", loadVoicePanel);

async function initAuth() {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) {
    location.assign("/login?next=" + encodeURIComponent(location.pathname));
    return;
  }
  const payload = await response.json();
  state.authMode = payload.mode || (payload.user ? "session" : "mock");
  state.user = payload.user || null;
  if (state.user) state.role = state.user.role;
  showNotice(state.authMode === "session"
    ? "Sessao interna ativa. Perfil real aplicado aos botoes criticos e rotas protegidas."
    : "Permissoes mockadas ativas. Perfil padrao: ATENDENTE.", false);
}

function bindForms() {
  el("#voiceWebhookForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    const result = await postJson("/api/sambah-voice/webhook/whatsapp", { from: data.from, transcript: data.transcript, media_url: "mock://audio/painel-voice.ogg" });
    showJson("#webhookResult", result);
    await loadVoicePanel();
  });
  el("#voiceCheckoutForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    if (!can("voice_checkout")) return showDenied("#checkoutResult", "voice_checkout");
    const result = await postJson("/api/sambah-pay/voice/checkout", { session_id: data.session_id, amount: Number(data.amount || 0), confirmed: Boolean(data.confirmed) });
    showJson("#checkoutResult", result);
    await loadVoicePanel();
  });
  el("#voiceWalletForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    if (!can("voice_wallet_topup")) return showDenied("#walletResult", "voice_wallet_topup");
    const result = await postJson("/api/sambah-pay/voice/wallet-topup", { session_id: "voice-wallet-panel", customer_id: data.customer_id, amount: Number(data.amount || 0), confirmed: Boolean(data.confirmed) });
    showJson("#walletResult", result);
    await loadVoicePanel();
  });
  el("#prepareAutoserveDemo").addEventListener("click", async () => {
    const device = await postJson("/api/sambah-pay/devices/demo", { kind: "voice_autoserve", product_id: "agua" });
    if (device.ok) {
      el('#voiceAutoserveForm [name="device_id"]').value = device.device.id;
      showJson("#autoserveResult", { ok: true, prepared_device: device.device.id, product: device.product?.product_id || "agua" });
    } else {
      showJson("#autoserveResult", device);
    }
    await loadVoicePanel();
  });
  el("#voiceAutoserveForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    if (!data.device_id) {
      const friendly = { ok: false, error: "voice_autoserve_device_required", message: "Crie ou selecione um device antes da compra AutoServe." };
      showJson("#autoserveResult", friendly);
      showNotice(friendly.message, true);
      return;
    }
    if (!can("voice_autoserve_release")) return showDenied("#autoserveResult", "voice_autoserve_release");
    const result = await postJson("/api/sambah-pay/voice/autoserve-release", { product_id: data.product_id, device_id: data.device_id, quantity: Number(data.quantity || 1), confirmed: Boolean(data.confirmed) });
    showJson("#autoserveResult", result);
    await loadVoicePanel();
  });
  el("#voiceHandoffForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    if (!can("voice_handoff")) return showDenied("#handoffResult", "voice_handoff");
    const result = await postJson("/api/sambah-voice/handoff", data);
    showJson("#handoffResult", result);
    await loadVoicePanel();
  });
}

async function loadVoicePanel() {
  const [dashboard, transcriptions, intents, handoffs, audit] = await Promise.all([
    getJson("/api/sambah-pay/voice/dashboard"),
    getJson("/api/sambah-pay/voice/transcriptions?limit=50"),
    getJson("/api/sambah-pay/voice/intents?limit=50"),
    getJson("/api/sambah-pay/voice/handoffs?limit=50"),
    getJson("/api/sambah-pay/voice/audit?limit=80")
  ]);
  state.transcriptions = transcriptions.items || [];
  state.intents = intents.items || [];
  state.handoffs = handoffs.items || [];
  state.audit = audit.items || [];
  if (audit.ok === false) state.audit = [];
  renderDashboard(dashboard);
  renderCommandCenter(dashboard);
  renderTranscriptions();
  renderIntents();
  renderHandoffs();
  renderAudit();
}

function renderDashboard(dashboard) {
  const totals = dashboard.totals || {};
  el("#dashboardUpdated").textContent = dashboard.generated_at ? formatDate(dashboard.generated_at) : "Sem dados";
  el("#voiceMetrics").innerHTML = Object.entries(metricLabels).map(([key, label]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${Number(totals[key] || 0)}</strong></article>`).join("");
}
function renderCommandCenter(dashboard) {
  const totals = dashboard.totals || {};
  const username = state.user?.displayName || state.user?.username || (state.authMode === "mock" ? "Modo mock" : "Usuario");
  const centralUser = el("#centralUser");
  const centralRole = el("#centralRole");
  const centralStatus = el("#payCentralStatus");
  const centralCheckouts = el("#centralCheckouts");
  const centralWallet = el("#centralWallet");
  const centralAutoserve = el("#centralAutoserve");
  const centralAudit = el("#centralAudit");
  if (centralUser) centralUser.textContent = username;
  if (centralRole) centralRole.textContent = "Perfil " + state.role;
  if (centralStatus) centralStatus.textContent = state.authMode === "session" ? "Sessao ativa" : "Modo mock";
  if (centralCheckouts) centralCheckouts.textContent = Number(totals.checkouts || 0);
  if (centralWallet) centralWallet.textContent = Number(totals.wallet_topups || 0);
  if (centralAutoserve) centralAutoserve.textContent = Number(totals.autoserve_releases || 0);
  if (centralAudit) centralAudit.textContent = can("voice_audit_full") ? "Completa" : can("voice_audit_summary") ? "Parcial" : "Bloqueada";
}
function renderTranscriptions() {
  el("#transcriptionsList").innerHTML = state.transcriptions.length ? state.transcriptions.map((item) => `<article class="table-card"><header><strong>${escapeHtml(item.provider || "mock-stt")}</strong><small>${formatDate(item.created_at)}</small></header><div class="inline-grid"><div><small>Confidence</small><strong>${Number(item.confidence || 0).toFixed(2)}</strong></div><div><small>Idioma</small><strong>${escapeHtml(item.language || "pt-BR")}</strong></div><div><small>Status</small><strong>${escapeHtml(item.status || "")}</strong></div><div><small>Sessao</small><strong>${escapeHtml(shortId(item.session_id))}</strong></div></div><code>${escapeHtml(item.text || "")}</code></article>`).join("") : empty("Nenhuma transcricao simulada.");
}
function renderIntents() {
  el("#intentsList").innerHTML = state.intents.length ? state.intents.map((item) => `<article class="table-card"><header><strong>${escapeHtml(item.intent || "")}</strong><small>${formatDate(item.created_at)}</small></header><div class="inline-grid"><div><small>Confidence</small><strong class="${Number(item.confidence || 0) < 0.7 ? "pill-warn" : "pill-ok"}">${Number(item.confidence || 0).toFixed(2)}</strong></div><div><small>Requer confirmacao</small><strong>${item.confirmation_required ? "sim" : "nao"}</strong></div><div><small>Confirmado</small><strong>${item.confirmed ? "sim" : "nao"}</strong></div><div><small>Status</small><strong>${escapeHtml(item.status || "")}</strong></div></div><code>${escapeHtml(JSON.stringify(item.entities || {}, null, 2))}</code>${item.confirmation_required && !item.confirmed ? `<button class="secondary-action" type="button" data-confirm-intent="${escapeHtml(item.id)}">Simular confirmacao</button>` : ""}</article>`).join("") : empty("Nenhuma intent identificada.");
  document.querySelectorAll("[data-confirm-intent]").forEach((button) => button.addEventListener("click", async () => { await postJson("/api/sambah-pay/voice/intents/" + encodeURIComponent(button.dataset.confirmIntent) + "/confirm", {}); await loadVoicePanel(); }));
  applyPermissions();
}
function renderHandoffs() {
  el("#handoffsList").innerHTML = state.handoffs.length ? state.handoffs.map((item) => `<article class="table-card"><header><strong>${escapeHtml(item.reason || "handoff")}</strong><small>${formatDate(item.created_at)}</small></header><div class="inline-grid"><div><small>Status</small><strong>${escapeHtml(item.status || "")}</strong></div><div><small>Ticket</small><strong>${escapeHtml(item.ticket_id || "")}</strong></div><div><small>Provider</small><strong>${escapeHtml(item.provider || "")}</strong></div><div><small>Sessao</small><strong>${escapeHtml(shortId(item.session_id))}</strong></div></div></article>`).join("") : empty("Nenhum handoff humano simulado.");
}
function renderAudit() {
  const auditState = el("#auditPermissionState");
  if (auditState) auditState.textContent = can("voice_audit_full") ? "Auditoria completa" : can("voice_audit_summary") ? "Auditoria resumida" : "Bloqueado para o perfil";
  if (!can("voice_audit_full") && !can("voice_audit_summary")) {
    el("#voiceAuditList").innerHTML = empty("Perfil sem permissao para visualizar auditoria.");
    return;
  }
  el("#voiceAuditList").innerHTML = state.audit.length ? state.audit.map((item) => `<article class="table-card"><header><strong>${escapeHtml(item.type || "")}</strong><small>${formatDate(item.created_at || item.createdAt)}</small></header><div class="inline-grid"><div><small>Modulo</small><strong>Voice Pay</strong></div><div><small>Origem</small><strong>${escapeHtml(item.source || "sambah-pay")}</strong></div><div><small>Status</small><strong>${escapeHtml(item.status || "")}</strong></div><div><small>Acao</small><strong>${escapeHtml(item.message || "")}</strong></div></div><code>${escapeHtml(JSON.stringify(item.context || {}, null, 2))}</code></article>`).join("") : empty("Nenhuma auditoria Voice registrada.");
}
async function getJson(path) { const response = await fetch(path, { headers: roleHeaders() }); return response.json(); }
async function postJson(path, body) { const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", ...roleHeaders() }, body: JSON.stringify(body) }); return response.json(); }
function formData(form) { const entries = Object.fromEntries(new FormData(form).entries()); form.querySelectorAll('input[type="checkbox"]').forEach((input) => { entries[input.name] = input.checked; }); return entries; }
function showJson(selector, payload) { el(selector).textContent = JSON.stringify(payload, null, 2); if (payload?.ok === false && payload?.error === "permission_denied") showNotice(payload.message || "Acao bloqueada por permissao.", true); }
function empty(text) { return `<p class="empty">${escapeHtml(text)}</p>`; }
function formatDate(value) { if (!value) return "Sem data"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR"); }
function shortId(value = "") { return String(value || "").slice(0, 8) || "-"; }
function escapeHtml(value = "") { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

function bindRoleSelector() {
  const select = el("#voiceRoleSelect");
  if (!select) return;
  const wrapper = select.closest(".role-select");
  if (state.authMode === "session") {
    if (wrapper) wrapper.hidden = true;
    return;
  }
  if (wrapper) wrapper.hidden = false;
  if (!rolePermissions[state.role]) state.role = "ATENDENTE";
  select.value = state.role;
  select.addEventListener("change", async () => {
    state.role = select.value;
    localStorage.setItem("sambahVoiceRole", state.role);
    applyPermissions();
    showNotice("Perfil mockado ativo: " + state.role, false);
    await loadVoicePanel();
  });
}

function bindModeSwitch() {
  document.querySelectorAll("[data-pay-mode]").forEach((button) => {
    button.addEventListener("click", () => setPanelMode(button.dataset.payMode || "operacao"));
  });
  setPanelMode(location.hash === "#laboratorio" ? "laboratorio" : "operacao");
}

function setPanelMode(mode = "operacao") {
  const activeMode = mode === "laboratorio" ? "laboratorio" : "operacao";
  document.body.dataset.activePayMode = activeMode;
  document.querySelectorAll("[data-pay-mode]").forEach((button) => {
    const active = button.dataset.payMode === activeMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll("[data-panel-mode]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.panelMode !== activeMode);
  });
}

function can(permission) {
  const permissions = rolePermissions[state.role] || rolePermissions.ATENDENTE;
  if (permissions.includes(permission)) return true;
  if (permission === "voice_wallet_topup" && permissions.includes("voice_wallet_topup_partial")) return true;
  if (permission === "voice_autoserve_release" && permissions.includes("voice_autoserve_release_partial")) return true;
  if (permission === "voice_audit_summary" && permissions.includes("voice_audit_full")) return true;
  return false;
}

function applyPermissions() {
  const badge = el("#voiceRoleBadge");
  if (badge) badge.textContent = "Perfil " + state.role;
  const mode = el("#voiceMode");
  if (mode) mode.textContent = state.authMode === "session" ? "sessao interna" : "mock online";
  const user = el("#voiceUserName");
  if (user && state.user) user.textContent = state.user.displayName || state.user.username;
  document.querySelectorAll("[data-permission]").forEach((node) => {
    const allowed = can(node.dataset.permission);
    node.disabled = !allowed;
    node.title = allowed ? "" : "Bloqueado para o perfil " + state.role;
    node.classList.toggle("permission-locked", !allowed);
  });
  document.querySelectorAll("[data-confirm-intent]").forEach((node) => {
    const allowed = can("voice_reprocess");
    node.disabled = !allowed;
    node.title = allowed ? "" : "Bloqueado para o perfil " + state.role;
    node.classList.toggle("permission-locked", !allowed);
  });
}

function roleHeaders() {
  return state.authMode === "mock" ? { "x-sambah-role": state.role || "ATENDENTE" } : {};
}

function showDenied(selector, permission) {
  const payload = { ok: false, error: "permission_denied", role: state.role, permission, message: state.authMode === "session" ? "Perfil da sessao sem permissao para esta acao" : "Perfil sem permissao para esta acao em modo mockado" };
  showJson(selector, payload);
  showNotice(payload.message, true);
}

function showNotice(message, denied = false) {
  const notice = el("#permissionNotice");
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle("denied", Boolean(denied));
}
