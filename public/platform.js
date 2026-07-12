const PRODUCTS = {
  insano: ["Hamburgueria", "PanBagnat / Hot dog / Pancho", "Pizzaria", "Churrascaria", "Eventos executivos"],
  xeriffe: ["Pedido rapido Buteco Xeriffe", "Festa Xeriffe", "Porcoes", "Bebidas", "Evento"]
};

const OPERATION = {
  insano: "Insano",
  xeriffe: "Buteco Xeriffe"
};

const STATUS = ["novo", "em preparo", "pronto", "entregue", "cancelado"];
const route = parseRoute(location.pathname);
const page = route.page;
const operation = route.operation;
const table = route.table;
const app = document.querySelector("#app");
const INSANO_WHATSAPP_URL = "https://wa.me/5551980413745";

render();

function render() {
  if (page === "cardapio") return renderMenu(operation);
  if (page === "evento") return renderInsanoEvent();
  if (page === "mesa") return renderTable(operation, table);
  if (page === "qrcodes") return renderQrcodes();
  if (page === "garcom") return renderWaiter();
  if (page === "cozinha") return renderKitchen();
}

function parseRoute(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "cardapio") return { page: "cardapio", operation: parts[1] || "insano", table: "" };
  if (parts[0] === "evento" && parts[1] === "insano") return { page: "evento", operation: "insano", table: "" };
  if (parts[0] === "mesa") return { page: "mesa", operation: parts[1] || "insano", table: parts[2] || "" };
  if (path === "/admin/qrcodes") return { page: "qrcodes", operation: "", table: "" };
  if (path === "/garcom") return { page: "garcom", operation: "", table: "" };
  if (path === "/cozinha") return { page: "cozinha", operation: "", table: "" };
  return { page: "cardapio", operation: "insano", table: "" };
}

function renderMenu(op) {
  const title = OPERATION[op] || "SamBah";
  app.innerHTML = `
    ${hero(`Cardapio ${title}`, "Pedido rapido, orcamento de evento e WhatsApp conectado ao CRM.")}
    <section class="grid">${productsFor(op).map((name) => productCard(name, op)).join("")}</section>
    ${op === "insano" ? insanoActions() : ""}
    ${orderPanel({ operation: title, source: `cardapio_${op}` })}
  `;
  bindOrderForm();
}

function renderInsanoEvent() {
  const params = new URLSearchParams(location.search);
  const phone = params.get("phone") || "";
  const conversationId = params.get("conversationId") || "";
  const submissionId = eventSubmissionId(conversationId, phone);
  if (localStorage.getItem(`insano:event-submitted:${submissionId}`)) {
    app.innerHTML = eventSuccessMarkup();
    return;
  }
  app.innerHTML = `
    ${eventHero("Evento - Insano Food Truck", "Preenche os dados do teu evento para nossa equipe verificar a agenda e preparar o atendimento.")}
    <section class="panel">
      <h2>Solicitacao de evento</h2>
      <p class="muted">Preenche as informacoes abaixo. Nossa equipe vai verificar a agenda e responder nesta mesma conversa do WhatsApp.</p>
      <form id="eventForm">
        <input name="conversationId" value="${escapeHtml(conversationId)}" hidden>
        <input name="submissionId" value="${escapeHtml(submissionId)}" hidden>
        <input name="telefoneOriginal" value="${escapeHtml(phone)}" hidden>
        <div class="row">
          <label>Nome do contato<input name="nome" placeholder="Nome do contato" required></label>
          <label>Telefone de contato<input name="telefone" value="${escapeHtml(phone)}" placeholder="Telefone de contato" inputmode="tel" required></label>
        </div>
        <div class="row">
          <label>Data do evento<input name="dataEvento" type="date" min="${escapeHtml(todayDateInput())}" required></label>
          <label>Publico previsto<input name="pessoas" type="number" min="1" step="1" placeholder="Apenas numero" inputmode="numeric" required></label>
        </div>
        <div class="row">
          <label>Local ou endereco<input name="local" placeholder="Local ou endereco" required></label>
          <label>Cidade<input name="cidade" placeholder="Cidade" required></label>
        </div>
        <div class="row">
          <label>Horario de inicio<input name="horarioInicio" type="time" required></label>
          <label>Horario de termino<input name="horarioTermino" type="time"></label>
        </div>
        <label class="inline-check"><input name="terminoADefinir" type="checkbox" value="sim"> A definir</label>
        <label>Duvidas ou observacoes
          <textarea name="observacoes" placeholder="Conta pra gente o que tu precisa saber ou deseja incluir na proposta."></textarea>
        </label>
        <div id="eventReview" class="review-box" hidden></div>
        <div class="action-row">
          <button class="primary" type="submit" data-event-action="review">Conferir dados</button>
          <button class="primary" type="button" data-event-action="send" hidden>ENVIAR PARA ANALISE</button>
          <button type="button" data-event-action="edit" hidden>CORRIGIR DADOS</button>
          <a class="wa-link" href="${whatsappLink("Voltar ao Insano Food Truck")}" data-whatsapp-url>Voltar ao WhatsApp</a>
          <a class="wa-link" href="${whatsappLink("Atendimento Humano Insano Food Truck")}" data-whatsapp-url>Atendimento Humano</a>
        </div>
        <p id="eventResult" class="result" role="status"></p>
      </form>
    </section>
  `;
  bindEventForm();
}

