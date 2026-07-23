(() => {
  const READ_STORAGE_PREFIX = "sambah-conversation-read-state:";
  let currentConversation = null;
  let feedbackTimer = null;

  globalThis.sambahConversationIsUnread = conversationIsUnread;

  installReadTracking();
  installAttendedControls();
  installReadStateObserver();
  installGlobalActionMenuClose();
  refreshConversationIndicators();

  function installReadTracking() {
    if (typeof matchesFilter === "function") {
      matchesFilter = function attendedMatchesFilter(item) {
        if (state.filter === "human") return item.status === "humano";
        if (state.filter === "needs_reply") return conversationIsUnread(item);
        return true;
      };
    }

    if (typeof renderList === "function") {
      const originalRenderList = renderList;
      renderList = function attendedRenderList() {
        const result = originalRenderList();
        decorateConversationReadState();
        updateReadCounters();
        return result;
      };
    }

    if (typeof openConversation === "function") {
      const originalOpenConversation = openConversation;
      openConversation = async function attendedOpenConversation(id, options = {}) {
        const result = await originalOpenConversation(id, options);
        markConversationRead(id, { force: true, silent: true });
        refreshConversationIndicators();
        return result;
      };
    }
  }

  function installAttendedControls() {
    if (typeof renderChat !== "function") return;
    const originalRenderChat = renderChat;
    renderChat = function attendedRenderChat(conversation) {
      currentConversation = conversation || null;
      const result = originalRenderChat(conversation);
      decorateAttendedControls(conversation);
      decorateConversationActions(conversation);
      if (!readRecord(conversation?.id).manualUnread && document.visibilityState !== "hidden") {
        markConversationRead(conversation?.id, { silent: true });
      }
      refreshConversationIndicators();
      return result;
    };

    const selected = Array.isArray(state?.items)
      ? state.items.find((item) => item.id === state.selectedId)
      : null;
    if (selected) {
      currentConversation = selected;
      decorateAttendedControls(selected);
      decorateConversationActions(selected);
    }
  }

  function decorateAttendedControls(conversation = {}) {
    const resolved = conversation.status === "resolvido";
    const headerButton = document.querySelector("[data-action='resolved']");
    if (headerButton) {
      headerButton.textContent = resolved ? "✓ Atendido" : "Marcar atendido";
      headerButton.classList.add("attended-action");
      headerButton.classList.toggle("is-attended", resolved);
      headerButton.disabled = resolved;
      headerButton.title = resolved
        ? "Este atendimento já foi concluído"
        : "Concluir e retirar da fila de respostas";
    }

    const panel = document.querySelector(".reply-panel");
    const sendButton = panel?.querySelector("#sendReply");
    if (panel && sendButton && !panel.querySelector("[data-complete-conversation]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "attended-button";
      button.dataset.completeConversation = conversation.id || "";
      button.addEventListener("click", () => markConversationAttended(conversation.id));
      sendButton.insertAdjacentElement("afterend", button);
    }

    const completeButton = panel?.querySelector("[data-complete-conversation]");
    if (completeButton) {
      completeButton.textContent = resolved ? "✓ Atendido" : "✓ Concluir";
      completeButton.classList.toggle("is-attended", resolved);
      completeButton.disabled = resolved;
      completeButton.title = resolved
        ? "Este atendimento já foi concluído"
        : "Marcar esta conversa como atendida";
    }

    const status = document.querySelector("#replyStatus");
    if (panel && status) {
      status.classList.add("reply-feedback");
      if (status.parentElement !== panel) panel.appendChild(status);
      installStatusObserver(status);
      classifyReplyStatus(status);
    }
  }

  function installReadStateObserver() {
    const target = document.querySelector(".app") || document.body;
    if (!target || typeof MutationObserver === "undefined") return;
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        refreshConversationIndicators();
        const selected = currentConversation || selectedConversation();
        if (selected) decorateConversationActions(selected);
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function decorateConversationActions(conversation = {}) {
    const actions = document.querySelector(".chat-actions");
    if (!actions || !conversation?.id) return;

    actions.querySelector("[data-action='delete-conversation']")?.remove();

    const resolved = conversation.status === "resolvido";
    const unread = conversationIsUnread(conversation);
    const admin = state.activeRole === "ADMIN";
    const signature = `${conversation.id}:${resolved}:${unread}:${admin}`;
    const existingContainer = actions.querySelector("[data-conversation-actions]");
    if (existingContainer?.dataset.signature === signature) return;
    existingContainer?.remove();

    const container = document.createElement("div");
    container.className = "conversation-actions";
    container.dataset.conversationActions = conversation.id;
    container.dataset.signature = signature;
    container.innerHTML = `
      <button class="conversation-actions-toggle" type="button" aria-haspopup="menu" aria-expanded="false" title="Ações desta conversa">⋮ <span>Ações</span></button>
      <div class="conversation-actions-menu" role="menu" hidden>
        <button type="button" role="menuitem" data-conversation-command="toggle-read">${unread ? "Marcar como lida" : "Marcar como não lida"}</button>
        <button type="button" role="menuitem" data-conversation-command="toggle-attended">${resolved ? "Reabrir atendimento" : "Marcar como atendido"}</button>
        <span class="conversation-actions-separator" aria-hidden="true"></span>
        <button class="conversation-action-danger${admin ? "" : " is-restricted"}" type="button" role="menuitem" data-conversation-command="clear-history">Limpar histórico${admin ? "" : " · ADMIN"}</button>
        <button class="conversation-action-danger${admin ? "" : " is-restricted"}" type="button" role="menuitem" data-conversation-command="delete-conversation">Excluir conversa${admin ? "" : " · ADMIN"}</button>
      </div>
    `;
    actions.appendChild(container);

    const toggle = container.querySelector(".conversation-actions-toggle");
    const menu = container.querySelector(".conversation-actions-menu");
    toggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      closeAllActionMenus(container);
      const opening = menu?.hidden !== false;
      if (menu) menu.hidden = !opening;
      toggle.setAttribute("aria-expanded", String(opening));
    });
    menu?.addEventListener("click", (event) => event.stopPropagation());
    menu?.querySelectorAll("[data-conversation-command]").forEach((button) => {
      button.addEventListener("click", () => runConversationCommand(conversation, button.dataset.conversationCommand));
    });
  }

  async function runConversationCommand(conversation, command) {
    closeAllActionMenus();
    if (!conversation?.id || !command) return;

    if (command === "toggle-read") {
      const unread = conversationIsUnread(conversation);
      if (unread) {
        markConversationRead(conversation.id, { force: true });
        showActionFeedback("Conversa marcada como lida.", "success");
      } else {
        markConversationUnread(conversation.id);
        showActionFeedback("Conversa marcada como não lida.", "success");
      }
      refreshConversationIndicators();
      decorateConversationActions(conversation);
      return;
    }

    if (command === "toggle-attended") {
      await toggleConversationAttended(conversation);
      return;
    }

    if (command === "clear-history") {
      await clearConversationHistory(conversation);
      return;
    }

    if (command === "delete-conversation") {
      await removeConversation(conversation);
    }
  }

  async function toggleConversationAttended(conversation = {}) {
    const reopening = conversation.status === "resolvido";
    const action = reopening ? "automatico" : "resolvido";
    const progress = reopening ? "Reabrindo atendimento..." : "Concluindo atendimento...";
    setInlineFeedback(progress, "progress");
    showActionFeedback(progress, "progress", { sticky: true });
    try {
      await postConversationAction(conversation.id, action);
      if (!reopening) markConversationRead(conversation.id, { force: true, silent: true });
      const message = reopening
        ? "Atendimento reaberto e devolvido à fila."
        : "Atendimento concluído e retirado da fila.";
      setInlineFeedback(message, "success");
      showActionFeedback(message, "success");
    } catch (error) {
      const message = error.message || "Não foi possível atualizar o atendimento.";
      setInlineFeedback(message, "error");
      showActionFeedback(message, "error");
    }
  }

  async function clearConversationHistory(conversation = {}) {
    if (!requireAdmin("limpar o histórico")) return;
    const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
    const messageIds = messages.map((message) => String(message?.id || "").trim()).filter(Boolean);
    if (!messageIds.length) {
      showActionFeedback("Esta conversa já está sem histórico.", "success");
      return;
    }
    const confirmed = window.confirm(`Limpar ${messageIds.length} mensagem(ns) desta conversa? Esta ação não pode ser desfeita.`);
    if (!confirmed) {
      showActionFeedback("Limpeza cancelada. Nenhuma mensagem foi alterada.", "neutral");
      return;
    }

    setInlineFeedback("Limpando histórico...", "progress");
    showActionFeedback("Limpando histórico...", "progress", { sticky: true });
    let removed = 0;
    try {
      for (const messageId of messageIds) {
        const response = await fetch(`/api/conversas/${encodeURIComponent(conversation.id)}/mensagens/${encodeURIComponent(messageId)}`, {
          method: "DELETE"
        });
        const data = await safeJson(response);
        if (!response.ok || !data.ok) throw new Error(deleteErrorMessage(data.error));
        removed += 1;
        setInlineFeedback(`Limpando histórico: ${removed}/${messageIds.length}...`, "progress");
      }
      markConversationRead(conversation.id, { force: true, silent: true });
      await loadConversas();
      const message = `Histórico limpo: ${removed} mensagem(ns) excluída(s).`;
      setInlineFeedback(message, "success");
      showActionFeedback(message, "success");
    } catch (error) {
      const message = `${error.message || "Não foi possível limpar o histórico."} Excluídas: ${removed}/${messageIds.length}.`;
      setInlineFeedback(message, "error");
      showActionFeedback(message, "error");
      await loadConversas();
    }
  }

  async function removeConversation(conversation = {}) {
    if (!requireAdmin("excluir a conversa")) return;
    const confirmed = window.confirm("Excluir esta conversa? A exclusão só será aceita quando ela estiver resolvida, inativa ou sem mensagens.");
    if (!confirmed) {
      showActionFeedback("Exclusão cancelada. A conversa foi preservada.", "neutral");
      return;
    }

    setInlineFeedback("Excluindo conversa...", "progress");
    showActionFeedback("Excluindo conversa...", "progress", { sticky: true });
    try {
      const response = await fetch(`/api/conversas/${encodeURIComponent(conversation.id)}`, { method: "DELETE" });
      const data = await safeJson(response);
      if (!response.ok || !data.ok) throw new Error(conversationDeleteErrorMessage(data.error, data.reason));
      removeReadRecord(conversation.id);
      state.selectedId = "";
      currentConversation = null;
      await loadConversas();
      showActionFeedback("Conversa excluída com sucesso.", "success");
    } catch (error) {
      const message = error.message || "Não foi possível excluir a conversa.";
      setInlineFeedback(message, "error");
      showActionFeedback(message, "error");
    }
  }

  async function postConversationAction(id, action) {
    const response = await fetch(`/api/conversas/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    const data = await safeJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || "Ação não concluída");
    await loadConversas();
    return data;
  }

  async function markConversationAttended(id) {
    if (!id || state.selectedId !== id) return;
    const button = document.querySelector("[data-complete-conversation]");
    const headerButton = document.querySelector("[data-action='resolved']");

    if (button) {
      button.disabled = true;
      button.textContent = "Concluindo...";
    }
    if (headerButton) headerButton.disabled = true;
    setInlineFeedback("Concluindo atendimento...", "progress");

    try {
      await postConversationAction(id, "resolvido");
      markConversationRead(id, { force: true, silent: true });
      const message = "Atendimento concluído e retirado da fila de respostas.";
      setInlineFeedback(message, "success");
      showActionFeedback(message, "success");
    } catch (error) {
      const currentButton = document.querySelector("[data-complete-conversation]");
      const currentHeaderButton = document.querySelector("[data-action='resolved']");
      if (currentButton) {
        currentButton.disabled = false;
        currentButton.textContent = "✓ Concluir";
      }
      if (currentHeaderButton) currentHeaderButton.disabled = false;
      const message = error.message || "Não foi possível concluir o atendimento.";
      setInlineFeedback(message, "error");
      showActionFeedback(message, "error");
    }
  }

  function conversationIsUnread(item = {}) {
    const record = readRecord(item.id);
    if (record.manualUnread === true) return true;
    const latest = latestDirectionalMessage(item);
    if (!latest || latest.direction !== "in") return false;
    const marker = messageMarker(latest, item);
    if (record.seenMarker) return marker !== record.seenMarker;
    return !["resolvido", "aguardando_cliente"].includes(item.status);
  }

  function latestDirectionalMessage(item = {}) {
    const messages = Array.isArray(item.mensagens) ? item.mensagens : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.direction === "in" || message?.direction === "out") return message;
    }
    return null;
  }

  function messageMarker(message = {}, item = {}) {
    return String(
      message.id
      || message.messageId
      || message.providerMessageId
      || message.createdAt
      || `${message.direction || ""}:${message.text || ""}:${item.updatedAt || item.ultimaInteracao || ""}`
    );
  }

  function markConversationRead(id, { force = false, silent = false } = {}) {
    if (!id) return;
    const item = conversationById(id) || currentConversation || {};
    const current = readRecord(id);
    if (current.manualUnread && !force) return;
    const latest = latestDirectionalMessage(item);
    writeReadRecord(id, {
      seenMarker: latest ? messageMarker(latest, item) : current.seenMarker || "",
      manualUnread: false,
      updatedAt: new Date().toISOString()
    });
    if (!silent) refreshConversationIndicators();
  }

  function markConversationUnread(id) {
    if (!id) return;
    const current = readRecord(id);
    writeReadRecord(id, {
      ...current,
      manualUnread: true,
      updatedAt: new Date().toISOString()
    });
    refreshConversationIndicators();
  }

  function refreshConversationIndicators() {
    decorateConversationReadState();
    updateReadCounters();
  }

  function decorateConversationReadState() {
    if (typeof state === "undefined" || !Array.isArray(state.items)) return;
    document.querySelectorAll(".conversation-item[data-id]").forEach((button) => {
      const item = conversationById(button.dataset.id);
      if (!item) return;
      const unread = conversationIsUnread(item);
      button.classList.toggle("needs-reply", unread);
      button.classList.toggle("is-read", !unread);
      const tags = button.querySelector(".conversation-tags");
      const legacyTag = tags?.querySelector(".pending-tag");
      const localTag = tags?.querySelector(".read-state-tag");
      if (unread && tags && !legacyTag && !localTag) {
        tags.insertAdjacentHTML("beforeend", '<em class="read-state-tag">Não lida</em>');
      }
      if ((!unread || legacyTag) && localTag) localTag.remove();
    });
  }

  function updateReadCounters() {
    if (typeof state === "undefined" || !Array.isArray(state.items)) return;
    const counts = {
      all: state.items.length,
      needs_reply: state.items.filter(conversationIsUnread).length,
      human: state.items.filter((item) => item.status === "humano").length
    };
    Object.entries(counts).forEach(([filter, value]) => {
      const button = document.querySelector(`[data-filter="${filter}"]`);
      const counter = document.querySelector(`[data-filter-count="${filter}"]`);
      if (counter) {
        counter.textContent = String(value);
        counter.classList.toggle("is-zero", value === 0);
      }
      button?.classList.toggle("has-pending", value > 0 && filter !== "all");
    });
  }

  function selectedConversation() {
    return conversationById(state?.selectedId);
  }

  function conversationById(id) {
    if (!id || !Array.isArray(state?.items)) return null;
    return state.items.find((item) => item.id === id) || null;
  }

  function readStorageKey() {
    return `${READ_STORAGE_PREFIX}${state?.activeUser || "local"}`;
  }

  function readStateMap() {
    try {
      const raw = localStorage.getItem(readStorageKey());
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function readRecord(id) {
    const record = readStateMap()[id];
    return record && typeof record === "object" ? record : {};
  }

  function writeReadRecord(id, record) {
    if (!id) return;
    try {
      const map = readStateMap();
      map[id] = record;
      const entries = Object.entries(map).slice(-500);
      localStorage.setItem(readStorageKey(), JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // A interface continua funcionando mesmo se o navegador bloquear armazenamento local.
    }
  }

  function removeReadRecord(id) {
    if (!id) return;
    try {
      const map = readStateMap();
      delete map[id];
      localStorage.setItem(readStorageKey(), JSON.stringify(map));
    } catch {
      // Sem bloqueio da operação principal quando o armazenamento local falhar.
    }
  }

  function requireAdmin(actionLabel) {
    if (state.activeRole === "ADMIN") return true;
    const message = `Entre como ADMIN para ${actionLabel}.`;
    setInlineFeedback(message, "error");
    showActionFeedback(message, "error");
    return false;
  }

  function installGlobalActionMenuClose() {
    document.addEventListener("click", () => closeAllActionMenus());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllActionMenus();
    });
  }

  function closeAllActionMenus(except = null) {
    document.querySelectorAll("[data-conversation-actions]").forEach((container) => {
      if (container === except) return;
      const menu = container.querySelector(".conversation-actions-menu");
      const toggle = container.querySelector(".conversation-actions-toggle");
      if (menu) menu.hidden = true;
      toggle?.setAttribute("aria-expanded", "false");
    });
  }

  function setInlineFeedback(text, tone = "neutral") {
    const status = document.querySelector("#replyStatus");
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function showActionFeedback(text, tone = "neutral", { sticky = false } = {}) {
    let feedback = document.querySelector("#conversationActionFeedback");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.id = "conversationActionFeedback";
      feedback.className = "conversation-action-feedback";
      feedback.setAttribute("role", "status");
      feedback.setAttribute("aria-live", "polite");
      document.body.appendChild(feedback);
    }
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.dataset.tone = tone;
    feedback.classList.add("is-visible");
    if (!sticky) {
      feedbackTimer = window.setTimeout(() => {
        feedback.classList.remove("is-visible");
      }, 4200);
    }
  }

  function installStatusObserver(status) {
    if (!status || status.dataset.feedbackObserver === "true" || typeof MutationObserver === "undefined") return;
    status.dataset.feedbackObserver = "true";
    const observer = new MutationObserver(() => classifyReplyStatus(status));
    observer.observe(status, { childList: true, characterData: true, subtree: true });
  }

  function classifyReplyStatus(status) {
    if (!status) return;
    const text = String(status.textContent || "").trim().toLowerCase();
    let tone = "suggestion";

    if (!text) tone = "neutral";
    else if (text.includes("enviando") || text.includes("aguarda") || text.includes("excluindo") || text.includes("concluindo") || text.includes("limpando") || text.includes("reabrindo")) {
      tone = "progress";
    } else if (
      text.includes("enviada")
      || text.includes("enviado")
      || text.includes("concluído")
      || text.includes("concluido")
      || text.includes("excluída")
      || text.includes("excluida")
      || text.includes("limpo")
      || text.includes("reaberto")
      || text.includes("bloqueado")
    ) {
      tone = "success";
    } else if (
      text.includes("falha")
      || text.includes("erro")
      || text.includes("não foi possível")
      || text.includes("nao foi possivel")
      || text.includes("não enviado")
      || text.includes("nao enviado")
      || text.includes("entre como admin")
    ) {
      tone = "error";
    }

    status.dataset.tone = tone;
  }

  function deleteErrorMessage(error = "") {
    if (error === "auth_required") return "Entre como ADMIN para excluir mensagens.";
    if (error === "admin_required") return "Somente ADMIN pode excluir mensagens.";
    return error || "Não foi possível excluir a mensagem.";
  }

  function conversationDeleteErrorMessage(error = "", reason = "") {
    if (error === "auth_required") return "Entre como ADMIN para excluir conversas.";
    if (error === "admin_required") return "Somente ADMIN pode excluir conversas.";
    if (error === "conversation_not_deletable") return "A conversa ainda está ativa. Marque como atendida antes de excluir.";
    if (error === "conversation_not_found") return "Conversa não encontrada.";
    return reason || error || "Não foi possível excluir a conversa.";
  }

  async function safeJson(response) {
    try {
      return await response.json();
    } catch {
      return { ok: false, error: `Resposta inválida do servidor (${response.status})` };
    }
  }
})();
