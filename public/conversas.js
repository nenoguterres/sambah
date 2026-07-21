const state = {
  items: [],
  selectedId: "",
  filter: "all",
  query: "",
  activeRole: "",
  activeUser: "",
  humanAlertsReady: false,
  humanAlertKeys: new Set(),
  humanAlertQueue: [],
  whatsappStatus: null
  sendingReply: false,
  lastManualSendAt: 0
};

const listEl = document.querySelector("#conversationList");
const chatEl = document.querySelector("#chatPane");
const searchInput = document.querySelector("#searchInput");
const refreshButton = document.querySelector("#refreshButton");
const connectionStatusEl = document.querySelector("#connectionStatus");
const humanAlertPanelEl = document.querySelector("#humanAlertPanel");

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
  await refreshInbox();
}

async function refreshInbox() {
  await loadWhatsappStatus();
  await loadConversas();
}

async function loadActiveUser() {
  try {
    const response = await fetch("/api/auth/me");
    if (!response.ok) return;
    const data = await response.json();
    state.activeRole = data.user?.role || "";
    state.activeUser = data.user?.username || data.user?.displayName || "";
    restoreHumanAlertKeys();
  } catch {
    state.activeRole = "";
    state.activeUser = "";
  }
}

async function loadConversas() {
  listEl.innerHTML = `<div class="loading">Carregando...</div>`;
  try {
    const response = await fetch("/api/conversas");
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Erro ao carregar conversas");
    state.items = data.items || [];
    processHumanAlerts(state.items);
    const requestedId = new URLSearchParams(location.search).get("conversationId") || "";
    if (!state.selectedId && requestedId) state.selectedId = requestedId;
    if (!state.selectedId && state.items[0]) state.selectedId = state.items[0].id;
    renderHumanAlertPanel();
    renderList();
    if (state.selectedId) await openConversation(state.selectedId, { silent: true });
  } catch (error) {
    listEl.innerHTML = `<div class="loading">${escapeHtml(error.message || "Nao foi possivel carregar.")}</div>`;
  }
}

async function loadWhatsappStatus() {
  try {
    const response = await fetch("/admin/whatsapp/status");
    if (!response.ok) throw new Error("status_unavailable");
    state.whatsappStatus = await response.json();
  } catch {
    state.whatsappStatus = { provider: "desconhecido", configured: false, sendEnabled: false, error: "status_unavailable" };
  }
  renderConnectionStatus();
}

function renderConnectionStatus() {
  if (!connectionStatusEl) return;
  const status = state.whatsappStatus || {};
  const provider = status.provider || "desconhecido";
  const healthy = status.configured === true && status.sendEnabled === true;
  const partial = status.configured === true && status.sendEnabled !== true;
  const missing = [];
  if (provider === "meta" && status.phoneNumberIdConfigured !== true) missing.push("ID do telefone");
  if (provider === "meta" && status.accessTokenConfigured !== true) missing.push("token Meta");
  if (provider === "meta" && status.verifyTokenConfigured !== true) missing.push("token de verificacao");
  const label = healthy
    ? "Meta pronto para envio real"
    : partial
      ? "Meta configurado, envio real desligado"
      : provider === "meta"
        ? `Meta incompleto${missing.length ? `: falta ${missing.join(", ")}` : ""}`
        : "Modo local/mock";
  connectionStatusEl.className = `connection-status ${healthy ? "ok" : partial ? "warn" : "error"}`;
  connectionStatusEl.innerHTML = `
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(`motor=${status.engine || "disabled"} | envio=${Boolean(status.sendEnabled)} | auto=${Boolean(status.autoReplyEnabled)} | IA=${Boolean(status.aiEnabled)} | inbox=${Boolean(status.receivingActive)}`)}</span>
  `;
}

