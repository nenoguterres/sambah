const state = {
  items: [],
  summary: {},
  selectedId: "",
  selectedConversation: null,
  filter: "all",
  query: "",
  activeRole: "",
  activeUser: "",
  refreshing: false,
  sending: false,
  drafts: new Map(),
  pushSubscription: null,
  pendingManualSendId: ""
};

const listEl = document.querySelector("#conversationList");
const chatEl = document.querySelector("#chatPane");
const searchInput = document.querySelector("#searchInput");
const refreshButton = document.querySelector("#refreshButton");
const connectionStatusEl = document.querySelector("#connectionStatus");
const pushPanelEl = document.querySelector("#pushPanel");
const ACTION_ENDPOINTS = {
  read: "/read",
  unread: "/unread",
  claim: "/claim",
  release: "/release",
  transfer: "/transfer",
  resolve: "/resolve",
  reopen: "/reopen",
  messages: "/messages"
};
refreshButton?.addEventListener("click", refreshInbox);
searchInput?.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderList();
});
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderList();
  });
});

init();
setInterval(refreshInbox, 30000);

async function init() {
  await loadActiveUser();
  await registerServiceWorker();
  await refreshInbox({ initial: true });
}

async function loadActiveUser() {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    state.activeRole = data.user?.role || "ADMIN";
    state.activeUser = data.user?.username || data.user?.displayName || "operador";
  } catch {
    state.activeRole = "";
    state.activeUser = "";
  }
}

async function refreshInbox({ initial = false } = {}) {
  if (state.refreshing) return;
  state.refreshing = true;
  refreshButton?.classList.add("spinning");
  if (initial && !state.items.length) listEl.innerHTML = `<div class="loading">Carregando...</div>`;
  const listScroll = listEl.scrollTop;
  const messageEl = chatEl.querySelector("#messageList");
  const wasNearBottom = messageEl ? messageEl.scrollHeight - messageEl.scrollTop - messageEl.clientHeight < 120 : true;
  const messageScroll = messageEl?.scrollTop || 0;
  try {
    await loadWhatsappStatus();
    const response = await fetch("/api/conversas", { cache: "no-store" });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Erro ao carregar conversas");
    state.items = data.items || [];
    state.summary = data.summary || {};
    updateCounters();
    const requestedId = new URLSearchParams(location.search).get("conversationId") || "";
    if (!state.selectedId && requestedId) state.selectedId = requestedId;
    renderList();
    listEl.scrollTop = listScroll;
    if (state.selectedId) await openConversation(state.selectedId, { silent: true, wasNearBottom, messageScroll });
    renderPushPanel();
  } catch (error) {
    if (!state.items.length) listEl.innerHTML = `<div class="loading">${escapeHtml(error.message || "Nao foi possivel carregar.")}</div>`;
  } finally {
    state.refreshing = false;
    refreshButton?.classList.remove("spinning");
  }
}

async function loadWhatsappStatus() {
  try {
    const response = await fetch("/admin/whatsapp/status", { cache: "no-store" });
    state.whatsappStatus = response.ok ? await response.json() : {};
  } catch {
    state.whatsappStatus = {};
  }
  renderConnectionStatus();
}

function renderConnectionStatus() {
  if (!connectionStatusEl) return;
  const status = state.whatsappStatus || {};
  const ready = status.configured === true && status.sendEnabled === true;
  connectionStatusEl.className = `connection-status ${ready ? "ok" : "warn"}`;
  connectionStatusEl.innerHTML = `<strong>${ready ? "Meta pronto" : "Meta em atenção"}</strong><span>envio=${Boolean(status.sendEnabled)} | inbox=${Boolean(status.receivingActive)}</span>`;
}

function updateCounters() {
  for (const [key, value] of Object.entries(state.summary || {})) {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = String(value || 0);
  }
}

