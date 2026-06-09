const app = document.querySelector("#portalApp");
const route = location.pathname;
const DEFAULT_PHONE = "5551980413745";

const flows = {
  "/pedir": renderOrder,
  "/eventos": renderEvents,
  "/empresas": renderCompanies,
  "/xeriffe": renderXeriffe,
  "/whatsapp": renderWhatsApp
};

(flows[route] || renderHome)();

function renderHome() {
  app.innerHTML = `
    <section class="portal-home" aria-label="Portal Insano">
      <img class="insano-logo" src="/assets/brand/insano-logo-home.png" alt="Insano Gastronomia Original">
      <nav class="home-actions" aria-label="Acessos principais">
        ${homeAction("/pedir", "QUERO PEDIR", "/assets/brand/actions/02-pedidos-insano-crop.png", "CapBah atendendo pedido Insano")}
        ${homeAction("/eventos", "PRECISO DE FOOD TRUCK", "/assets/brand/capbah-oficial.png", "CapBah anfitriao Insano")}
        ${homeAction("/empresas", "EVENTO CORPORATIVO", "/assets/brand/capbah-oficial.png", "CapBah atendimento corporativo")}
        ${homeAction("/xeriffe", "CONHECER O XERIFFE", "/assets/brand/actions/03-pedidos-buteco-xeriffe-crop.png", "CapBah com estrela Xeriffe Obirici", "portal-action-xeriffe")}
      </nav>
    </section>
  `;
}

function renderOrder() {
  const mode = new URLSearchParams(location.search).get("tipo") || "";
  const table = new URLSearchParams(location.search).get("mesa") || "";
  if (!mode) {
    app.innerHTML = `
      ${hero("Quero Pedir", "Como deseja ser atendido?")}
      <div class="choice-grid">
        ${link("/pedir?tipo=delivery", "Delivery")}
        ${link("/pedir?tipo=retirar", "Retirar")}
        ${link(`/pedir?tipo=mesa${table ? `&mesa=${encodeURIComponent(table)}` : ""}`, "Estou no local")}
        ${link("/pedir?tipo=evento", "Evento / Grande Pedido")}
      </div>
    `;
    return;
  }
  if (mode === "evento") return renderOrderEvent();
  const fields = mode === "delivery"
    ? `${row(input("nome", "Nome"), input("telefone", "Telefone"))}${input("endereco", "Endereco ou bairro")}${input("pagamento", "Forma de pagamento")}${textarea("produtos", "Produtos")}${textarea("observacao", "Observacao")}`
    : mode === "retirar"
      ? `${row(input("nome", "Nome"), input("telefone", "Telefone"))}${input("retirada", "Horario de retirada")}${textarea("produtos", "Produtos")}${textarea("observacao", "Observacao")}`
      : `${row(input("nome", "Nome"), input("telefone", "Telefone"))}${input("mesa", "Mesa", table)}${textarea("produtos", "Produtos")}${textarea("observacao", "Observacao")}`;
  app.innerHTML = `
    ${hero("Quero Pedir", modeLabel(mode))}
    ${form("orderForm", fields, "Enviar pedido")}
  `;
  bindForm("orderForm", async (data) => {
    const isTable = mode === "mesa";
    const body = await post("/api/site/precomanda", portalPayload({
      operation: "Insano",
      type: isTable ? "mesa" : mode,
      pipeline: isTable ? "mesa" : "pedido_rapido",
      customerName: data.nome,
      nome: data.nome,
      phone: data.telefone,
      whatsapp: data.telefone,
      mesa: data.mesa,
      notes: data.observacao,
      observacoes: [data.endereco, data.retirada, data.pagamento, data.observacao].filter(Boolean).join(" | "),
      items: parseItems(data.produtos),
      customer: { name: data.nome, phone: data.telefone, serviceType: isTable ? "mesa" : mode, paymentMethod: data.pagamento || "a combinar" },
      status: "novo"
    }));
    showResult(body, isTable ? "Pedido enviado para a cozinha." : "Pedido recebido.");
  });
}

