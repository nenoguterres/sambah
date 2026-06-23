(function () {
  const ALERT_ID = "mesaFloatingAlert";

  function hideMesaFloatingAlert() {
    const existing = document.getElementById(ALERT_ID);
    if (existing) existing.hidden = true;
  }

  function renderMesaFloatingAlert(alerts) {
    const existing = document.getElementById(ALERT_ID);
    if (!Array.isArray(alerts) || alerts.length === 0) {
      hideMesaFloatingAlert();
      return null;
    }

    const button = existing || document.createElement("button");
    button.id = ALERT_ID;
    button.type = "button";
    button.className = "mesa-floating-alert";
    button.textContent = alerts.length > 1 ? `ALERTA ${alerts.length}` : "ALERTA";
    button.hidden = false;

    if (!existing) {
      button.setAttribute("aria-label", "Alerta operacional do Mesa");
      button.addEventListener("click", () => {
        console.log("Mesa ecosystem alert clicked");
      });
      document.body.appendChild(button);
    }

    return button;
  }

  window.renderMesaFloatingAlert = renderMesaFloatingAlert;
})();