function insanoActions() {
  const wa = "https://wa.me/5551980413745?text=Buenas%2C%20SamBah!%0AQuero%20fazer%20um%20pedido%20ou%20orcamento%20pelo%20Insano.";
  return `
    <section class="panel action-row">
      <a class="wa-link" href="#orderForm">Pedido rapido</a>
      <a class="wa-link" href="/evento/insano">Solicitar orcamento de evento</a>
      <a class="wa-link" href="${wa}" data-whatsapp-url>Botao WhatsApp externo</a>
    </section>
  `;
}

function renderTable(op, number) {
  const title = OPERATION[op] || "SamBah";
  app.innerHTML = `
    ${hero(`Mesa ${number} - ${title}`, "O QR Code identifica a mesa e cria pre-comanda no CRM.")}
    <section class="grid">${productsFor(op).map((name) => productCard(name, op)).join("")}</section>
    ${orderPanel({ operation: title, source: `mesa_${op}`, table: number })}
  `;
  bindOrderForm();
}

function renderQrcodes() {
  const links = ["insano", "xeriffe"].flatMap((op) => Array.from({ length: 10 }, (_, index) => ({
    label: `${OPERATION[op]} mesa ${index + 1}`,
    href: `/mesa/${op}/${index + 1}`
  })));
  app.innerHTML = `
    ${hero("QR Codes de mesa", "Links prontos para virar QR Code.")}
    <section class="grid">${links.map((item) => `<article class="card"><strong>${escapeHtml(item.label)}</strong><a href="${item.href}">${item.href}</a></article>`).join("")}</section>
  `;
}

function renderWaiter() {
  app.innerHTML = `
    ${hero("Garcom mobile", "Lancamento rapido de pre-comanda por operacao e mesa.")}
    ${orderPanel({ operation: "Insano", source: "garcom", waiter: true })}
  `;
  bindOrderForm();
}

async function renderKitchen() {
  app.innerHTML = `${hero("Cozinha", "Pre-comandas e pedidos com status operacional.")}<section class="panel"><div id="kitchenList" class="status-list">Carregando...</div></section>`;
  await loadKitchen();
}

function hero(title, subtitle) {
  return `<section class="hero"><div><p>SamBah operacional</p><h1>${escapeHtml(title)}</h1><span>${escapeHtml(subtitle)}</span></div><a class="wa-link" href="/crm">Abrir CRM</a></section>`;
}

function eventHero(title, subtitle) {
  return `<section class="hero public-event-hero"><div><p>Insano Food Truck</p><h1>${escapeHtml(title)}</h1><span>${escapeHtml(subtitle)}</span></div></section>`;
}

function productCard(name, op) {
  return `<article class="card"><strong>${escapeHtml(name)}</strong><span class="muted">${escapeHtml(OPERATION[op] || "SamBah")}</span><button type="button" data-product="${escapeHtml(name)}">Adicionar ao pedido</button></article>`;
}

function orderPanel({ operation, source, table: tableNumber = "", waiter = false }) {
  return `
    <section class="panel">
      <h2>Enviar pedido</h2>
      <form id="orderForm">
        <div class="row">
          ${waiter ? `<select name="operation"><option>Insano</option><option>Buteco Xeriffe</option></select>` : `<input name="operation" value="${escapeHtml(operation)}" readonly>`}
          <input name="mesa" value="${escapeHtml(tableNumber)}" placeholder="Mesa">
        </div>
        <div class="row">
          <input name="nome" placeholder="Nome">
          <input name="whatsapp" placeholder="WhatsApp" inputmode="tel">
        </div>
        <textarea name="items" placeholder="Itens do pedido"></textarea>
        <textarea name="observacoes" placeholder="Observacoes"></textarea>
        <input name="source" value="${escapeHtml(source)}" hidden>
        <button class="primary" type="submit">Enviar pedido</button>
        <p id="orderResult" class="result" role="status"></p>
      </form>
    </section>
  `;
}

