const app = document.querySelector("#insanoEventApp");
const params = new URLSearchParams(location.search);
const conversationId = params.get("conversationId") || "";
const phone = params.get("phone") || "";
const storageKey = `insano:event-builder:${conversationId || phone || "public"}`;
const whatsappUrl = "https://wa.me/5551980413745";
const state = restoreState();

state.catalog = [];
if (location.pathname === "/orcamento/insano") {
  state.step = "build";
  state.mode = "orcamento";
}

init();

async function init() {
  renderLoading();
  try {
    const response = await fetch("/api/insano/catalogo");
    const body = await response.json();
    if (!response.ok || body.ok === false) throw new Error(body.error || "catalog_unavailable");
    state.catalog = (body.items || []).map(normalizeItem).filter((item) => item.id && item.name);
  } catch {
    state.catalog = [];
  }
  render();
}

function normalizeItem(item = {}) {
  const price = Number(item.price);
  return {
    id: String(item.id || item.name || ""),
    name: String(item.name || "").trim(),
    description: String(item.description || "").trim(),
    imageUrl: safeImageUrl(item.imageUrl),
    category: String(item.category || "Comida").trim() || "Comida",
    unit: String(item.unit || "por pessoa").trim() || "por pessoa",
    price: Number.isFinite(price) && price > 0 ? price : null
  };
}

function renderLoading() {
  app.innerHTML = `<header class="event-header"><div><div class="wordmark">INSANO</div><small>Food Truck</small></div></header><section class="event-content"><p class="lead">Carregando experiência...</p></section>`;
}

function render() {
  persistState();
  if (state.step === "success") return renderSuccess();
  const content = state.step === "choose" ? chooseMarkup() : state.step === "review" ? reviewMarkup() : buildMarkup();
  app.innerHTML = `${headerMarkup()}${content}${state.step === "choose" ? "" : cartBarMarkup()}`;
  bindActions();
}

function headerMarkup() {
  return `<header class="event-header">
    ${state.step !== "choose" ? `<button class="back-button" type="button" data-back aria-label="Voltar">‹</button>` : ""}
    <div><div class="wordmark">INSANO</div><small>Food Truck</small></div>
    <button class="text-button" type="button" data-human>Atendimento</button>
  </header>`;
}

function chooseMarkup() {
  return `<section class="event-content">
    <p class="eyebrow">Escolha rápido</p><h1>O que vamos fazer?</h1>
    <p class="lead">Escolha em um toque. Os dados do evento ficam somente para o final.</p>
    <div class="choice-grid">
      ${choice("evento", "Evento completo", "Monte comida, estrutura e equipe")}
      ${choice("comida", "Comida para o evento", "Escolha produtos e quantidade")}
      ${choice("orcamento", "Orçamento rápido", "Receba uma estimativa em poucos toques")}
    </div>
  </section>`;
}

function choice(mode, title, text) {
  return `<button class="choice-card" type="button" data-mode="${mode}"><span><strong>${title}</strong>${text}</span><b>›</b></button>`;
}

