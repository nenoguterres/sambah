(() => {
  installAttendedControls();

  function installAttendedControls() {
    if (typeof renderChat !== "function") return;
    const originalRenderChat = renderChat;
    renderChat = function attendedRenderChat(conversation) {
      const result = originalRenderChat(conversation);
      decorateAttendedControls(conversation);
      return result;
    };

    const selected = Array.isArray(state?.items)
      ? state.items.find((item) => item.id === state.selectedId)
      : null;
    if (selected) decorateAttendedControls(selected);
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

  async function markConversationAttended(id) {
    if (!id || state.selectedId !== id) return;
    const button = document.querySelector("[data-complete-conversation]");
    const headerButton = document.querySelector("[data-action='resolved']");
    const status = document.querySelector("#replyStatus");

    if (button) {
      button.disabled = true;
      button.textContent = "Concluindo...";
    }
    if (headerButton) headerButton.disabled = true;
    setReplyFeedback(status, "Concluindo atendimento...", "progress");

    try {
      if (typeof postAction !== "function") throw new Error("Ação de conclusão indisponível");
      await postAction(id, "resolvido");
      const currentStatus = document.querySelector("#replyStatus");
      setReplyFeedback(currentStatus, "Atendimento concluído e retirado da fila de respostas.", "success");
    } catch (error) {
      const currentButton = document.querySelector("[data-complete-conversation]");
      const currentHeaderButton = document.querySelector("[data-action='resolved']");
      if (currentButton) {
        currentButton.disabled = false;
        currentButton.textContent = "✓ Concluir";
      }
      if (currentHeaderButton) currentHeaderButton.disabled = false;
      setReplyFeedback(
        document.querySelector("#replyStatus"),
        error.message || "Não foi possível concluir o atendimento.",
        "error"
      );
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
    else if (text.includes("enviando") || text.includes("aguarda") || text.includes("excluindo") || text.includes("concluindo")) {
      tone = "progress";
    } else if (
      text.includes("enviada") ||
      text.includes("enviado") ||
      text.includes("concluído") ||
      text.includes("concluido") ||
      text.includes("bloqueado")
    ) {
      tone = "success";
    } else if (
      text.includes("falha") ||
      text.includes("erro") ||
      text.includes("não foi possível") ||
      text.includes("nao foi possivel") ||
      text.includes("não enviado") ||
      text.includes("nao enviado")
    ) {
      tone = "error";
    }

    status.dataset.tone = tone;
  }

  function setReplyFeedback(status, text, tone) {
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  }
})();