function bindOrderForm() {
  document.querySelectorAll("[data-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = document.querySelector("[name='items']");
      field.value = `${field.value}${field.value ? "\n" : ""}1x ${button.dataset.product}`;
    });
  });
  document.querySelector("#orderForm").addEventListener("submit", submitOrder);
}

async function submitOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const result = document.querySelector("#orderResult");
  result.textContent = "Salvando no CRM...";
  const payload = {
    operation: data.operation,
    operacao: data.operation,
    source: data.operation === "Insano" ? "insanofoodtruck.com.br" : data.source,
    channel: "site",
    page: location.pathname,
    tipo: "pedido",
    nome: data.nome,
    whatsapp: data.whatsapp,
    mesa: data.mesa,
    observacoes: data.observacoes,
    items: parseItems(data.items),
    customer: { name: data.nome, phone: data.whatsapp, serviceType: data.mesa ? "mesa" : "retirada", paymentMethod: "a combinar" }
  };
  const isInsano = data.operation === "Insano";
  const pre = await postJson(isInsano ? "/api/site/insano/pedido" : "/api/site/precomanda", payload);
  const order = isInsano ? pre : await postJson("/api/site/pedido-rapido", { ...payload, message: data.items || data.observacoes });
  result.innerHTML = `Salvo no CRM. Status: ${escapeHtml(pre.status || "novo")} ${pre.whatsappUrl ? `<a href="${pre.whatsappUrl}" data-whatsapp-url>Continuar no WhatsApp</a>` : ""}`;
  form.dataset.lastOrder = order.id || "";
}

function bindEventForm() {
  const form = document.querySelector("#eventForm");
  const review = document.querySelector("#eventReview");
  const submitButton = form.querySelector("[data-event-action='review']");
  const sendButton = form.querySelector("[data-event-action='send']");
  const editButton = form.querySelector("[data-event-action='edit']");
  form.querySelector("[name='terminoADefinir']")?.addEventListener("change", (event) => {
    const endInput = form.querySelector("[name='horarioTermino']");
    endInput.disabled = event.target.checked;
    if (event.target.checked) endInput.value = "";
  });
  editButton.addEventListener("click", () => {
    review.hidden = true;
    sendButton.hidden = true;
    editButton.hidden = true;
    submitButton.hidden = false;
    form.querySelectorAll("input, textarea").forEach((field) => {
      if (field.name !== "conversationId") field.disabled = false;
    });
  });
  sendButton.addEventListener("click", () => submitEventRequest(form));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const validation = validateEventFormData(data);
    if (!validation.ok) {
      document.querySelector("#eventResult").textContent = validation.message;
      return;
    }
    review.hidden = false;
    review.innerHTML = buildEventReview(data);
    submitButton.hidden = true;
    sendButton.hidden = false;
    editButton.hidden = false;
  });
}

async function submitEventRequest(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const result = document.querySelector("#eventResult");
  const validation = validateEventFormData(data);
  if (!validation.ok) {
    result.textContent = validation.message;
    return;
  }
  const sendButton = form.querySelector("[data-event-action='send']");
  if (sendButton.disabled) return;
  sendButton.disabled = true;
  result.textContent = "Enviando para analise...";
  const payload = {
    conversationId: data.conversationId,
    submissionId: data.submissionId,
    telefoneOriginal: data.telefoneOriginal,
    nome: data.nome,
    telefone: data.telefone,
    whatsapp: data.telefone,
    dataEvento: data.dataEvento,
    data: data.dataEvento,
    local: data.local,
    cidade: data.cidade,
    publicoPrevisto: data.pessoas,
    pessoas: data.pessoas,
    horarioInicio: data.horarioInicio,
    horarioTermino: data.terminoADefinir ? "a definir" : data.horarioTermino,
    observacoes: data.observacoes,
    page: location.pathname,
    source: "WhatsApp - Portal Insano - Insano Food Truck - Evento"
  };
  const body = await postJson("/api/site/insano/evento", payload);
  if (!body.ok) {
    sendButton.disabled = false;
    result.textContent = body.error || "Nao foi possivel enviar a solicitacao.";
    return;
  }
  localStorage.setItem(`insano:event-submitted:${data.submissionId}`, body.id || "sent");
  app.innerHTML = eventSuccessMarkup();
}

function buildEventReview(data = {}) {
  const end = data.terminoADefinir ? "a definir" : data.horarioTermino;
  return `
    <h3>Confere os dados do teu evento:</h3>
    <p>Nome: ${escapeHtml(data.nome)}</p>
    <p>Data: ${escapeHtml(data.dataEvento)}</p>
    <p>Local: ${escapeHtml(data.local)}</p>
    <p>Cidade: ${escapeHtml(data.cidade)}</p>
    <p>Publico previsto: ${escapeHtml(data.pessoas)} pessoas</p>
    <p>Horario: das ${escapeHtml(data.horarioInicio)} as ${escapeHtml(end || "")}</p>
    <p>Telefone: ${escapeHtml(data.telefone)}</p>
    <p>Observacoes: ${escapeHtml(data.observacoes || "")}</p>
  `;
}