function renderHumanAlertPanel() {
  if (!humanAlertPanelEl) return;
  const humanItems = state.items.filter((item) => item.status === "humano");
  if (!humanItems.length && !state.humanAlertQueue.length) {
    humanAlertPanelEl.innerHTML = "";
    return;
  }
  const latest = state.humanAlertQueue.at(-1);
  const notificationAllowed = typeof Notification !== "undefined" && Notification.permission === "granted";
  const notificationBlocked = typeof Notification !== "undefined" && Notification.permission === "denied";
  humanAlertPanelEl.innerHTML = `
    <div>
      <strong>${humanItems.length} atendimento${humanItems.length === 1 ? "" : "s"} humano${humanItems.length === 1 ? "" : "s"} aberto${humanItems.length === 1 ? "" : "s"}</strong>
      <span>${escapeHtml(latest ? `Novo chamado: ${latest.nome || latest.telefone || latest.id}` : "Monitorando chamados humanos em tempo real.")}</span>
    </div>
    <div class="human-alert-actions">
      <button type="button" data-human-filter>Ver humanos</button>
      ${!notificationAllowed && !notificationBlocked ? `<button type="button" data-enable-human-alerts>Ativar avisos</button>` : ""}
    </div>
  `;
  humanAlertPanelEl.querySelector("[data-human-filter]")?.addEventListener("click", () => {
    state.filter = "human";
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item.dataset.filter === "human"));
    renderList();
  });
  humanAlertPanelEl.querySelector("[data-enable-human-alerts]")?.addEventListener("click", enableHumanNotifications);
}

function renderList() {
  const items = state.items.filter(matchesFilter).filter(matchesSearch);
  if (!items.length) {
    listEl.innerHTML = `<div class="loading">Nenhuma conversa neste filtro.</div>`;
    return;
  }
  listEl.innerHTML = items.map((item) => {
    const selected = item.id === state.selectedId ? " selected" : "";
    const humanOpen = item.status === "humano" ? " human-open" : "";
    const initials = initialsFor(item.nome || item.telefone || "WA");
    return `
      <button class="conversation-item${selected}${humanOpen}" type="button" data-id="${escapeAttr(item.id)}">
        <span class="avatar">${escapeHtml(initials)}</span>
        <span class="conversation-main">
          <span class="conversation-top">
            <strong>${escapeHtml(item.nome || "Cliente WhatsApp")}</strong>
            <small>${formatTime(item.ultimaInteracao || item.updatedAt || item.createdAt)}</small>
          </span>
          <span class="conversation-preview">${escapeHtml(item.ultimaMensagem || "Sem mensagem")}</span>
          <span class="conversation-tags">
            <em>${escapeHtml(labelStatus(item.status))}</em>
            <em>${escapeHtml(item.intencao || "desconhecido")}</em>
          </span>
        </span>
      </button>
    `;
  }).join("");
  listEl.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => openConversation(button.dataset.id));
  });
}

async function openConversation(id, { silent = false } = {}) {
  state.selectedId = id;
  renderList();
  if (!silent) chatEl.innerHTML = `<div class="empty-state"><strong>Carregando conversa...</strong></div>`;
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Conversa nao encontrada");
    renderChat(data.conversa);
  } catch (error) {
    chatEl.innerHTML = `<div class="empty-state"><strong>${escapeHtml(error.message || "Falha ao abrir conversa")}</strong></div>`;
  }
}

