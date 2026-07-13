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
  if (page === "evento") return renderInsanoRequest("evento");
  if (page === "orcamento") return renderInsanoRequest("orcamento");
  if (page === "mesa") return renderTable(operation, table);
  if (page === "qrcodes") return renderQrcodes();
  if (page === "garcom") return renderWaiter();
  if (page === "cozinha") return renderKitchen();
}

function parseRoute(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "cardapio") return { page: "cardapio", operation: parts[1] || "insano", table: "" };
  if (parts[0] === "evento" && parts[1] === "insano") return { page: "evento", operation: "insano", table: "" };
  if (parts[0] === "orcamento" && parts[1] === "insano") return { page: "orcamento", operation: "insano", table: "" };
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

function renderInsanoRequest(kind = "evento") {
  const labels = insanoRequestLabels(kind);
  const params = new URLSearchParams(location.search);
  const phone = params.get("phone") || "";
  const conversationId = params.get("conversationId") || "";
  const submissionId = insanoRequestSubmissionId(kind, conversationId, phone);
  if (localStorage.getItem(`insano:${kind}-submitted:${submissionId}`)) {
    app.innerHTML = requestSuccessMarkup(kind);
    return;
  }
  app.innerHTML = `
    ${eventHero(labels.heroTitle, labels.heroSubtitle)}
    <section class="panel">
      <h2>${escapeHtml(labels.formTitle)}</h2>
      <p class="muted">${escapeHtml(labels.formSubtitle)}</p>
      <form id="eventForm">
        <input name="conversationId" value="${escapeHtml(conversationId)}" hidden>
        <input name="submissionId" value="${escapeHtml(submissionId)}" hidden>
        <input name="requestKind" value="${escapeHtml(kind)}" hidden>
        <input name="telefoneOriginal" value="${escapeHtml(phone)}" hidden>
        <div class="row">
          <label>Nome do contato<input name="nome" placeholder="Nome do contato" required></label>
          <label>Telefone de contato<input name="telefone" value="${escapeHtml(phone)}" placeholder="Telefone de contato" inputmode="tel" required></label>
        </div>
        <div class="row">
          <label>Data do evento<input name="dataEvento" type="date" min="${escapeHtml(todayDateInput())}" required></label>
          ${requestQuantityField(kind)}
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
        <div class="action-row">
          <button class="primary" type="submit" data-event-action="send">${escapeHtml(labels.submitText)}</button>
        </div>
        <p id="eventResult" class="result" role="status"></p>
      </form>
    </section>
  `;
  bindEventForm(kind);
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

function bindEventForm(kind = "evento") {
  const form = document.querySelector("#eventForm");
  form.querySelector("[name='terminoADefinir']")?.addEventListener("change", (event) => {
    const endInput = form.querySelector("[name='horarioTermino']");
    endInput.disabled = event.target.checked;
    if (event.target.checked) endInput.value = "";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitEventRequest(form, kind);
  });
}

async function submitEventRequest(form, fallbackKind = "evento") {
  const data = Object.fromEntries(new FormData(form).entries());
  const kind = data.requestKind || fallbackKind;
  const labels = insanoRequestLabels(kind);
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
    produto: data.produto || "",
    horarioInicio: data.horarioInicio,
    horarioTermino: data.terminoADefinir ? "a definir" : data.horarioTermino,
    observacoes: data.observacoes,
    page: location.pathname,
    formType: kind,
    kind,
    source: labels.source
  };
  const body = await postJson(kind === "orcamento" ? "/api/site/insano/orcamento" : "/api/site/insano/evento", payload);
  if (!body.ok) {
    sendButton.disabled = false;
    result.textContent = body.error || "Nao foi possivel enviar a solicitacao.";
    return;
  }
  if (body.emailSend && body.emailSend.ok !== true) {
    sendButton.disabled = false;
    result.innerHTML = emailFailureMarkup();
    return;
  }
  localStorage.setItem(`insano:${kind}-submitted:${data.submissionId}`, body.id || "sent");
  app.innerHTML = requestSuccessMarkup(kind);
}