function validateEventFormData(data = {}) {
  if (!data.nome?.trim()) return { ok: false, message: "Informe o nome do contato." };
  if (!data.dataEvento || data.dataEvento < todayDateInput()) return { ok: false, message: "Informe uma data valida, sem usar data anterior a hoje." };
  if (!data.local?.trim()) return { ok: false, message: "Informe o local ou endereco." };
  if (!data.cidade?.trim()) return { ok: false, message: "Informe a cidade." };
  const people = Number(data.pessoas);
  if (!Number.isInteger(people) || people <= 0) return { ok: false, message: "Informe o publico previsto como numero inteiro positivo." };
  if (!/^\d{2}:\d{2}$/.test(data.horarioInicio || "")) return { ok: false, message: "Informe o horario de inicio." };
  if (!data.terminoADefinir && !/^\d{2}:\d{2}$/.test(data.horarioTermino || "")) return { ok: false, message: "Informe o horario de termino ou marque A definir." };
  if (String(data.telefone || "").replace(/\D/g, "").length < 10) return { ok: false, message: "Informe um telefone de contato utilizavel." };
  return { ok: true };
}

function eventSuccessMarkup() {
  return `
    ${eventHero("Solicitacao enviada", "Recebemos as informacoes do teu evento.")}
    <section class="panel">
      <h2>Solicitacao enviada</h2>
      <p>Recebemos as informacoes do teu evento.</p>
      <p>Nossa equipe vai verificar a agenda e responder na mesma conversa do WhatsApp.</p>
      <div class="action-row">
        <a class="wa-link" href="${whatsappLink("Voltar ao Insano Food Truck")}" data-whatsapp-url>VOLTAR AO WHATSAPP</a>
        <a class="wa-link" href="${whatsappLink("Atendimento Humano Insano Food Truck")}" data-whatsapp-url>ATENDIMENTO HUMANO</a>
      </div>
    </section>
  `;
}

function whatsappLink(text = "") {
  return `${INSANO_WHATSAPP_URL}?text=${encodeURIComponent(text)}`;
}

function eventSubmissionId(conversationId = "", phone = "") {
  const key = `${conversationId || "sem-conversa"}:${phone || "sem-telefone"}`;
  const existing = sessionStorage.getItem(`insano:event-submission:${key}`);
  if (existing) return existing;
  const generated = `event_form_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(`insano:event-submission:${key}`, generated);
  return generated;
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

async function loadKitchen() {
  const list = document.querySelector("#kitchenList");
  const response = await fetch("/api/precomandas");
  const body = await response.json();
  const items = body.items || [];
  list.innerHTML = items.length ? items.map((item) => `
    <article class="status-item">
      <div><strong>${escapeHtml(item.nome || item.operacao || "Pre-comanda")}</strong><br><span class="muted">${escapeHtml(formatItems(item.itens || []))}</span></div>
      <select data-status-id="${escapeHtml(item.id)}">${STATUS.map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>
      <button type="button" data-save-status="${escapeHtml(item.id)}">Atualizar</button>
    </article>
  `).join("") : `<p class="muted">Nenhuma pre-comanda ainda.</p>`;
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-save-status]");
    if (!button) return;
    const id = button.dataset.saveStatus;
    const status = document.querySelector(`[data-status-id="${CSS.escape(id)}"]`).value;
    await fetch(`/api/precomandas/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    await loadKitchen();
  }, { once: true });
}

function productsFor(op) {
  return PRODUCTS[op] || PRODUCTS.insano;
}

function parseItems(text = "") {
  return String(text).split(/\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)x?\s+(.+)$/i);
    return { quantity: match ? Number(match[1]) : 1, name: match ? match[2] : line };
  });
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.json();
}

function formatItems(items = []) {
  return items.map((item) => `${item.quantidade || item.quantity || 1}x ${item.nome || item.name || ""}`).join("; ");
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function openExternalWhatsApp(url) {
  const shell = window.electron?.shell || window.electronAPI?.shell || window.SamBahElectron?.shell;
  if (shell?.openExternal) return shell.openExternal(url);
  window.open(url, "_blank", "noopener,noreferrer");
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-whatsapp-url], a[href*='wa.me']");
  if (!link) return;
  event.preventDefault();
  openExternalWhatsApp(link.href);
});