function renderList() {
  const items = state.items.filter(matchesFilter).filter(matchesSearch);
  if (!items.length) {
    listEl.innerHTML = `<div class="loading">Nenhuma conversa neste filtro.</div>`;
    return;
  }
  listEl.innerHTML = items.map((item) => `
    <button class="conversation-item${item.id === state.selectedId ? " selected" : ""}${item.unread ? " unread" : ""}" type="button" data-id="${escapeAttr(item.id)}">
      <span class="avatar">${escapeHtml(initialsFor(item.nome || item.telefone || "WA"))}</span>
      <span class="conversation-main">
        <span class="conversation-top"><strong>${escapeHtml(item.nome || "Cliente WhatsApp")}</strong><small>${formatTime(item.ultimaInteracao || item.updatedAt || item.createdAt)}</small></span>
        <span class="conversation-preview">${escapeHtml(item.ultimaMensagem || "Sem mensagem")}</span>
        <span class="conversation-tags">
          <em>${escapeHtml(labelStatus(item.status))}</em>
          ${item.unread ? "<em class=\"tag-unread\">Não lida</em>" : ""}
          ${item.assignedOperatorName ? `<em>${escapeHtml(item.assignedOperatorName)}</em>` : ""}
        </span>
      </span>
    </button>
  `).join("");
  listEl.querySelectorAll("[data-id]").forEach((button) => button.addEventListener("click", () => openConversation(button.dataset.id)));
}

async function openConversation(id, { silent = false, wasNearBottom = true, messageScroll = 0 } = {}) {
  state.selectedId = id;
  renderList();
  if (!silent) chatEl.innerHTML = `<div class="empty-state"><strong>Carregando conversa...</strong></div>`;
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Conversa nao encontrada");
    state.selectedConversation = data.conversa;
    renderChat(data.conversa, { wasNearBottom, messageScroll });
    if (data.conversa.unread) await postConversationAction(id, "read", { quiet: true });
    await acknowledgeOpenAlert(id);
  } catch (error) {
    chatEl.innerHTML = `<div class="empty-state"><strong>${escapeHtml(error.message || "Falha ao abrir conversa")}</strong></div>`;
  }
}

function renderChat(conversa, { wasNearBottom = true, messageScroll = 0 } = {}) {
  const messages = conversa.mensagens || [];
  const draft = loadDraft(conversa.id);
  chatEl.innerHTML = `
    <header class="chat-header">
      <span class="avatar large">${escapeHtml(initialsFor(conversa.nome || conversa.telefone || "WA"))}</span>
      <div class="chat-title">
        <strong>${escapeHtml(conversa.nome || "Cliente WhatsApp")}</strong>
        <small>${escapeHtml(conversa.telefone || "")} · ${escapeHtml(labelStatus(conversa.status))} · Responsável: ${escapeHtml(conversa.assignedOperatorName || "sem responsável")} · Lida por: ${escapeHtml(conversa.readBy || "-")}</small>
      </div>
      <div class="chat-actions">
        ${canClaim(conversa) ? `<button type="button" data-action="claim">Assumir atendimento</button>` : ""}
        <button type="button" data-focus-reply>Enviar</button>
        ${conversa.status !== "resolvido" ? `<button type="button" data-action="resolve">Concluir</button>` : ""}
        <button type="button" data-toggle-menu>⋮ Ações</button>
        <div class="action-menu" id="actionMenu">${renderActionMenu(conversa)}</div>
      </div>
    </header>
    <section class="message-list" id="messageList">${messages.map(renderMessage).join("") || `<div class="day-marker">Sem histórico ainda</div>`}</section>
    <section class="reply-panel">
      <textarea id="replyText" rows="2" placeholder="Escreve tua resposta pelo SamBah...">${escapeHtml(draft)}</textarea>
      <button class="send-button" type="button" id="sendReply"${state.sending ? " disabled" : ""}>Enviar</button>
    </section>
    <p class="reply-status" id="replyStatus"></p>
  `;
  bindChat(conversa);
  const messageEl = chatEl.querySelector("#messageList");
  if (messageEl) messageEl.scrollTop = wasNearBottom ? messageEl.scrollHeight : messageScroll;
}