function renderChat(conversa) {
  const messages = conversa.mensagens || [];
  const humanNotice = conversa.status === "humano"
    ? `<div class="human-chat-notice"><strong>Atendimento humano ativo</strong><span>O bot esta quieto. Responde por aqui para continuar na mesma conversa do WhatsApp.</span></div>`
    : "";
  chatEl.innerHTML = `
    <header class="chat-header">
      <span class="avatar large">${escapeHtml(initialsFor(conversa.nome || conversa.telefone || "WA"))}</span>
      <div>
        <strong>${escapeHtml(conversa.nome || "Cliente WhatsApp")}</strong>
        <small>${escapeHtml(conversa.telefone || "")} · ${escapeHtml(labelStatus(conversa.status))}</small>
      </div>
      <div class="chat-actions">
        <button type="button" data-action="human">Humano</button>
        <button type="button" data-action="automatico">Automático</button>
        <button type="button" data-action="resolved">Resolvido</button>
        ${state.activeRole === "ADMIN" ? `<button class="danger-action" type="button" data-action="delete-conversation">Excluir conversa</button>` : ""}
      </div>
    </header>
    ${humanNotice}

    <section class="message-list" id="messageList">
      ${messages.map(renderMessage).join("") || `<div class="day-marker">Sem histórico ainda</div>`}
    </section>

    <section class="reply-panel">
      <button class="suggestion-button" type="button" id="useSuggestion">Usar sugestão</button>
      <textarea id="replyText" rows="2" placeholder="Escreve tua resposta pelo SamBah..."></textarea>
      <button class="send-button" type="button" id="sendReply">Enviar</button>
    </section>
    <p class="reply-status" id="replyStatus">${escapeHtml(conversa.respostaSugerida || "")}</p>
  `;

  scrollMessagesToBottom();
  chatEl.querySelectorAll("[data-delete-message]").forEach((button) => {
    button.addEventListener("click", () => deleteMessage(conversa.id, button.dataset.deleteMessage));
  });
  chatEl.querySelector("[data-action='human']")?.addEventListener("click", () => postAction(conversa.id, "humano"));
  chatEl.querySelector("[data-action='automatico']")?.addEventListener("click", () => postAction(conversa.id, "automatico"));
  chatEl.querySelector("[data-action='resolved']")?.addEventListener("click", () => postAction(conversa.id, "resolvido"));
  chatEl.querySelector("[data-action='delete-conversation']")?.addEventListener("click", () => deleteConversation(conversa.id));
  chatEl.querySelector("#useSuggestion")?.addEventListener("click", () => {
    chatEl.querySelector("#replyText").value = conversa.respostaSugerida || "";
    chatEl.querySelector("#replyText").focus();
  });
  chatEl.querySelector("#replyText")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    sendReply(conversa.id);
  });
  chatEl.querySelector("#sendReply")?.addEventListener("click", () => sendReply(conversa.id));
}

function processHumanAlerts(items = []) {
  const openHumanItems = items.filter((item) => item.status === "humano");
  const currentKeys = openHumanItems.map(humanAlertKey).filter(Boolean);
  if (!state.humanAlertsReady) {
    currentKeys.forEach((key) => state.humanAlertKeys.add(key));
    state.humanAlertsReady = true;
    persistHumanAlertKeys();
    return;
  }
  const newAlerts = [];
  for (const item of openHumanItems) {
    const key = humanAlertKey(item);
    if (!key || state.humanAlertKeys.has(key)) continue;
    state.humanAlertKeys.add(key);
    newAlerts.push(item);
  }
  if (!newAlerts.length) {
    persistHumanAlertKeys();
    return;
  }
  state.humanAlertQueue = [...state.humanAlertQueue, ...newAlerts].slice(-5);
  persistHumanAlertKeys();
  for (const item of newAlerts) notifyHumanMonitor(item);
}

function humanAlertKey(item = {}) {
  if (item.status !== "humano") return "";
  const messages = Array.isArray(item.mensagens) ? item.mensagens : [];
  const inbound = [...messages].reverse().find((message) => message.direction === "in");
  const marker = inbound?.id || inbound?.createdAt || inbound?.text || item.updatedAt || item.ultimaInteracao || "humano";
  return `${item.id || item.telefone || "wa"}:${marker}`;
}

function restoreHumanAlertKeys() {
  try {
    const storageKey = humanAlertStorageKey();
    const raw = sessionStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    state.humanAlertKeys = new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    state.humanAlertKeys = new Set();
  }
}

function persistHumanAlertKeys() {
  try {
    sessionStorage.setItem(humanAlertStorageKey(), JSON.stringify([...state.humanAlertKeys].slice(-200)));
  } catch {
    // O alerta continua funcionando mesmo sem sessionStorage.
  }
}

function humanAlertStorageKey() {
  return `sambah-human-alerts:${state.activeUser || "local"}`;
}

function notifyHumanMonitor(item = {}) {
  playHumanAlertSound();
  showHumanBrowserNotification(item);
  if (state.filter !== "human") {
    humanAlertPanelEl?.classList.add("pulse");
    setTimeout(() => humanAlertPanelEl?.classList.remove("pulse"), 1800);
  }
}

