const state = {
  items: [],
  selectedId: "",
  filter: "all",
  query: ""
};

const listEl = document.querySelector("#conversationList");
const chatEl = document.querySelector("#chatPane");
const searchInput = document.querySelector("#searchInput");
const refreshButton = document.querySelector("#refreshButton");

refreshButton?.addEventListener("click", loadConversas);
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

loadConversas();
setInterval(loadConversas, 30000);

async function loadConversas() {
  listEl.innerHTML = `<div class="loading">Carregando...</div>`;
  try {
    const response = await fetch("/api/conversas");
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Erro ao carregar conversas");
    state.items = data.items || [];
    if (!state.selectedId && state.items[0]) state.selectedId = state.items[0].id;
    renderList();
    if (state.selectedId) await openConversation(state.selectedId, { silent: true });
  } catch (error) {
    listEl.innerHTML = `<div class="loading">${escapeHtml(error.message || "Nao foi possivel carregar.")}</div>`;
  }
}

function renderList() {
  const items = state.items.filter(matchesFilter).filter(matchesSearch);
  if (!items.length) {
    listEl.innerHTML = `<div class="loading">Nenhuma conversa neste filtro.</div>`;
    return;
  }
  listEl.innerHTML = items.map((item) => {
    const selected = item.id === state.selectedId ? " selected" : "";
    const initials = initialsFor(item.nome || item.telefone || "WA");
    return `
      <button class="conversation-item${selected}" type="button" data-id="${escapeAttr(item.id)}">
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
  chatEl.innerHTML = `
    <header class="chat-header">
      <span class="avatar large">${escapeHtml(initialsFor(conversa.nome || conversa.telefone || "WA"))}</span>
      <div>
        <strong>${escapeHtml(conversa.nome || "Cliente WhatsApp")}</strong>
        <small>${escapeHtml(conversa.telefone || "")} · ${escapeHtml(labelStatus(conversa.status))}</small>
      </div>
      <div class="chat-actions">
        <button type="button" data-action="human">Humano</button>
        <button type="button" data-action="resolved">Resolvido</button>
      </div>
    </header>

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

  chatEl.querySelector("#messageList")?.scrollTo({ top: 999999 });
  chatEl.querySelector("[data-action='human']")?.addEventListener("click", () => postAction(conversa.id, "humano"));
  chatEl.querySelector("[data-action='resolved']")?.addEventListener("click", () => postAction(conversa.id, "resolvido"));
  chatEl.querySelector("#useSuggestion")?.addEventListener("click", () => {
    chatEl.querySelector("#replyText").value = conversa.respostaSugerida || "";
    chatEl.querySelector("#replyText").focus();
  });
  chatEl.querySelector("#sendReply")?.addEventListener("click", () => sendReply(conversa.id));
}

function renderMessage(message) {
  const outgoing = message.direction === "out";
  const text = message.text || message.transcricao || describeMessage(message);
  return `
    <article class="message ${outgoing ? "out" : "in"}">
      <p>${escapeHtml(text)}</p>
      <span>${formatTime(message.createdAt)} · ${escapeHtml(message.status || "")}</span>
    </article>
  `;
}

async function sendReply(id) {
  const textarea = chatEl.querySelector("#replyText");
  const status = chatEl.querySelector("#replyStatus");
  const text = textarea?.value.trim();
  if (!text) {
    status.textContent = "Escreve uma resposta antes de enviar.";
    return;
  }
  status.textContent = "Enviando...";
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}/responder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || data.reason || "Falha ao enviar");
    textarea.value = "";
    if (data.enviado) {
      status.textContent = "Resposta enviada pelo SamBah.";
    } else {
      const metaError = data.sendResult?.response?.error?.message || data.sendResult?.error || data.reason || "sem envio real";
      status.textContent = `Nao enviado pela Meta: ${metaError}`;
    }
    await loadConversas();
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel enviar.";
  }
}

async function postAction(id, action) {
  await fetch(`/api/conversas/${encodeURIComponent(id)}/${action}`, { method: "POST" });
  await loadConversas();
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
