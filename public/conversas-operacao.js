(() => {
  const refresh = document.querySelector("#refreshButton");
  const filterLabels = {
    all: "Tudo",
    needs_reply: "Não lidas",
    human: "Humano"
  };

  prepareRefreshButton();
  prepareFilterButtons();
  installFilterRule();
  installRenderDecorators();
  installSafetyObserver();
  updateOperationUi();

  function prepareRefreshButton() {
    if (!refresh) return;
    refresh.innerHTML = '<span class="refresh-symbol" aria-hidden="true">↻</span><span>Atualizar</span>';
    refresh.addEventListener("click", () => {
      if (refresh.classList.contains("is-loading")) return;
      refresh.classList.add("is-loading");
      refresh.disabled = true;
      window.setTimeout(() => {
        refresh.classList.remove("is-loading");
        refresh.disabled = false;
      }, 1200);
    }, true);
  }

  function prepareFilterButtons() {
    document.querySelectorAll("[data-filter]").forEach((button) => {
      const filter = button.dataset.filter || "all";
      const label = filterLabels[filter] || button.textContent.trim() || filter;
      button.innerHTML = `<span>${escapeOperationHtml(label)}</span><strong class="filter-count is-zero" data-filter-count="${escapeOperationHtml(filter)}">0</strong>`;
    });
  }

  function installFilterRule() {
    if (typeof matchesFilter !== "function") return;
    matchesFilter = function operationMatchesFilter(item) {
      if (state.filter === "human") return item.status === "humano";
      if (state.filter === "needs_reply") return conversationNeedsReply(item);
      return true;
    };
  }

  function installRenderDecorators() {
    if (typeof renderList === "function") {
      const originalRenderList = renderList;
      renderList = function operationRenderList() {
        const result = originalRenderList();
        decorateConversationList();
        updateFilterCounters();
        return result;
      };
    }

    if (typeof renderChat === "function") {
      const originalRenderChat = renderChat;
      renderChat = function operationRenderChat(conversation) {
        const result = originalRenderChat(conversation);
        decorateChat(conversation);
        return result;
      };
    }
  }

  function installSafetyObserver() {
    const target = document.querySelector(".app") || document.body;
    if (!target || typeof MutationObserver === "undefined") return;

    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        updateOperationUi();
      });
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  function updateOperationUi() {
    decorateConversationList();
    updateFilterCounters();
    const selected = Array.isArray(state?.items)
      ? state.items.find((item) => item.id === state.selectedId)
      : null;
    if (selected) decorateChat(selected);
  }

  function updateFilterCounters() {
    if (typeof state === "undefined" || !Array.isArray(state.items)) return;
    const counts = {
      all: state.items.length,
      needs_reply: state.items.filter(conversationNeedsReply).length,
      human: state.items.filter((item) => item.status === "humano").length
    };

    Object.entries(counts).forEach(([filter, value]) => {
      const button = document.querySelector(`[data-filter="${filter}"]`);
      const counter = document.querySelector(`[data-filter-count="${filter}"]`);
      if (counter) {
        const nextValue = String(value);
        if (counter.textContent !== nextValue) counter.textContent = nextValue;
        counter.classList.toggle("is-zero", value === 0);
      }
      button?.classList.toggle("has-pending", value > 0 && filter !== "all");
    });
  }

  function decorateConversationList() {
    if (typeof state === "undefined" || !Array.isArray(state.items)) return;
    document.querySelectorAll(".conversation-item[data-id]").forEach((button) => {
      const item = state.items.find((candidate) => candidate.id === button.dataset.id);
      if (!item) return;
      const pending = conversationNeedsReply(item);
      button.classList.toggle("needs-reply", pending);
      const tags = button.querySelector(".conversation-tags");
      const existing = tags?.querySelector(".pending-tag");
      if (pending && tags && !existing) {
        tags.insertAdjacentHTML("beforeend", '<em class="pending-tag">Não lida</em>');
      }
      if (!pending && existing) existing.remove();
    });
  }

  function decorateChat(conversation = {}) {
    const humanButton = document.querySelector("[data-action='human']");
    const automaticButton = document.querySelector("[data-action='automatico']");
    humanButton?.classList.toggle("is-active-human", conversation.status === "humano");
    automaticButton?.classList.toggle("is-active-auto", conversation.status !== "humano" && conversation.status !== "resolvido");
  }

  function conversationNeedsReply(item = {}) {
    if (["resolvido", "aguardando_cliente"].includes(item.status)) return false;
    const latest = latestConversationMessage(item);
    if (latest) return latest.direction === "in";
    return ["humano", "aguardando_equipe"].includes(item.status);
  }

  function latestConversationMessage(item = {}) {
    const messages = Array.isArray(item.mensagens) ? item.mensagens : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.direction === "in" || message?.direction === "out") return message;
    }
    return null;
  }

  function escapeOperationHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }
})();
