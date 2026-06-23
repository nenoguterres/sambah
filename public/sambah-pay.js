const state = { role: localStorage.getItem("sambahEcoRole") || "ADMIN" };
const $ = (selector) => document.querySelector(selector);

function bindRole() {
  const select = $("#ecoRole");
  if (!select) return;
  select.value = state.role;
  select.addEventListener("change", () => {
    state.role = select.value;
    localStorage.setItem("sambahEcoRole", state.role);
    load();
  });
}

function headers() { return { "x-sambah-role": state.role }; }

async function getJson(path) {
  const response = await fetch(path, { headers: headers() });
  return response.json();
}

async function postJson(path, body = {}) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify(body) });
  return response.json();
}

function esc(value = "") {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function row(title, item) {
  return `<article class="eco-table-card"><header><strong>${esc(title)}</strong><small>${esc(item.status || item.type || item.created_at || "")}</small></header><pre class="eco-pre">${esc(JSON.stringify(item, null, 2))}</pre></article>`;
}

function kpi(label, value) {
  return `<article class="eco-kpi"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function notice(selector, message, error = false) {
  const element = $(selector);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", Boolean(error));
}

function formatDate(value) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function suggestionRow(item = {}) {
  const title = item.titulo || item.title || item.tipo || item.type || item.id || "Sugestão do Pérola";
  const status = item.status || "recebida";
  return `<article class="eco-bridge-row"><strong>${esc(title)}</strong><span class="eco-status">${esc(status)}</span><time datetime="${esc(item.registradoEm || item.createdAt || "")}">${esc(formatDate(item.registradoEm || item.createdAt))}</time></article>`;
}

async function bootstrap(selector) {
  const result = await postJson("/api/sambah-pay/demo/bootstrap");
  notice(selector, result.ok ? `Demo operacional pronta: ${(result.created || []).join(", ")}` : (result.message || result.error), !result.ok);
  await load();
}

document.addEventListener("DOMContentLoaded", () => {
  bindRole();
  $("#bootstrapDemo")?.addEventListener("click", () => bootstrap("#payNotice"));
  load();
});

async function load() {
  try {
    const [ecosystem, suggestions] = await Promise.all([getJson("/api/sambah-pay/ecosystem/status"), getJson("/api/pay-perola/suggestions")]);
    $("#kpis").innerHTML = [kpi("Pagamentos", ecosystem.totals?.payments), kpi("Wallets", ecosystem.totals?.wallets), kpi("Devices", ecosystem.totals?.devices), kpi("Alertas", ecosystem.totals?.alerts)].join("");
    $("#perolaSuggestionsList").innerHTML = suggestions.items?.length ? suggestions.items.slice(0, 8).map(suggestionRow).join("") : '<p class="eco-muted">Nenhuma sugestão recebida do Pérola.</p>';
    $("#paymentsList").innerHTML = (ecosystem.samples?.payments?.length ? ecosystem.samples.payments.map((item) => row(item.id, item)) : ['<p class="eco-muted">Sem pagamentos. Prepare a demo operacional.</p>']).join("");
    $("#walletsList").innerHTML = (ecosystem.samples?.wallets?.length ? ecosystem.samples.wallets.map((item) => row(item.customer_id, item)) : ['<p class="eco-muted">Sem wallets.</p>']).join("");
    $("#opsList").innerHTML = [...(ecosystem.samples?.devices || []), ...(ecosystem.samples?.autoserve_sessions || []), ...(ecosystem.samples?.alerts || [])].map((item) => row(item.name || item.id, item)).join("") || '<p class="eco-muted">Sem operação simulada.</p>';
    $("#auditList").innerHTML = (ecosystem.samples?.audit?.length ? ecosystem.samples.audit.map((item) => row(item.type, item)) : ['<p class="eco-muted">Sem auditoria SamBah.</p>']).join("");
    notice("#payNotice", "SamBah Pay sincronizado.");
  } catch {
    notice("#payNotice", "Não foi possível atualizar o painel agora.", true);
  }
}