function validateEventFormData(data = {}) {
  if (!data.nome?.trim()) return { ok: false, message: "Informe o nome do contato." };
  if (!data.dataEvento || data.dataEvento < todayDateInput()) return { ok: false, message: "Informe uma data valida, sem usar data anterior a hoje." };
  if (!data.local?.trim()) return { ok: false, message: "Informe o local ou endereco." };
  if (!data.cidade?.trim()) return { ok: false, message: "Informe a cidade." };
  if (data.requestKind === "orcamento" && !data.produto?.trim()) return { ok: false, message: "Escolha o produto para o orcamento." };
  const people = Number(data.pessoas);
  if (data.requestKind === "orcamento" && (!Number.isInteger(people) || people < 50)) return { ok: false, message: "A quantidade minima para orcamento e 50 porcoes." };
  if (!Number.isInteger(people) || people <= 0) return { ok: false, message: "Informe o publico previsto como numero inteiro positivo." };
  if (!/^\d{2}:\d{2}$/.test(data.horarioInicio || "")) return { ok: false, message: "Informe o horario de inicio." };
  if (!data.terminoADefinir && !/^\d{2}:\d{2}$/.test(data.horarioTermino || "")) return { ok: false, message: "Informe o horario de termino ou marque A definir." };
  if (String(data.telefone || "").replace(/\D/g, "").length < 10) return { ok: false, message: "Informe um telefone de contato utilizavel." };
  return { ok: true };
}

function requestSuccessMarkup(kind = "evento") {
  const labels = insanoRequestLabels(kind);
  return `
    ${eventHero("Solicitacao enviada", labels.successSubtitle)}
    <section class="panel">
      <h2>Solicitacao enviada</h2>
      <p>${escapeHtml(labels.successText)}</p>
      <p>${escapeHtml(labels.nextText)}</p>
      <div class="action-row">
        <a class="wa-link" href="${whatsappLink("Voltar ao Insano Food Truck")}" data-whatsapp-url>VOLTAR AO WHATSAPP</a>
      </div>
    </section>
  `;
}

function emailFailureMarkup() {
  return `
    <span>Nao foi possivel enviar o email da solicitacao. Volta ao WhatsApp para continuar o atendimento.</span>
    <span class="action-row inline-actions">
      <a class="wa-link" href="${whatsappLink("Voltar ao Insano Food Truck")}" data-whatsapp-url>VOLTAR AO WHATSAPP</a>
    </span>
  `;
}

function whatsappLink(text = "") {
  return `${INSANO_WHATSAPP_URL}?text=${encodeURIComponent(text)}`;
}

function insanoRequestLabels(kind = "evento") {
  if (kind === "orcamento") {
    return {
      heroTitle: "Orcamento - Insano Food Truck",
      heroSubtitle: "Preenche os dados para nossa equipe preparar o orcamento e continuar o atendimento.",
      formTitle: "Solicitacao de orcamento",
      formSubtitle: "Preenche as informacoes abaixo. Nossa equipe vai preparar o orcamento e responder nesta mesma conversa do WhatsApp.",
      submitText: "ENVIAR ORCAMENTO",
      source: "WhatsApp - Portal Insano - Insano Food Truck - Orcamento",
      successSubtitle: "Recebemos as informacoes do teu orcamento.",
      successText: "Recebemos as informacoes do teu orcamento.",
      nextText: "Nossa equipe vai preparar o orcamento e responder na mesma conversa do WhatsApp."
    };
  }
  return {
    heroTitle: "Evento - Insano Food Truck",
    heroSubtitle: "Preenche os dados do teu evento para nossa equipe verificar a agenda e preparar o atendimento.",
    formTitle: "Solicitacao de evento",
    formSubtitle: "Preenche as informacoes abaixo. Nossa equipe vai verificar a agenda e responder nesta mesma conversa do WhatsApp.",
    submitText: "ENVIAR SOLICITACAO",
    source: "WhatsApp - Portal Insano - Insano Food Truck - Evento",
    successSubtitle: "Recebemos as informacoes do teu evento.",
    successText: "Recebemos as informacoes do teu evento.",
    nextText: "Nossa equipe vai verificar a agenda e responder na mesma conversa do WhatsApp."
  };
}

function requestQuantityField(kind = "evento") {
  if (kind === "orcamento") {
    return `
      <label>Produto
        <select name="produto" required>
          <option value="">Escolha o produto</option>
          <option>Hamburguer</option>
          <option>Pizzas</option>
          <option>Churrasquinho</option>
          <option>Porcoes de buteco</option>
          <option>Joelho de Porco</option>
        </select>
      </label>
      <label>Quantidade de porcoes<input name="pessoas" type="number" min="50" step="1" value="50" placeholder="Minimo 50 porcoes" inputmode="numeric" required></label>
    `;
  }
  return `<label>Publico previsto<input name="pessoas" type="number" min="1" step="1" placeholder="Apenas numero" inputmode="numeric" required></label>`;
}

function insanoRequestSubmissionId(kind = "evento", conversationId = "", phone = "") {
  const key = `${kind}:${conversationId || "sem-conversa"}:${phone || "sem-telefone"}`;
  const existing = sessionStorage.getItem(`insano:${kind}-submission:${key}`);
  if (existing) return existing;
  const prefix = kind === "orcamento" ? "quote_form" : "event_form";
  const generated = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(`insano:${kind}-submission:${key}`, generated);
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