async function enableHumanNotifications() {
  playHumanAlertSound();
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  renderHumanAlertPanel();
}

function showHumanBrowserNotification(item = {}) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const title = "SamBah: atendimento humano";
  const body = `${item.nome || "Cliente WhatsApp"} precisa de atendimento humano.`;
  try {
    const notification = new Notification(title, { body, tag: `sambah-human-${item.id || item.telefone || "wa"}` });
    notification.onclick = () => {
      window.focus();
      if (item.id) openConversation(item.id);
    };
  } catch {
    // Navegadores podem bloquear notificacoes sem permissao do sistema.
  }
}

function playHumanAlertSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34);
    gain.connect(context.destination);
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.12);
      oscillator.stop(context.currentTime + 0.16 + index * 0.12);
    });
    setTimeout(() => context.close(), 520);
  } catch {
    // Sem som se o navegador bloquear audio automatico.
  }
}

function scrollMessagesToBottom() {
  const list = chatEl.querySelector("#messageList");
  if (!list) return;
  const scroll = () => {
    if (list.scrollHeight > list.clientHeight + 8) {
      list.scrollTop = list.scrollHeight;
      return;
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
  };
  scroll();
  requestAnimationFrame(scroll);
  setTimeout(scroll, 80);
}

function renderMessage(message) {
  const outgoing = message.direction === "out";
  const text = message.text || message.transcricao || describeMessage(message);
  const messageId = message.id || "";
  const statusText = `${formatTime(message.createdAt)} · ${labelMessageStatus(message.status)}${message.errorMessage ? ` · ${message.errorMessage}` : ""}`;
  return `
    <article class="message ${outgoing ? "out" : "in"}">
      <p>${escapeHtml(text)}</p>
      ${messageId ? `<button class="message-delete" type="button" data-delete-message="${escapeAttr(messageId)}" title="Excluir mensagem; somente ADMIN">Excluir</button>` : ""}
      <span>${escapeHtml(statusText)}</span>
    </article>
  `;
}

async function sendReply(id) {
  const now = Date.now();

  if (state.sendingReply || now - (state.lastManualSendAt || 0) < 2500) {
    const status = chatEl.querySelector("#replyStatus");
    if (status) status.textContent = "Envio em andamento. Aguarda um instante.";
    return;
  }

  const textarea = chatEl.querySelector("#replyText");
  const button = chatEl.querySelector("#sendReply");
  const status = chatEl.querySelector("#replyStatus");
  const text = textarea?.value.trim();

  if (!text) {
    if (status) status.textContent = "Escreve uma resposta antes de enviar.";
    return;
  }

  state.sendingReply = true;
  state.lastManualSendAt = now;

  const oldButtonText = button?.textContent || "Enviar";

  if (button) {
    button.disabled = true;
    button.textContent = "Enviando...";
  }

  if (textarea) {
    textarea.disabled = true;
  }

  if (status) {
    status.textContent = "Enviando...";
  }

  const manualSendId = `manual_${id}_${now}_${Math.random().toString(36).slice(2)}`;

  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}/responder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, manualSendId })
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || data.reason || "Falha ao enviar");
    }

    if (textarea) textarea.value = "";

    if (status) {
      if (data.duplicated) {
        status.textContent = "Envio duplicado bloqueado.";
      } else if (data.enviado) {
        status.textContent = "Resposta enviada pelo SamBah.";
      } else {
        const metaError = data.message?.errorMessage || data.sendResult?.error || data.reason || "sem envio real";
        status.textContent = `Registrada sem envio real: ${metaError}`;
      }
    }

    await loadConversas({ silentRefresh: true });
  } catch (error) {
    if (status) status.textContent = error.message || "Nao foi possivel enviar.";
  } finally {
    state.sendingReply = false;

    const currentButton = chatEl.querySelector("#sendReply");
    const currentTextarea = chatEl.querySelector("#replyText");

    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = oldButtonText;
    }

    if (currentTextarea) {
      currentTextarea.disabled = false;
    }
  }
}