function bindChat(conversa) {
  chatEl.querySelector("[data-focus-reply]")?.addEventListener("click", () => chatEl.querySelector("#replyText")?.focus());
  chatEl.querySelector("[data-toggle-menu]")?.addEventListener("click", () => chatEl.querySelector("#actionMenu")?.classList.toggle("open"));
  chatEl.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(conversa, button.dataset.action)));
  const reply = chatEl.querySelector("#replyText");
  reply?.addEventListener("input", () => saveDraft(conversa.id, reply.value));
  reply?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendReply(conversa.id);
  });
  chatEl.querySelector("#sendReply")?.addEventListener("click", () => sendReply(conversa.id));
}

function renderActionMenu(conversa) {
  const actions = [];
  if (conversa.unread) actions.push(["read", "Marcar como lida"]);
  else actions.push(["unread", "Marcar como não lida"]);
  if (canClaim(conversa)) actions.push(["claim", "Assumir atendimento"]);
  if (conversa.assignedOperatorPhone) actions.push(["release", "Liberar atendimento"], ["transfer", "Transferir atendimento"]);
  if (conversa.status !== "resolvido") actions.push(["resolve", "Marcar como atendida"]);
  if (conversa.status === "resolvido") actions.push(["reopen", "Reabrir atendimento"]);
  if (state.activeRole === "ADMIN") actions.push(["clear", "Limpar histórico"], ["delete-conversation", "Excluir conversa"]);
  return actions.map(([action, label]) => {
    if (action === "delete-conversation") return `<button type="button" data-action="delete-conversation">${escapeHtml(label)}</button>`;
    return `<button type="button" data-action="${action}">${escapeHtml(label)}</button>`;
  }).join("");
}

async function handleAction(conversa, action) {
  if (action === "delete" || action === "delete-conversation") return deleteConversation(conversa.id);
  if (action === "clear") return clearHistory(conversa.id);
  const body = { expectedVersion: conversa.version || 0 };
  if (action === "transfer") {
    const target = window.prompt("Telefone do operador destino");
    if (!target) return;
    body.targetOperatorPhone = target;
  }
  await postConversationAction(conversa.id, action, { body });
}

async function postConversationAction(id, action, { body = {}, quiet = false } = {}) {
  const status = chatEl.querySelector("#replyStatus");
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}${ACTION_ENDPOINTS[action] || `/${action}`}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "action_failed");
    if (!quiet && status) status.textContent = "Ação salva.";
    await refreshInbox({ initial: false });
  } catch (error) {
    if (status) status.textContent = error.message || "Falha na ação.";
  }
}

async function sendReply(id) {
  if (state.sending) return;
  const textarea = chatEl.querySelector("#replyText");
  const status = chatEl.querySelector("#replyStatus");
  const text = textarea?.value.trim() || "";
  if (!text) return;
  state.sending = true;
  state.pendingManualSendId ||= `manual:${id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}/responder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, manualSendId: state.pendingManualSendId })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || data.reason || "send_failed");
    if (data.enviado === true || data.duplicate === true) {
      textarea.value = "";
      clearDraft(id);
      state.pendingManualSendId = "";
    }
    if (status) status.textContent = data.enviado ? "Mensagem enviada." : `Mensagem registrada: ${data.reason || "sem envio real"}`;
    await refreshInbox({ initial: false });
  } catch (error) {
    if (status) status.textContent = error.message || "Falha real no envio.";
  } finally {
    state.sending = false;
  }
}

async function clearHistory(id) {
  if (!window.confirm("Limpar todo o histórico desta conversa?")) return;
  const response = await fetch(`/api/conversas/${encodeURIComponent(id)}${ACTION_ENDPOINTS.messages}`, { method: "DELETE" });
  const data = await response.json();
  if (!data.ok) window.alert(data.error || "Falha ao limpar histórico.");
  await refreshInbox({ initial: false });
}

async function deleteConversation(id) {
  if (!window.confirm("Tem certeza que deseja excluir esta conversa sem uso?")) return;
  const response = await fetch(`/api/conversas/${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await response.json();
  if (!data.ok) window.alert(data.error || "Falha ao excluir conversa.");
  state.selectedId = "";
  await refreshInbox({ initial: false });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sambah-conversas-sw.js");
  } catch {}
}

