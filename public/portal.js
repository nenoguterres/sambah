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
  bindForm("orderForm", async (data, formElement) => {
    const isTable = mode === "mesa";
    const body = await postWithFallback("/api/site/precomanda", portalPayload({
      operation: "Insano",
      type: isTable ? "mesa" : mode,
      pipeline: isTable ? "mesa" : "pedido_rapido",
      customerName: data.nome,
      nome: data.nome,
      phone: data.telefone,
      whatsapp: data.telefone,
      mesa: data.mesa,
      notes: data.observacao,
      observacoes: data.observacao,
      endereco: data.endereco || "",
      horario: data.retirada || "",
      formaPagamento: data.pagamento || "a combinar",
      items: parseItems(data.produtos),
      customer: { name: data.nome, phone: data.telefone, serviceType: isTable ? "mesa" : mode, paymentMethod: data.pagamento || "a combinar" },
      status: "novo"
    }));
    showResult(body, "Pedido recebido pelo SamBah.", { data, mode, isTable, formElement });
  });
}

function renderOrderEvent() {
  app.innerHTML = `
    ${hero("Grande Pedido", "Conta pra gente.")}
    ${form("eventOrderForm", `${row(input("nome", "Nome"), input("telefone", "Telefone"))}${row(input("data", "Data"), input("pessoas", "Quantidade de pessoas"))}${textarea("observacao", "Observacao")}`, "Enviar")}
  `;
  bindForm("eventOrderForm", async (data, formElement) => {
    const body = await postWithFallback("/api/site/orcamento-evento", portalPayload({
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
    showResult(body, "Recebido.", { data, mode: "evento", formElement });
  });
}

function renderEvents() {
  app.innerHTML = `
    ${hero("Tenho um Evento", "Que tipo de evento?")}
    ${form("eventForm", `${select("tipoEvento", ["Aniversario", "Confraternizacao", "Casamento", "Churrasco", "Outro"])}${row(input("nome", "Nome"), input("telefone", "Telefone"))}${row(input("data", "Data"), input("local", "Cidade/bairro"))}${input("pessoas", "Quantidade de pessoas")}${textarea("observacao", "Observacao")}`, "Enviar evento")}
  `;
  bindForm("eventForm", async (data, formElement) => {
    const body = await postWithFallback("/api/site/orcamento-evento", portalPayload({
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
    showResult(body, "Evento recebido.", { data, mode: "evento", formElement });
  });
}

function renderCompanies() {
  app.innerHTML = `
    ${hero("Sou Empresa", "O que sua empresa precisa?")}
    ${form("companyForm", `${select("tipo", ["Coffee break", "Churrasco corporativo", "Feira / Ativacao", "Evento interno", "Outro"])}${row(input("nome", "Nome"), input("empresa", "Empresa"))}${row(input("telefone", "Telefone"), input("email", "E-mail"))}${row(input("data", "Data"), input("pessoas", "Quantidade de pessoas"))}${textarea("observacao", "Observacao")}`, "Enviar")}
  `;
  bindForm("companyForm", async (data, formElement) => {
    const body = await postWithFallback("/api/site/insano/evento", portalPayload({
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
    showResult(body, "Empresa recebida.", { data, mode: "empresa", formElement });
  });
}

function renderXeriffe() {
  const options = ["Reservar mesa", "Fazer festa", "Ver cardapio", "Falar no WhatsApp"];
  app.innerHTML = `
    ${hero("Conhecer o Xeriffe", "O que voce procura?")}
    ${form("xeriffeForm", `${select("tipo", options)}${row(input("nome", "Nome"), input("telefone", "Telefone"))}${textarea("observacao", "Observacao")}`, "Enviar")}
  `;
  bindForm("xeriffeForm", async (data, formElement) => {
    if (data.tipo === "Ver cardapio") {
      location.href = "/cardapio/xeriffe";
      return;
    }
    const body = await postWithFallback(data.tipo === "Fazer festa" ? "/api/site/orcamento-evento" : "/api/site/lead", portalPayload({
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
    showResult(body, "Recebido.", { data, mode: data.tipo, formElement });
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
      const body = await postWithFallback("/api/site/whatsapp", portalPayload({
        operation: topic === "Xeriffe" ? "Buteco Xeriffe" : "Insano",
        type: "whatsapp",
        pipeline: "atendimento_whatsapp",
        notes: topic,
        message: `Quero falar sobre: ${topic}`
      }));
      showResult(body, "WhatsApp preparado.", { data: { nome: "Cliente", observacao: topic }, mode: topic });
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
  return `<section class="form-box" data-form-shell="${id}"><form id="${id}">${fields}<button type="submit">${label}</button><p id="portalResult" class="result" aria-live="polite"></p></form></section>`;
}

function bindForm(id, handler) {
  document.querySelector(`#${id}`).addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const result = document.querySelector("#portalResult");
    const submitButton = formElement.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    result.textContent = "Enviando seu pedido...";
    const data = Object.fromEntries(new FormData(formElement).entries());
    if (formElement.querySelector('[name="telefone"]') && !String(data.telefone || '').trim()) {
      result.textContent = "Informe seu telefone para continuar o atendimento.";
      if (submitButton) submitButton.disabled = false;
      return;
    }
    if (formElement.querySelector('[name="nome"]') && !String(data.nome || '').trim()) {
      result.textContent = "Informe seu nome para continuar o atendimento.";
      if (submitButton) submitButton.disabled = false;
      return;
    }
    if (formElement.id === "orderForm" && formElement.querySelector('[name="mesa"]') && !String(data.mesa || '').trim()) {
      result.textContent = "Informe a mesa para continuar o atendimento.";
      if (submitButton) submitButton.disabled = false;
      return;
    }
    try {
      await handler(data, formElement);
    } catch (error) {
      console.error("[portal] falha ao enviar", error);
      const whatsappMessage = buildFallbackWhatsappMessage(data);
      replaceFormWithResult(formElement, renderFallbackCard(whatsappMessage, fallbackWhatsappUrl(whatsappMessage)));
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

async function postWithFallback(path, payload) {
  try {
    return await post(path, payload);
  } catch (error) {
    console.warn("[portal] API indisponivel, usando fallback WhatsApp", error);
    const whatsappMessage = buildFallbackWhatsappMessage(payload);
    return {
      ok: true,
      id: "pendente_whatsapp",
      status: "aguardando confirmação da equipe",
      whatsappMessage,
      whatsappUrl: fallbackWhatsappUrl(whatsappMessage),
      confirmation: {
        title: "SamBah recebeu seu atendimento",
        text: "Seu pedido ou solicitação foi organizado. Vamos abrir o WhatsApp com os dados preparados para nossa equipe continuar seu atendimento.",
        status: "aguardando confirmação da equipe"
      },
      fallback: true
    };
  }
}

async function post(path, payload) {
  if (typeof window.fetch === "function") {
    const response = await window.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok || body.ok === false) {
      throw new Error(body.error || `Falha ao enviar: ${response.status}`);
    }
    return body;
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
        const body = JSON.parse(xhr.responseText || "{}");
        if (xhr.status < 200 || xhr.status >= 300 || body.ok === false) {
          reject(new Error(body.error || `Falha ao enviar: ${xhr.status}`));
          return;
        }
        resolve(body);
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("Erro de conexao"));
    xhr.send(JSON.stringify(payload));
  });
}

function showResult(body, message, context = {}) {
  const result = document.querySelector("#portalResult");
  const id = body.pedidoId || body.id || "";
  const data = context.data || {};
  const mode = context.mode || data.tipo || body.type || "";
  const items = data.produtos || body.precomanda?.items?.map((item) => `${item.quantity || item.quantidade || 1}x ${item.name || item.nome}`).join("; ") || "";
  const html = body.fallback
    ? renderFallbackCard(body.whatsappMessage, body.whatsappUrl)
    : renderConfirmationCard({ body, id, data, mode, items, isTable: context.isTable });
  if (context.formElement) {
    replaceFormWithResult(context.formElement, html);
  } else if (result) {
    result.innerHTML = html;
  }
}

function renderConfirmationCard({ body, id, data, mode, items, isTable }) {
  return `
    <section class="portal-confirmation" role="status">
      <h2>${escapeHtml(body.confirmation?.title || "✅ Pedido recebido pelo SamBah")}</h2>
      <p>${escapeHtml(body.confirmation?.text || "Seu atendimento foi iniciado. Organizamos seu pedido e já deixamos tudo pronto para nossa equipe continuar.")}</p>
      <div class="confirmation-summary">
        ${id ? `<div><span>Número do pedido</span><strong>${escapeHtml(id)}</strong></div>` : ""}
        ${data.nome ? `<div><span>Nome</span><strong>${escapeHtml(data.nome)}</strong></div>` : ""}
        ${data.telefone ? `<div><span>Telefone</span><strong>${escapeHtml(data.telefone)}</strong></div>` : ""}
        ${mode ? `<div><span>Tipo de atendimento</span><strong>${escapeHtml(modeLabel(mode))}</strong></div>` : ""}
        ${isTable && data.mesa ? `<div><span>Mesa</span><strong>${escapeHtml(data.mesa)}</strong></div>` : ""}
        ${data.retirada ? `<div><span>Horário de retirada</span><strong>${escapeHtml(data.retirada)}</strong></div>` : ""}
        ${data.endereco ? `<div><span>Endereço ou bairro</span><strong>${escapeHtml(data.endereco)}</strong></div>` : ""}
        ${items ? `<div><span>Itens</span><strong>${escapeHtml(String(items).slice(0, 240))}</strong></div>` : ""}
        ${data.observacao ? `<div><span>Observação</span><strong>${escapeHtml(data.observacao)}</strong></div>` : ""}
        <div><span>Status</span><strong>aguardando confirmação da equipe</strong></div>
      </div>
      <div class="confirm-actions">
        ${body.whatsappUrl ? `<a class="whatsapp-action-button" href="${escapeHtml(body.whatsappUrl)}" data-whatsapp-url>Continuar atendimento no WhatsApp</a>` : ""}
        ${body.statusUrl ? `<a class="status-action-button" href="${escapeHtml(body.statusUrl)}">Acompanhar pedido</a>` : ""}
        <a class="back-button" href="/">Voltar ao início</a>
      </div>
      <small>O WhatsApp abre com a mensagem pronta. Envio e resposta automática dependem da API oficial do WhatsApp Business.</small>
    </section>
  `;
}

function renderFallbackCard(message, whatsappUrl) {
  return `
    <section class="portal-confirmation portal-confirmation-warning" role="alert">
      <h2>⚠️ Não conseguimos registrar agora</h2>
      <p>Mas seu pedido foi organizado pelo SamBah. Vamos abrir o WhatsApp para nossa equipe continuar seu atendimento.</p>
      <div class="confirmation-summary">
        <div><span>Status</span><strong>aguardando atendimento pelo WhatsApp</strong></div>
      </div>
      <div class="confirm-actions">
        <a class="whatsapp-action-button" href="${escapeHtml(whatsappUrl)}" data-whatsapp-url>Continuar no WhatsApp</a>
      </div>
      <small>${escapeHtml(message || "Mensagem preparada pelo SamBah.")}</small>
    </section>
  `;
}

function replaceFormWithResult(formElement, html) {
  const shell = formElement.closest(".form-box");
  if (shell) {
    shell.innerHTML = html;
    return;
  }
  formElement.innerHTML = html;
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
  return {
    delivery: "Delivery",
    retirar: "Retirar",
    mesa: "Estou no local",
    evento: "Preciso de Food Truck",
    empresa: "Evento Corporativo",
    Pedido: "Pedido",
    Evento: "Evento",
    Empresa: "Empresa",
    Xeriffe: "Xeriffe"
  }[mode] || mode || "Atendimento";
}

function buildFallbackWhatsappMessage(payload = {}) {
  const operation = payload.operation === "Buteco Xeriffe" ? "Xeriffe" : "Insano";
  const nome = payload.nome || payload.customerName || (payload.customer && payload.customer.name) || "Cliente";
  const telefone = payload.whatsapp || payload.phone || payload.telefone || (payload.customer && payload.customer.phone) || "";
  const tipo = modeLabel(payload.type || payload.tipo || payload.pipeline || "Atendimento");
  const itens = Array.isArray(payload.items) ? payload.items.map((item) => String(item.quantity || item.quantidade || 1) + "x " + String(item.name || item.nome || "Item")).join("; ") : "";
  const resumo = payload.observacoes || payload.notes || payload.message || itens || "Atendimento iniciado pelo site";
  return [
    operation === "Xeriffe" ? "Olá, equipe Xeriffe!" : "Olá, equipe Insano!",
    "Sou o SamBah e organizei um novo atendimento pelo site.",
    "",
    "Atendimento:",
    "ID: pendente_whatsapp",
    "Cliente: " + nome,
    telefone ? "WhatsApp: " + telefone : "",
    "Tipo: " + tipo,
    "Detalhes: " + resumo,
    "",
    "Status: aguardando confirmação da equipe.",
    "",
    "Pode seguir com esse atendimento?"
  ].filter(Boolean).join("\n");
}

function fallbackWhatsappUrl(message) {
  return "https://wa.me/" + DEFAULT_PHONE + "?text=" + encodeURIComponent(message);
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