async function postAction(id, action) {
  await fetch(`/api/conversas/${encodeURIComponent(id)}/${action}`, { method: "POST" });
  await loadConversas();
}

async function deleteMessage(conversationId, messageId) {
  const status = chatEl.querySelector("#replyStatus");
  if (!messageId) return;
  const confirmed = window.confirm("Excluir esta mensagem do histórico? Apenas ADMIN pode fazer isso.");
  if (!confirmed) return;
  if (status) status.textContent = "Excluindo mensagem...";
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(conversationId)}/mensagens/${encodeURIComponent(messageId)}`, {
      method: "DELETE"
    });
    const data = await response.json();
    if (!data.ok) throw new Error(deleteErrorMessage(data.error));
    if (status) status.textContent = "Mensagem excluída por ADMIN.";
    await loadConversas();
  } catch (error) {
    if (status) status.textContent = error.message || "Nao foi possivel excluir a mensagem.";
  }
}

async function deleteConversation(conversationId) {
  const status = chatEl.querySelector("#replyStatus");
  const confirmed = window.confirm("Tem certeza que deseja excluir esta conversa sem uso?");
  if (!confirmed) return;
  if (status) status.textContent = "Excluindo conversa...";
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
    const data = await response.json();
    if (!data.ok) throw new Error(conversationDeleteErrorMessage(data.error, data.reason));
    state.selectedId = "";
    if (status) status.textContent = "Conversa excluida.";
    await loadConversas();
  } catch (error) {
    if (status) status.textContent = error.message || "Nao foi possivel excluir a conversa.";
  }
}

function deleteErrorMessage(error = "") {
  if (error === "auth_required") return "Entra como ADMIN para excluir mensagens.";
  if (error === "admin_required") return "Somente ADMIN pode excluir mensagens.";
  return error || "Nao foi possivel excluir a mensagem.";
}

function conversationDeleteErrorMessage(error = "", reason = "") {
  if (error === "auth_required") return "Entra como ADMIN para excluir conversas.";
  if (error === "admin_required") return "Somente ADMIN pode excluir conversas.";
  if (error === "conversation_not_deletable") return "Esta conversa ainda esta ativa e nao pode ser excluida.";
  if (error === "conversation_not_found") return "Conversa nao encontrada.";
  return reason || error || "Nao foi possivel excluir a conversa.";
}

function matchesFilter(item) {
  if (state.filter === "human") return item.status === "humano";
  if (state.filter === "needs_reply") return !["resolvido", "aguardando_cliente"].includes(item.status);
  return true;
}

function matchesSearch(item) {
  const query = normalize(state.query);
  if (!query) return true;
  return normalize(`${item.nome || ""} ${item.telefone || ""} ${item.ultimaMensagem || ""}`).includes(query);
}

function describeMessage(message = {}) {
  if (message.type === "audio") return "Audio recebido";
  if (message.type) return `Mensagem ${message.type}`;
  return "";
}

function labelStatus(status = "") {
  const labels = {
    aguardando_equipe: "Aguardando equipe",
    aguardando_cliente: "Aguardando cliente",
    humano: "Humano",
    resolvido: "Resolvido",
    pendente_configuracao: "Configuração",
    erro_configuracao: "Erro de configuração"
  };
  return labels[status] || status || "Novo";
}

function labelMessageStatus(status = "") {
  const labels = {
    received: "Recebida",
    recebida: "Recebida",
    registrada: "Registrada",
    registrada_sem_envio: "Registrada sem envio",
    sent: "Enviada",
    delivered: "Entregue",
    read: "Lida",
    failed: "Falhou",
    meta_error: "Falhou na Meta",
    meta_timeout: "Meta sem resposta",
    meta_request_failed: "Erro de envio",
    meta_configuration_incomplete: "Meta incompleta",
    whatsapp_sender_disabled: "Envio desligado"
  };
  return labels[status] || status || "Registrada";
}

function initialsFor(value = "") {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "W") + (words[1]?.[0] || "A");
}

function formatTime(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
