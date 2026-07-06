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
const pageParams = new URLSearchParams(location.search);
const returnTo = sanitizeReturnPath(pageParams.get("returnTo"));
const whatsappContext = {
  origem: pageParams.get("origem") || "",
  origin: pageParams.get("origin") || "",
  conversationId: pageParams.get("conversationId") || "",
  sambahConversationId: pageParams.get("sambahConversationId") || "",
  phone: pageParams.get("phone") || ""
};

if (returnTo) {
  const brand = document.querySelector(".brand");
  const returnLink = document.querySelector(".return-conversation-link");
  if (brand) brand.href = returnTo;
  if (returnLink) {
    returnLink.href = returnTo;
    returnLink.hidden = false;
  }
}

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
  focusWhatsAppOrderFlow();
}

function renderInsanoEvent() {
  app.innerHTML = `
    ${hero("Evento Insano", "Orcamento corporativo direto para o CRM SamBah.")}
    <section class="panel">
      <h2>Solicitar orcamento de evento</h2>
      <form id="eventForm">
        <div class="row">
          <input name="nome" placeholder="Nome">
          <input name="telefone" placeholder="Telefone" inputmode="tel">
        </div>
        <div class="row">
          <input name="dataEvento" placeholder="Data do evento">
          <input name="local" placeholder="Local">
        </div>
        <div class="row">
          <input name="pessoas" placeholder="Numero de pessoas" inputmode="numeric">
          <input name="tipoEvento" placeholder="Tipo de evento">
        </div>
        <textarea name="observacoes" placeholder="Observacoes"></textarea>
        <button class="primary" type="submit">Solicitar orcamento</button>
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
  focusWhatsAppOrderFlow();
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
        <input name="conversationId" value="${escapeHtml(whatsappContext.conversationId)}" hidden>
        <input name="sambahConversationId" value="${escapeHtml(whatsappContext.sambahConversationId)}" hidden>
        <input name="phone" value="${escapeHtml(whatsappContext.phone)}" hidden>
        <input name="origin" value="${escapeHtml(whatsappContext.origin)}" hidden>
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
    conversationId: data.conversationId,
    sambahConversationId: data.sambahConversationId,
    phone: data.phone,
    origin: data.origin || whatsappContext.origin || "WHATSAPP_SAMBAH",
    items: parseItems(data.items),
    customer: { name: data.nome, phone: data.whatsapp, serviceType: data.mesa ? "mesa" : "retirada", paymentMethod: "a combinar" }
  };
  const isInsano = data.operation === "Insano";
  const pre = await postJson(isInsano ? "/api/site/insano/pedido" : "/api/site/precomanda", payload);
  const order = isInsano ? pre : await postJson("/api/site/pedido-rapido", { ...payload, message: data.items || data.observacoes });
  await notifySambahMesaOrder({ data, payload, order, pre });
  result.innerHTML = `Salvo no CRM. Status: ${escapeHtml(pre.status || "novo")} ${pre.whatsappUrl ? `<a href="${pre.whatsappUrl}" data-whatsapp-url>Continuar no WhatsApp</a>` : ""}`;
  form.dataset.lastOrder = order.id || "";
}

function focusWhatsAppOrderFlow() {
  if (whatsappContext.origem !== "whatsapp_sambah" && whatsappContext.origin !== "WHATSAPP_SAMBAH") return;
  const result = document.querySelector("#orderResult");
  if (result) result.textContent = "Tu chegou pela conversa do SamBah. Monta teu pedido aqui e envia.";
  document.querySelector("#orderForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function notifySambahMesaOrder({ data = {}, payload = {}, order = {}, pre = {} } = {}) {
  const conversationId = data.conversationId || whatsappContext.conversationId || whatsappContext.sambahConversationId;
  if (!conversationId) return;
  const mesaOrderId = order.id || order.pedidoId || pre.id || pre.pedidoId || "";
  if (!mesaOrderId) return;
  await postJson("/api/conversas/mesa-pedido", {
    conversationId,
    phone: data.phone || payload.phone || data.whatsapp || payload.whatsapp,
    mesaOrderId,
    customerName: data.nome || payload.nome,
    mode: data.mesa ? "local" : "retirada",
    total: payload.total || "",
    origin: "WHATSAPP_SAMBAH"
  });
}

function bindEventForm() {
  document.querySelector("#eventForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const result = document.querySelector("#eventResult");
    result.textContent = "Salvando orcamento no CRM...";
    const payload = {
      nome: data.nome,
      whatsapp: data.telefone,
      phone: data.telefone,
      data: data.dataEvento,
      date: data.dataEvento,
      local: data.local,
      location: data.local,
      quantidade_pessoas: data.pessoas,
      people: data.pessoas,
      tipo_evento: data.tipoEvento,
      eventType: data.tipoEvento,
      observacoes: data.observacoes,
      message: data.observacoes,
      page: location.pathname,
      pipeline: "orcamento_corporativo"
    };
    const body = await postJson("/api/site/insano/evento", payload);
    result.innerHTML = `Orcamento salvo no CRM. ${body.whatsappUrl ? `<a href="${body.whatsappUrl}" data-whatsapp-url>Continuar no WhatsApp</a>` : ""}`;
    form.reset();
  });
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

function sanitizeReturnPath(value = "") {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  if (path.includes("\\") || path.includes("\n") || path.includes("\r")) return "";
  return path;
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