function renderOrderEvent() {
  app.innerHTML = `
    ${hero("Grande Pedido", "Conta pra gente.")}
    ${form("eventOrderForm", `${row(input("nome", "Nome"), input("telefone", "Telefone"))}${row(input("data", "Data"), input("pessoas", "Quantidade de pessoas"))}${textarea("observacao", "Observacao")}`, "Enviar")}
  `;
  bindForm("eventOrderForm", async (data) => {
    const body = await post("/api/site/orcamento-evento", portalPayload({
      operation: "Insano",
      type: "evento",
      pipeline: "orcamento_evento",
      customerName: data.nome,
      nome: data.nome,
      phone: data.telefone,
      whatsapp: data.telefone,
      data: data.data,
      quantidade_pessoas: data.pessoas,
      notes: data.observacao,
      observacoes: data.observacao
    }));
    showResult(body, "Recebido.");
  });
}

function renderEvents() {
  app.innerHTML = `
    ${hero("Tenho um Evento", "Que tipo de evento?")}
    ${form("eventForm", `${select("tipoEvento", ["Aniversario", "Confraternizacao", "Casamento", "Churrasco", "Outro"])}${row(input("nome", "Nome"), input("telefone", "Telefone"))}${row(input("data", "Data"), input("local", "Cidade/bairro"))}${input("pessoas", "Quantidade de pessoas")}${textarea("observacao", "Observacao")}`, "Enviar evento")}
  `;
  bindForm("eventForm", async (data) => {
    const body = await post("/api/site/orcamento-evento", portalPayload({
      operation: "Insano",
      type: "evento",
      pipeline: "orcamento_evento",
      customerName: data.nome,
      nome: data.nome,
      phone: data.telefone,
      whatsapp: data.telefone,
      data: data.data,
      local: data.local,
      quantidade_pessoas: data.pessoas,
      tipo_evento: data.tipoEvento,
      notes: data.observacao,
      observacoes: data.observacao
    }));
    showResult(body, "Evento recebido.");
  });
}

function renderCompanies() {
  app.innerHTML = `
    ${hero("Sou Empresa", "O que sua empresa precisa?")}
    ${form("companyForm", `${select("tipo", ["Coffee break", "Churrasco corporativo", "Feira / Ativacao", "Evento interno", "Outro"])}${row(input("nome", "Nome"), input("empresa", "Empresa"))}${row(input("telefone", "Telefone"), input("email", "E-mail"))}${row(input("data", "Data"), input("pessoas", "Quantidade de pessoas"))}${textarea("observacao", "Observacao")}`, "Enviar")}
  `;
  bindForm("companyForm", async (data) => {
    const body = await post("/api/site/insano/evento", portalPayload({
      operation: "Insano",
      type: "empresa",
      pipeline: "orcamento_corporativo",
      customerName: data.nome,
      nome: data.nome,
      empresa: data.empresa,
      email: data.email,
      phone: data.telefone,
      whatsapp: data.telefone,
      data: data.data,
      quantidade_pessoas: data.pessoas,
      tipo_evento: data.tipo,
      notes: data.observacao,
      observacoes: data.observacao
    }));
    showResult(body, "Empresa recebida.");
  });
}

function renderXeriffe() {
  const options = ["Reservar mesa", "Fazer festa", "Ver cardapio", "Falar no WhatsApp"];
  app.innerHTML = `
    ${hero("Conhecer o Xeriffe", "O que voce procura?")}
    ${form("xeriffeForm", `${select("tipo", options)}${row(input("nome", "Nome"), input("telefone", "Telefone"))}${textarea("observacao", "Observacao")}`, "Enviar")}
  `;
  bindForm("xeriffeForm", async (data) => {
    if (data.tipo === "Ver cardapio") {
      location.href = "/cardapio/xeriffe";
      return;
    }
    const body = await post(data.tipo === "Fazer festa" ? "/api/site/orcamento-evento" : "/api/site/lead", portalPayload({
      operation: "Buteco Xeriffe",
      type: "xeriffe",
      pipeline: "festa_xeriffe",
      customerName: data.nome,
      nome: data.nome,
      phone: data.telefone,
      whatsapp: data.telefone,
      notes: `${data.tipo}: ${data.observacao || ""}`,
      observacoes: data.observacao,
      message: data.tipo
    }));
    showResult(body, "Recebido.");
    if (data.tipo === "Falar no WhatsApp" && body.whatsappUrl) openExternalWhatsApp(body.whatsappUrl);
  });
}

