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
const REFRESH_INTERVAL_MS = 5000;
let catalogCache = null;

refreshButton?.addEventListener("click", () => loadConversas({ forceLoading: true }));
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

loadConversas({ forceLoading: true });
setInterval(() => loadConversas({ silentRefresh: true }), REFRESH_INTERVAL_MS);

async function loadConversas({ silentRefresh = false, forceLoading = false } = {}) {
  if (forceLoading || (!silentRefresh && !state.items.length)) {
    listEl.innerHTML = `<div class="loading">Carregando...</div>`;
  }
  try {
    const response = await fetch("/api/conversas", { cache: "no-store" });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Erro ao carregar conversas");
    state.items = data.items || [];
    if (!state.selectedId && state.items[0]) state.selectedId = state.items[0].id;
    renderList();
    if (state.selectedId) await openConversation(state.selectedId, { silent: true });
  } catch (error) {
    if (!silentRefresh) {
      listEl.innerHTML = `<div class="loading">${escapeHtml(error.message || "Nao foi possivel carregar.")}</div>`;
    }
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
    const draft = chatEl.querySelector("#replyText")?.value || "";
    const hasDraftFocus = document.activeElement === chatEl.querySelector("#replyText");
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Conversa nao encontrada");
    renderChat(data.conversa, { draft: hasDraftFocus ? draft : "" });
  } catch (error) {
    chatEl.innerHTML = `<div class="empty-state"><strong>${escapeHtml(error.message || "Falha ao abrir conversa")}</strong></div>`;
  }
}

function renderChat(conversa, { draft = "" } = {}) {
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

    ${renderOrderPanel(conversa)}

    <section class="reply-panel">
      <button class="suggestion-button" type="button" id="useSuggestion">Usar sugestão</button>
      <textarea id="replyText" rows="2" placeholder="Escreve tua resposta pelo SamBah..."></textarea>
      <button class="send-button" type="button" id="sendReply">Enviar</button>
    </section>
    <p class="reply-status" id="replyStatus">${escapeHtml(conversa.respostaSugerida || "")}</p>
  `;

  scrollMessagesToBottom();
  loadCatalogIntoPanel();
  chatEl.querySelector("[data-action='human']")?.addEventListener("click", () => postAction(conversa.id, "humano"));
  chatEl.querySelector("[data-action='resolved']")?.addEventListener("click", () => postAction(conversa.id, "resolvido"));
  chatEl.querySelector("[data-order-action='add-item']")?.addEventListener("click", () => addCatalogItem(conversa.id));
  chatEl.querySelector("[data-order-action='send-mesa']")?.addEventListener("click", () => sendOrderToMesa(conversa.id));
  chatEl.querySelector("[data-order-action='cancel']")?.addEventListener("click", () => cancelOrder(conversa.id));
  chatEl.querySelector("#useSuggestion")?.addEventListener("click", () => {
    chatEl.querySelector("#replyText").value = conversa.respostaSugerida || "";
    chatEl.querySelector("#replyText").focus();
  });
  if (draft) {
    const textarea = chatEl.querySelector("#replyText");
    textarea.value = draft;
    textarea.focus();
  }
  chatEl.querySelector("#sendReply")?.addEventListener("click", () => sendReply(conversa.id));
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

function renderOrderPanel(conversa) {
  const order = conversa.whatsappOrder || null;
  const items = Array.isArray(order?.items) ? order.items : [];
  return `
    <section class="order-panel" aria-label="Comanda SamBah WhatsApp">
      <header>
        <div>
          <strong>Comanda SamBah</strong>
          <span>${escapeHtml(orderStatusLabel(order?.status || conversa.atendimentoEstado || ""))}</span>
        </div>
        <div class="order-actions">
          <button type="button" data-order-action="add-item">Adicionar item</button>
          <button type="button" data-order-action="send-mesa" ${items.length ? "" : "disabled"}>Enviar para Mesa</button>
          <button type="button" data-order-action="cancel" ${order ? "" : "disabled"}>Cancelar pedido</button>
        </div>
      </header>
      <div class="order-grid">
        <article>
          <span>Itens coletados</span>
          ${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(formatOrderItem(item))}</li>`).join("")}</ul>` : `<p>Nenhum item anotado ainda.</p>`}
        </article>
        <article>
          <span>Status Mesa</span>
          <p>${escapeHtml(order?.mesaStatus || order?.mesaOrderId || "Ainda nao enviado")}</p>
        </article>
        <article class="catalog-box">
          <span>Cardapio na tela</span>
          <div id="catalogPanel">Carregando cardapio...</div>
        </article>
      </div>
    </section>
  `;
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
    if (data.conversa) renderChat(data.conversa);
    const currentStatus = chatEl.querySelector("#replyStatus") || status;
    if (data.enviado) {
      currentStatus.textContent = "Resposta enviada pelo SamBah.";
    } else {
      const metaError = data.sendResult?.response?.error?.message || data.sendResult?.error || data.reason || "sem envio real";
      currentStatus.textContent = `Nao enviado pela Meta: ${metaError}`;
    }
    await loadConversas({ silentRefresh: true });
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel enviar.";
  }
}

async function addCatalogItem(id) {
  const textarea = chatEl.querySelector("#replyText");
  const status = chatEl.querySelector("#replyStatus");
  const text = textarea?.value.trim();
  if (!text) {
    status.textContent = "Escreve o item no campo de resposta para adicionar na comanda.";
    textarea?.focus();
    return;
  }
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}/pedido/item`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Falha ao adicionar item");
    textarea.value = "";
    await openConversation(id, { silent: true });
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel adicionar item.";
  }
}