function renderPushPanel() {
  if (!pushPanelEl) return;
  pushPanelEl.innerHTML = `<button type="button" id="enablePush">Ativar alertas neste celular</button>`;
  pushPanelEl.querySelector("#enablePush")?.addEventListener("click", enablePush);
}

function scrollMessagesToBottom() {
  const list = chatEl.querySelector("#messageList");
  if (list) list.scrollTop = list.scrollHeight;
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function playHumanAlertSound() {
  try {
    const audio = new Audio();
    audio.volume = 0.15;
  } catch {}
}

async function enablePush() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;
  const keyResult = await (await fetch("/api/call-center/push/public-key")).json();
  if (!keyResult.publicKey) return window.alert("Chave Web Push não configurada.");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey)
  });
  const payload = subscription.toJSON();
  payload.deviceId = deviceId();
  const response = await fetch("/api/call-center/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  window.alert(data.ok ? "Alertas ativados neste celular." : "Não foi possível ativar alertas.");
}

async function acknowledgeOpenAlert(conversationId) {
  try {
    const result = await (await fetch("/api/call-center/alerts?unreadOnly=true", { cache: "no-store" })).json();
    const alert = (result.alerts || []).find((item) => item.conversationId === conversationId);
    if (alert) await fetch(`/api/call-center/alerts/${encodeURIComponent(alert.id)}/acknowledge`, { method: "POST" });
  } catch {}
}

function matchesFilter(item) {
  if (state.filter === "unread") return item.unread === true;
  if (state.filter === "human") return item.status === "humano";
  if (state.filter === "inProgress") return item.status === "em_atendimento";
  if (state.filter === "resolved") return item.status === "resolvido";
  return true;
}

function matchesSearch(item) {
  const query = normalizeText(state.query);
  if (!query) return true;
  return normalizeText(`${item.nome || ""} ${item.telefone || ""} ${item.ultimaMensagem || ""}`).includes(query);
}

function canClaim(conversa) {
  return !conversa.assignedOperatorPhone && conversa.status !== "resolvido";
}

function draftKey(id) {
  return `sambah:draft:${state.activeUser || "anon"}:${id}`;
}

function loadDraft(id) {
  if (state.drafts.has(id)) return state.drafts.get(id);
  const value = localStorage.getItem(draftKey(id)) || "";
  state.drafts.set(id, value);
  return value;
}

function saveDraft(id, text) {
  state.drafts.set(id, text);
  localStorage.setItem(draftKey(id), text);
}

function clearDraft(id) {
  state.drafts.delete(id);
  localStorage.removeItem(draftKey(id));
}

function renderMessage(message) {
  return `<article class="message ${message.direction === "out" ? "out" : "in"}">
    <p>${escapeHtml(message.text || message.transcricao || labelStatus(message.type))}</p>
    <small>${escapeHtml(formatTime(message.createdAt))} · ${escapeHtml(message.status || "")}</small>
    ${state.activeRole === "ADMIN" ? `<button type="button" data-delete-message="${escapeAttr(message.id || "")}">Excluir</button>` : ""}
  </article>`;
}

function labelStatus(status = "") {
  return {
    aguardando_equipe: "Aguardando equipe",
    humano: "Humano",
    em_atendimento: "Em atendimento",
    aguardando_cliente: "Aguardando cliente",
    resolvido: "Resolvido"
  }[status] || status || "Aguardando equipe";
}

function initialsFor(value = "") {
  return String(value).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "WA";
}

function formatTime(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function deviceId() {
  const key = "sambah:push:deviceId";
  let value = localStorage.getItem(key);
  if (!value) {
    value = `device:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, value);
  }
  return value;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}