function renderWhatsApp() {
  app.innerHTML = `
    ${hero("Falar no WhatsApp", "Sobre o que voce quer falar?")}
    <div class="choice-grid">
      ${["Pedido", "Evento", "Empresa", "Xeriffe", "Outro"].map((item) => `<button type="button" data-whatsapp-topic="${item}">${item}</button>`).join("")}
    </div>
    <p id="portalResult" class="result"></p>
  `;
  document.querySelectorAll("[data-whatsapp-topic]").forEach((button) => {
    button.addEventListener("click", async () => {
      const topic = button.dataset.whatsappTopic;
      const body = await post("/api/site/whatsapp", portalPayload({
        operation: topic === "Xeriffe" ? "Buteco Xeriffe" : "Insano",
        type: "whatsapp",
        pipeline: "atendimento_whatsapp",
        notes: topic,
        message: `Quero falar sobre: ${topic}`
      }));
      showResult(body, "Abrindo WhatsApp.");
      if (body.whatsappUrl) openExternalWhatsApp(body.whatsappUrl);
    });
  });
}

function portalPayload(payload) {
  return {
    ...payload,
    source: "portal_insano",
    channel: "site",
    page: location.pathname,
    createdAt: new Date().toISOString()
  };
}

function hero(title, subtitle) {
  return `<section class="hero-box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></section>`;
}

function form(id, fields, label) {
  return `<section class="form-box"><form id="${id}">${fields}<button type="submit">${label}</button><p id="portalResult" class="result"></p></form></section>`;
}

function bindForm(id, handler) {
  document.querySelector(`#${id}`).addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = document.querySelector("#portalResult");
    result.textContent = "Enviando...";
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await handler(data);
      event.currentTarget.reset();
    } catch (error) {
      console.error("[portal] falha ao enviar", error);
      result.textContent = "Nao consegui enviar agora.";
    }
  });
}

async function post(path, payload) {
  if (typeof window.fetch === "function") {
    const response = await window.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.json();
  }
  return postWithXhr(path, payload);
}

function postWithXhr(path, payload) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.setRequestHeader("content-type", "application/json");
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText || "{}"));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("Erro de conexao"));
    xhr.send(JSON.stringify(payload));
  });
}

function showResult(body, message) {
  const result = document.querySelector("#portalResult");
  result.innerHTML = `${message} ${body.whatsappUrl ? `<a href="${body.whatsappUrl}" data-whatsapp-url>Continuar no WhatsApp</a>` : ""}`;
}

function homeAction(href, label, image, alt, extraClass = "") {
  return `<a class="portal-action ${extraClass}" href="${href}"><span>${label}</span><img src="${image}" alt="${alt}" loading="lazy"></a>`;
}

function link(href, label) {
  return `<a class="choice-link" href="${href}">${label}</a>`;
}

function row(...items) {
  return `<div class="row">${items.join("")}</div>`;
}

function input(name, placeholder, value = "") {
  return `<input name="${name}" placeholder="${placeholder}" value="${escapeAttr(value)}">`;
}

function textarea(name, placeholder) {
  return `<textarea name="${name}" placeholder="${placeholder}"></textarea>`;
}

function select(name, options) {
  return `<select name="${name}">${options.map((item) => `<option>${item}</option>`).join("")}</select>`;
}

function modeLabel(mode) {
  return { delivery: "Delivery", retirar: "Retirar", mesa: "Estou no local" }[mode] || "Pedido";
}

function parseItems(text = "") {
  return String(text).split(/\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)x?\s+(.+)$/i);
    return { name: match ? match[2] : line, quantity: match ? Number(match[1]) : 1 };
  });
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

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}








