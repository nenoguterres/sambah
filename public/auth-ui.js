document.addEventListener("DOMContentLoaded", initAuthUi);

async function initAuthUi() {
  const result = await authMe();
  if (result.ok && result.user) {
    document.querySelectorAll("[data-auth-user]").forEach((node) => {
      node.textContent = result.user.displayName || result.user.username;
    });
    document.querySelectorAll("[data-auth-role]").forEach((node) => {
      node.textContent = result.user.role;
    });
  }
  document.querySelectorAll("[data-auth-logout]").forEach((button) => {
    button.addEventListener("click", logout);
  });
}

async function authMe() {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) {
    location.assign("/login?next=" + encodeURIComponent(location.pathname));
    return { ok: false };
  }
  return response.json();
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  location.assign("/login");
}
