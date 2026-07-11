const form = document.querySelector("#loginForm");
const message = document.querySelector("#loginMessage");
const passwordInput = document.querySelector("#passwordInput");
const togglePassword = document.querySelector("#togglePassword");

togglePassword?.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  togglePassword.textContent = showing ? "Mostrar" : "Ocultar";
  togglePassword.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  togglePassword.setAttribute("aria-pressed", String(!showing));
  passwordInput.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Validando acesso...";
  message.classList.remove("error");
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data)
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    message.textContent = payload.message || "Login invalido.";
    message.classList.add("error");
    return;
  }
  const next = new URLSearchParams(location.search).get("next") || payload.redirectTo || "/admin";
  location.assign(next);
});
