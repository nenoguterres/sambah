(() => {
  const MOBILE_BREAKPOINT_PX = 820;
  const mobileQuery = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
  const isMobile = typeof window.matchMedia === "function"
    ? window.matchMedia(mobileQuery).matches
    : window.innerWidth <= MOBILE_BREAKPOINT_PX;

  if (isMobile) return;
  if (typeof window.renderSambahShell !== "function") return;

  window.renderSambahShell("atendimento");
})();