function buildMarkup() {
  const categories = [...new Set(state.catalog.map((item) => item.category))];
  if (!categories.includes(state.category)) state.category = categories[0] || "";
  const visible = state.catalog.filter((item) => !state.category || item.category === state.category);
  return `<section class="event-content">
    <p class="eyebrow">Poucos toques</p><h1>Monte seu evento</h1>
    <p class="lead">Toque para adicionar. Verde significa que já entrou no orçamento.</p>
    <div class="people-control"><div><strong>Quantidade</strong><br><span>${state.mode === "evento" ? "pessoas" : "porções"}</span></div>${stepperMarkup()}</div>
    ${categories.length > 1 ? `<nav class="category-strip" aria-label="Categorias">${categories.map((category) => `<button class="category-chip ${category === state.category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</nav>` : ""}
    <div class="product-list">${visible.length ? visible.map(productMarkup).join("") : `<div class="empty-state">O catálogo real do Insano ainda não possui produtos disponíveis. Fale com a equipe para continuar.</div>`}</div>
  </section>`;
}

function stepperMarkup() {
  return `<div class="stepper"><button type="button" data-people="-10" aria-label="Diminuir">−</button><strong>${state.people}</strong><button type="button" data-people="10" aria-label="Aumentar">+</button></div>`;
}

function productMarkup(item) {
  const selected = state.selected.includes(item.id);
  return `<article class="product-card">
    ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">` : ""}
    <div class="product-body">
      <div class="product-copy"><strong>${escapeHtml(item.name)}</strong>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ""}</div>
      <div class="product-price">${item.price ? `${money(item.price)} ${escapeHtml(item.unit)}` : "Valor a confirmar"}</div>
      <button class="product-action ${selected ? "selected" : ""}" type="button" data-product="${escapeHtml(item.id)}">${selected ? "✓ Adicionado" : "Adicionar"}</button>
    </div>
  </article>`;
}

function cartBarMarkup() {
  const total = estimate();
  return `<aside class="cart-bar"><div class="cart-summary"><strong>${state.selected.length} ${state.selected.length === 1 ? "item" : "itens"}</strong><span>${total === null ? "Estimativa a confirmar" : `Estimativa ${money(total)}`}</span></div><button class="cart-button" type="button" data-review ${state.selected.length ? "" : "disabled"}>Ver orçamento</button></aside>`;
}

function reviewMarkup() {
  const items = selectedItems();
  const total = estimate();
  return `<section class="event-content">
    <p class="eyebrow">Última etapa</p><h1>Seu orçamento</h1>
    <p class="lead">Revise a escolha e informe somente os dados necessários para a equipe responder.</p>
    <div class="review-list">${items.map((item) => `<article class="review-card"><div><strong>${escapeHtml(item.name)}</strong><br><span>${state.people} ${state.mode === "evento" ? "pessoas" : "porções"}${item.price ? ` • ${money(item.price * state.people)}` : " • valor a confirmar"}</span></div><button class="remove-button" type="button" data-remove="${escapeHtml(item.id)}">Excluir</button></article>`).join("")}</div>
    <div class="estimate-box"><span>${state.people} ${state.mode === "evento" ? "pessoas" : "porções"} • ${items.length} ${items.length === 1 ? "item" : "itens"}</span><strong>${total === null ? "Estimativa a confirmar" : money(total)}</strong><small>O valor final e a disponibilidade serão confirmados pela equipe.</small></div>
    ${formMarkup()}
  </section>`;
}

function formMarkup() {
  return `<form id="requestForm" class="form-card"><div class="form-grid">
    <label>Seu nome<input name="nome" autocomplete="name" required></label>
    <label>Seu WhatsApp<input name="telefone" value="${escapeHtml(phone)}" inputmode="tel" autocomplete="tel" required></label>
    <label>Data do evento<input name="dataEvento" type="date" min="${today()}" required></label>
    <label>Cidade<input name="cidade" autocomplete="address-level2" required></label>
    <label class="full">Local ou endereço<input name="local" autocomplete="street-address" required></label>
    <label>Horário de início<input name="horarioInicio" type="time" required></label>
    <label>Horário de término<input name="horarioTermino" type="time" disabled></label>
    <label class="inline-check full"><input name="terminoADefinir" type="checkbox" checked> Horário de término a definir</label>
    <label class="full">Observação opcional<textarea name="observacoes" placeholder="Conte algum detalhe importante"></textarea></label>
  </div><button class="submit-button" type="submit">Enviar solicitação</button><p id="formStatus" class="form-status" role="status"></p></form>`;
}

function bindActions() {
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => { state.mode = button.dataset.mode; state.step = "build"; render(); }));
  document.querySelector("[data-back]")?.addEventListener("click", () => { state.step = state.step === "review" ? "build" : "choose"; render(); });
  document.querySelector("[data-human]")?.addEventListener("click", () => { location.href = `${whatsappUrl}?text=${encodeURIComponent("Quero falar com a equipe do Insano Food Truck sobre um evento.")}`; });
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.category = button.dataset.category; render(); }));
  document.querySelectorAll("[data-people]").forEach((button) => button.addEventListener("click", () => { const minimum = state.mode === "evento" ? 10 : 50; state.people = Math.min(1000, Math.max(minimum, state.people + Number(button.dataset.people))); render(); }));
  document.querySelectorAll("[data-product]").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.product; state.selected = state.selected.includes(id) ? state.selected.filter((item) => item !== id) : [...state.selected, id]; render(); }));
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => { state.selected = state.selected.filter((item) => item !== button.dataset.remove); if (!state.selected.length) state.step = "build"; render(); }));
  document.querySelector("[data-review]")?.addEventListener("click", () => { if (!state.selected.length) return; state.step = "review"; render(); scrollTo({ top: 0, behavior: "smooth" }); });
  const form = document.querySelector("#requestForm");
  form?.querySelector("[name='terminoADefinir']")?.addEventListener("change", (event) => { const end = form.querySelector("[name='horarioTermino']"); end.disabled = event.target.checked; if (event.target.checked) end.value = ""; });
  form?.addEventListener("submit", submitRequest);
}

async function submitRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector("#formStatus");
  const button = form.querySelector(".submit-button");
  const data = Object.fromEntries(new FormData(form).entries());
  const items = selectedItems();
  if (!items.length) return;
  const kind = state.mode === "evento" ? "evento" : "orcamento";
  const total = estimate();
  const selection = items.map((item) => `${item.name} — ${state.people} ${kind === "evento" ? "pessoas" : "porções"}`).join("; ");
  const notes = [`Seleção rápida: ${selection}`, total === null ? "Estimativa: a confirmar" : `Estimativa visual: ${money(total)}`, data.observacoes || ""].filter(Boolean).join("\n");
  const payload = { conversationId, submissionId: submissionId(kind), telefoneOriginal: phone, nome: data.nome, telefone: data.telefone, dataEvento: data.dataEvento, local: data.local, cidade: data.cidade, publicoPrevisto: state.people, pessoas: state.people, produto: items.map((item) => item.name).join(", "), horarioInicio: data.horarioInicio, horarioTermino: data.terminoADefinir ? "a definir" : data.horarioTermino, observacoes: notes, page: location.pathname, formType: `insano_event_builder_${kind}`, kind, source: "WhatsApp - Portal Insano - Montagem rápida de evento" };
  button.disabled = true;
  status.textContent = "Enviando para a equipe...";
  try {
    const response = await fetch(kind === "evento" ? "/api/site/insano/evento" : "/api/site/insano/orcamento", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok || body.ok === false) throw new Error(body.errors?.[0]?.error || body.error || "Não foi possível enviar.");
    state.step = "success";
    state.requestId = body.id || "";
    persistState();
    render();
  } catch (error) {
    button.disabled = false;
    status.textContent = error.message || "Não foi possível enviar. Tente novamente.";
  }
}

function renderSuccess() {
  app.innerHTML = `${headerMarkup()}<section class="event-content success"><div class="success-mark">✓</div><p class="eyebrow">Recebemos</p><h1>Solicitação enviada</h1><p class="lead">A equipe vai confirmar disponibilidade e valor final na mesma conversa do WhatsApp.</p><a class="whatsapp-link" href="${whatsappUrl}?text=${encodeURIComponent("Enviei minha solicitação de evento pelo Insano.")}">Voltar ao WhatsApp</a></section>`;
  bindActions();
}

function selectedItems() { return state.selected.map((id) => state.catalog.find((item) => item.id === id)).filter(Boolean); }
function estimate() { const items = selectedItems(); return !items.length || items.some((item) => !item.price) ? null : items.reduce((sum, item) => sum + item.price * state.people, 0); }
function money(value) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }
function today() { return new Date().toISOString().slice(0, 10); }
function submissionId(kind) { const key = `insano:event-builder:submission:${kind}:${conversationId || phone || "public"}`; let value = sessionStorage.getItem(key); if (!value) { value = `${kind}_builder_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; sessionStorage.setItem(key, value); } return value; }
function persistState() { sessionStorage.setItem(storageKey, JSON.stringify({ step: state.step, mode: state.mode, category: state.category, people: state.people, selected: state.selected, requestId: state.requestId || "" })); }
function restoreState() { try { const value = JSON.parse(sessionStorage.getItem(storageKey) || "{}"); return { step: value.step || "choose", mode: value.mode || "evento", category: value.category || "", people: Number(value.people) || 50, selected: Array.isArray(value.selected) ? value.selected : [], requestId: value.requestId || "" }; } catch { return { step: "choose", mode: "evento", category: "", people: 50, selected: [] }; } }
function safeImageUrl(value = "") { try { const url = new URL(String(value)); return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""; } catch { return ""; } }
function escapeHtml(value = "") { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