async function sendOrderToMesa(id) {
  const status = chatEl.querySelector("#replyStatus");
  status.textContent = "Enviando comanda para Mesa...";
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}/pedido/enviar-mesa`, { method: "POST" });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || data.mesa?.error || "Falha ao enviar para Mesa");
    await openConversation(id, { silent: true });
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel enviar para Mesa.";
  }
}

async function cancelOrder(id) {
  const status = chatEl.querySelector("#replyStatus");
  status.textContent = "Cancelando pedido...";
  try {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}/pedido/cancelar`, { method: "POST" });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Falha ao cancelar pedido");
    await openConversation(id, { silent: true });
  } catch (error) {
    status.textContent = error.message || "Nao foi possivel cancelar pedido.";
  }
}

async function postAction(id, action) {
  await fetch(`/api/conversas/${encodeURIComponent(id)}/${action}`, { method: "POST" });
  await loadConversas();
}

async function loadCatalogIntoPanel() {
  const panel = chatEl.querySelector("#catalogPanel");
  if (!panel) return;
  try {
    if (!catalogCache) {
      const response = await fetch("/api/sambah/cardapio", { cache: "no-store" });
      catalogCache = await response.json();
    }
    const products = catalogCache.products || [];
    panel.innerHTML = products.length
      ? products.slice(0, 12).map((item) => `<button type="button" data-catalog-item="${escapeAttr(item.name)}">${escapeHtml(item.name)}</button>`).join("")
      : "Sem itens cadastrados.";
    panel.querySelectorAll("[data-catalog-item]").forEach((button) => {
      button.addEventListener("click", () => {
        const textarea = chatEl.querySelector("#replyText");
        textarea.value = button.dataset.catalogItem || "";
        textarea.focus();
      });
    });
  } catch {
    panel.textContent = "Nao foi possivel carregar o cardapio agora.";
  }
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

function orderStatusLabel(status = "") {
  const labels = {
    COMANDA_EM_ANDAMENTO: "Comanda em andamento",
    COMANDA_PRONTA: "Pronta para Mesa",
    collecting_items: "Coletando itens",
    ready_to_send: "Pronta para Mesa",
    mesa_pending: "Mesa pendente",
    sent_to_mesa: "Enviada para Mesa",
    cancelled: "Cancelada",
    PEDIDO_MESA_RECEBIDO: "Pedido Mesa recebido"
  };
  return labels[status] || status || "Sem comanda ativa";
}

function formatOrderItem(item = {}) {
  return `${item.quantity || 1}x ${item.name || item.rawText || "Item"}`;
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
