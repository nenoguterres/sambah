(() => {
  const refresh = document.querySelector("#refreshButton");
  const filterLabels = {
    all: "Tudo",
    needs_reply: "Não lidas",
    human: "Humano"
  };
  let conversationRefreshPromise = null;

  prepareRefreshButton();
  prepareFilterButtons();
  installFilterRule();
  installRenderDecorators();
  installConversationContinuity();
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

  function installConversationContinuity() {
    if (typeof loadConversas === "function") {
      loadConversas = function operationLoadConversas() {
        if (conversationRefreshPromise) return conversationRefreshPromise;
        conversationRefreshPromise = refreshConversationsWithoutInterrupting()
          .finally(() => {
            conversationRefreshPromise = null;
          });
        return conversationRefreshPromise;
      };
    }

    if (typeof sendReply === "function") {
      const originalSendReply = sendReply;
      sendReply = async function operationSendReply(id) {
        try {
          return await originalSendReply(id);
        } finally {
          window.requestAnimationFrame(() => focusReplyComposer(id));
        }
      };
    }
  }

  async function refreshConversationsWithoutInterrupting() {
    const list = document.querySelector("#conversationList");
    const hasRenderedConversations = Boolean(list?.querySelector(".conversation-item"));
    const hasKnownConversations = Array.isArray(state.items) && state.items.length > 0;

    if (!hasRenderedConversations && !hasKnownConversations && list) {
      list.innerHTML = '<div class="loading">Carregando...</div>';
    }

    try {
      const response = await fetch("/api/conversas", { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Erro ao carregar conversas");

      state.items = data.items || [];
      processHumanAlerts(state.items);

      const requestedId = new URLSearchParams(location.search).get("conversationId") || "";
      if (!state.selectedId && requestedId) state.selectedId = requestedId;
      if (state.selectedId && !state.items.some((item) => item.id === state.selectedId)) {
        state.selectedId = "";
      }
      if (!state.selectedId && state.items[0]) state.selectedId = state.items[0].id;

      renderHumanAlertPanel();
      renderList();

      if (state.selectedId) {
        await refreshSelectedConversation(state.selectedId);
      }
    } catch (error) {
      if (!hasRenderedConversations && !hasKnownConversations && list) {
        list.innerHTML = `<div class="loading">${escapeOperationHtml(error.message || "Nao foi possivel carregar.")}</div>`;
      }
      const replyStatus = document.querySelector("#replyStatus");
      if (replyStatus && !replyStatus.textContent.trim()) {
        replyStatus.textContent = "Não foi possível atualizar agora. Tua digitação foi preservada.";
      }
    }
  }

  async function refreshSelectedConversation(id) {
    try {
      const response = await fetch(`/api/conversas/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Conversa nao encontrada");
      if (state.selectedId !== id) return;

      const replyState = captureReplyComposer(id);
      renderChat(data.conversa);
      restoreReplyComposer(replyState, id);
    } catch (error) {
      if (state.selectedId !== id) return;
      const replyStatus = document.querySelector("#replyStatus");
      if (replyStatus && !replyStatus.textContent.trim()) {
        replyStatus.textContent = error.message || "Não foi possível atualizar esta conversa agora.";
      }
    }
  }

  function captureReplyComposer(id) {
    const textarea = document.querySelector("#replyText");
    if (!textarea || state.selectedId !== id) return null;

    const messages = document.querySelector("#messageList");
    const distanceFromBottom = messages
      ? messages.scrollHeight - messages.scrollTop - messages.clientHeight
      : 0;

    return {
      value: textarea.value,
      focused: document.activeElement === textarea,
      selectionStart: textarea.selectionStart ?? textarea.value.length,
      selectionEnd: textarea.selectionEnd ?? textarea.value.length,
      selectionDirection: textarea.selectionDirection || "none",
      messageScrollTop: messages?.scrollTop || 0,
      messageAtBottom: distanceFromBottom < 48
    };
  }

  function restoreReplyComposer(snapshot, id) {
    if (!snapshot || state.selectedId !== id) return;
    const textarea = document.querySelector("#replyText");
    if (!textarea) return;

    textarea.value = snapshot.value;
    const selectionStart = Math.min(snapshot.selectionStart, textarea.value.length);
    const selectionEnd = Math.min(snapshot.selectionEnd, textarea.value.length);

    const restoreSelectionAndFocus = () => {
      if (state.selectedId !== id) return;
      const currentTextarea = document.querySelector("#replyText");
      if (!currentTextarea || currentTextarea.disabled) return;
      if (snapshot.focused) {
        try {
          currentTextarea.focus({ preventScroll: true });
        } catch {
          currentTextarea.focus();
        }
        currentTextarea.setSelectionRange(selectionStart, selectionEnd, snapshot.selectionDirection);
      }
    };

    const restoreMessageScroll = () => {
      if (state.selectedId !== id) return;
      const messages = document.querySelector("#messageList");
      if (!messages) return;
      messages.scrollTop = snapshot.messageAtBottom ? messages.scrollHeight : snapshot.messageScrollTop;
    };

    restoreSelectionAndFocus();
    restoreMessageScroll();
    window.requestAnimationFrame(() => {
      restoreSelectionAndFocus();
      restoreMessageScroll();
    });
    window.setTimeout(restoreMessageScroll, 120);
  }

  function focusReplyComposer(id) {
    if (state.selectedId !== id) return;
    const textarea = document.querySelector("#replyText");
    if (!textarea || textarea.disabled) return;
    try {
      textarea.focus({ preventScroll: true });
    } catch {
      textarea.focus();
    }
    const cursor = textarea.value.length;
    textarea.setSelectionRange(cursor, cursor);
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
