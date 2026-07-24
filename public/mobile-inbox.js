(() => {
  const MOBILE_QUERY = "(max-width: 820px)";
  const mobileMedia = typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_QUERY) : null;
  const listEl = document.querySelector("#conversationList");
  const chatEl = document.querySelector("#chatPane");
  let manualListView = false;

  function isMobile() {
    return mobileMedia ? mobileMedia.matches : window.innerWidth <= 820;
  }

  function showList({ manual = true } = {}) {
    manualListView = manual;
    document.body.classList.remove("conversation-mobile-chat-open");
  }

  function showChat() {
    if (!isMobile()) return;
    manualListView = false;
    document.body.classList.add("conversation-mobile-chat-open");
    ensureBackButton();
  }

  function ensureBackButton() {
    if (!isMobile() || !chatEl) return;
    const header = chatEl.querySelector(".chat-header");
    if (!header || header.querySelector("[data-mobile-back]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-back-button";
    button.dataset.mobileBack = "true";
    button.setAttribute("aria-label", "Voltar para a lista de conversas");
    button.textContent = "← Conversas";
    button.addEventListener("click", () => showList({ manual: true }));
    header.insertBefore(button, header.firstChild);
  }

  listEl?.addEventListener("click", (event) => {
    if (!event.target.closest(".conversation-item")) return;
    showChat();
  });

  const observer = chatEl ? new MutationObserver(() => {
    ensureBackButton();
    if (!manualListView && isMobile() && chatEl.querySelector(".chat-header")) showChat();
  }) : null;

  observer?.observe(chatEl, { childList: true, subtree: true });

  const handleMediaChange = () => {
    if (!isMobile()) {
      document.body.classList.remove("conversation-mobile-chat-open");
      return;
    }
    if (!chatEl?.querySelector(".chat-header")) showList({ manual: false });
    else ensureBackButton();
  };

  if (typeof mobileMedia?.addEventListener === "function") mobileMedia.addEventListener("change", handleMediaChange);
  else if (typeof mobileMedia?.addListener === "function") mobileMedia.addListener(handleMediaChange);

  if (isMobile()) {
    const requestedConversation = new URLSearchParams(window.location.search).get("conversationId");
    if (requestedConversation && chatEl?.querySelector(".chat-header")) showChat();
    else showList({ manual: false });
  }
})();
