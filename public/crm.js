const ROUTES = {
  "/crm": { title: "Resumo CRM", endpoint: "/api/crm/resumo", type: "summary" },
  "/clientes": { title: "Clientes", endpoint: "/api/clientes", type: "clientes" },
  "/leads": { title: "Leads", endpoint: "/api/leads", type: "leads" },
  "/atendimentos": { title: "Atendimentos", endpoint: "/api/atendimentos", type: "atendimentos" },
  "/eventos": { title: "Eventos", endpoint: "/api/eventos", type: "eventos" },
  "/precomandas": { title: "Pre-comandas", endpoint: "/api/precomandas", type: "precomandas" }
};

const page = ROUTES[window.location.pathname] || ROUTES["/crm"];
const pageTitle = document.querySelector("#pageTitle");
const summary = document.querySelector("#summary");
const content = document.querySelector("#content");
const form = document.querySelector("#quickCrmForm");
const result = document.querySelector("#quickResult");
let currentFilter = "todos";
let hideCommercialTests = false;

pageTitle.textContent = page.title;
document.querySelectorAll("nav a").forEach((link) => {
  if (link.getAttribute("href") === window.location.pathname) link.classList.add("is-active");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.textContent = "Salvando atendimento...";
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch("/api/crm/atendimento", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...data, origem: "crm", canal: "site" })
  });
  const body = await response.json();
  if (!body.ok) {
    result.textContent = "Nao consegui salvar agora. Confere os dados e tenta de novo.";
    return;
  }
  result.innerHTML = `Atendimento salvo. <a href="${body.whatsappUrl}" target="_blank" rel="noopener">Continuar no WhatsApp</a>`;
  form.reset();
  await loadPage();
});

content.addEventListener("click", async (event) => {
  const commercialButton = event.target.closest("[data-commercial-action]");
  if (commercialButton) {
    commercialButton.disabled = true;
    commercialButton.textContent = "Atualizando...";
    const card = commercialButton.closest(".record-card");
    const leadId = commercialButton.dataset.leadId;
    const action = commercialButton.dataset.commercialAction;
    const payload = action === "mark-lost"
      ? { motivo_perda: card?.querySelector("[data-loss-reason]")?.value || "outro" }
      : {};
    const response = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    commercialButton.textContent = response.ok ? "Atualizado" : "Erro";
    await loadPage();
    return;
  }
  const convertButton = event.target.closest("[data-convert-lead]");
  if (convertButton) {
    convertButton.disabled = true;
    convertButton.textContent = "Convertendo...";
    const response = await fetch(`/api/crm/leads/${encodeURIComponent(convertButton.dataset.convertLead)}/convert-event`, {
      method: "POST"
    });
    const body = await response.json();
    convertButton.textContent = body.ok ? (body.duplicated ? "Evento ja existia" : "Convertido em evento") : "Nao convertido";
    await loadPage();
    return;
  }
  const statusButton = event.target.closest("[data-lead-status]");
  if (statusButton) {
    statusButton.disabled = true;
    const response = await fetch(`/api/leads/${encodeURIComponent(statusButton.dataset.leadId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: statusButton.dataset.leadStatus,
        motivo_perda: statusButton.dataset.lossReason || ""
      })
    });
    statusButton.textContent = response.ok ? "Atualizado" : "Erro";
    await loadPage();
    return;
  }
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    currentFilter = filterButton.dataset.filter;
    await loadPage();
    return;
  }
  const testToggle = event.target.closest("[data-toggle-tests]");
  if (testToggle) {
    hideCommercialTests = !hideCommercialTests;
    await loadPage();
    return;
  }
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  await navigator.clipboard.writeText(button.dataset.copy);
  button.textContent = "Copiado";
});

loadPage();

async function loadPage() {
  const response = await fetch(page.endpoint);
  const body = await response.json();
  if (page.type === "summary") {
    renderSummary(body);
    renderCommercialDashboard(body);
    return;
  }
  const resumo = await fetch("/api/crm/resumo").then((item) => item.json());
  renderSummary(resumo);
  renderCards(page.title, body.items || [], page.type);
}

function renderSummary(data) {
  const metrics = [
    ["Clientes", data.clientes],
    ["Leads", data.leads],
    ["Eventos", data.eventos],
    ["Pre-comandas", data.precomandas],
    ["Leads quentes", data.leadsQuentes],
    ["Aguardando dados", data.aguardandoDados],
    ["Orcamentos solicitados", data.orcamentosSolicitados],
    ["Orcamentos enviados", data.orcamentosEnviados],
    ["Aguardando resposta", data.aguardandoResposta],
    ["Retornos de hoje", data.retornosHoje],
    ["Fechados", data.fechados],
    ["Perdidos", data.perdidos]
  ];
  summary.innerHTML = metrics.map(([label, value]) => `
    <article class="metric">
      <span>${label}</span>
      <strong>${value ?? 0}</strong>
    </article>
  `).join("");
}

function renderCommercialDashboard(data) {
  const leads = applyFilter(data.leadsPrincipais || []);
  const dailyMoney = applyFilter(data.dinheiroDoDia || []);
  const overdueReturns = applyFilter(data.retornosVencidos || []);
  const stalledQuotes = applyFilter(data.orcamentosParados || []);
  const returns = applyFilter((data.proximosRetornos || []).filter((item) => item.nextFollowUpAt));
  const reactivation = applyFilter(data.reativacao || []);
  const insanoSite = applyFilter(data.leadsInsanoSite || []);
  content.innerHTML = `
    ${renderFilters()}
    ${renderExecutiveDashboard(data.executivo || {}, data.comercial || {}, data.clientesPorTelefone || [])}
    ${renderPanel("Leads vindos do site Insano", insanoSite, "leads", "Nenhum lead do site Insano ainda.")}
    ${renderPanel("Dinheiro do Dia", dailyMoney, "leads", "Nenhuma oportunidade prioritaria agora.")}
    ${renderPanel("Retornos Vencidos", overdueReturns, "leads", "Nenhum retorno vencido agora.")}
    ${renderPanel("Orcamentos Parados", stalledQuotes, "leads", "Nenhum orcamento parado ha mais de 24h.")}
    <section class="panel-block">
      <h2>Retornos de hoje</h2>
      ${returns.length ? returns.map((item) => renderCard(item, "leads")).join("") : `<p class="empty">Nenhum retorno vencendo hoje.</p>`}
    </section>
    <section class="panel-block">
      <h2>Oportunidades comerciais</h2>
      ${leads.length ? leads.map((item) => renderCard(item, "leads")).join("") : `<p class="empty">Nenhuma oportunidade neste filtro.</p>`}
    </section>
    <section class="panel-block">
      <h2>Reativar clientes</h2>
      ${reactivation.length ? reactivation.map((item) => renderCard(item, "leads")).join("") : `<p class="empty">Nenhum cliente para reativar agora.</p>`}
    </section>
  `;
}

function renderExecutiveDashboard(executivo = {}, comercial = {}, clientesPorTelefone = []) {
  const today = executivo.hoje || {};
  const comparison = executivo.comparativoOperacoes || [];
  const evolution = executivo.ultimos7Dias || [];
  const topOperation = comercial.operacaoQueMaisVende;
  return `
    <section class="panel-block executive-block">
      <h2>Dashboard executivo</h2>
      <div class="executive-grid">
        ${executiveMetric("Leads hoje", today.leads)}
        ${executiveMetric("Pedidos hoje", today.pedidos)}
        ${executiveMetric("Eventos hoje", today.eventos)}
        ${executiveMetric("Conversoes", today.conversoes)}
        ${executiveMetric("Receita estimada", formatCurrency(today.receitaEstimada))}
        ${executiveMetric("Receita prevista", formatCurrency(today.receitaPrevista))}
        ${executiveMetric("Receita fechada", formatCurrency(today.receitaFechada))}
        ${executiveMetric("Valor em negociacao", formatCurrency(comercial.valorEmNegociacao))}
        ${executiveMetric("Valor perdido", formatCurrency(comercial.valorPerdido))}
        ${executiveMetric("Oportunidades abertas", today.oportunidadesAbertas)}
        ${executiveMetric("Oportunidades perdidas", today.oportunidadesPerdidas)}
        ${executiveMetric("Operacao que mais vende", topOperation ? `${topOperation.operacao} (${topOperation.fechados}/${topOperation.total})` : "Sem dados")}
      </div>
      <div class="comparison-grid">
        ${comparison.map((item) => `
          <article class="comparison-card">
            <h3>${escapeHtml(item.operacao)}</h3>
            <p>Leads: ${item.leads} | Pedidos: ${item.pedidos} | Eventos: ${item.eventos}</p>
            <p>Conversoes: ${item.conversoes} | Receita: ${formatCurrency(item.receitaEstimada)}</p>
          </article>
        `).join("")}
      </div>
      <div class="timeline-row">
        ${evolution.map((item) => `<span title="${escapeAttr(item.data)}">L${item.leads} P${item.pedidos} E${item.eventos} C${item.conversoes}</span>`).join("")}
      </div>
      <div class="comparison-grid">
        ${clientesPorTelefone.slice(0, 6).map((item) => `
          <article class="comparison-card">
            <h3>${escapeHtml(item.nome || item.telefone)}</h3>
            <p>Telefone: ${escapeHtml(item.telefone)} | Recorrente: ${item.clienteRecorrente ? "sim" : "nao"}</p>
            <p>Pedidos: ${item.pedidos} | Eventos: ${item.eventos} | Valor: ${formatCurrency(item.valorAcumulado)}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function executiveMetric(label, value) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 0)}</strong></article>`;
}

function renderPanel(title, items, type, emptyText) {
  return `
    <section class="panel-block">
      <h2>${title}</h2>
      ${items.length ? items.map((item) => renderCard(item, type)).join("") : `<p class="empty">${emptyText}</p>`}
    </section>
  `;
}

function renderCards(title, items, type) {
  items = applyFilter(items);
  if (!items.length) {
    content.innerHTML = `<p class="empty">${title}: nenhum registro ainda.</p>`;
    return;
  }
  content.innerHTML = `${renderFilters()}${items.map((item) => renderCard(item, type)).join("")}`;
}

function renderCard(item, type) {
  const title = getTitle(item, type);
  const status = item.status_comercial || item.status || item.interesse || "registrado";
  const message = item.mensagem_cliente || item.mensagem_original || item.observacoes || item.notes || "";
  const whatsapp = item.whatsapp || item.phone || "";
  const missing = item.dados_faltantes || item.faltantes || [];
  const incomplete = status === "aguardando_dados" || (Array.isArray(missing) && missing.length > 0);
  const waMessage = buildWhatsAppMessage(item, type);
  const waUrl = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(waMessage)}` : "";
  const history = Array.isArray(item.historico) ? item.historico.slice(-3).map((entry) => `${entry.type || entry.action}: ${entry.message}`).join(" | ") : "";
  return `
    <article class="record-card${incomplete ? " is-incomplete" : ""}">
      <header>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p class="meta">${escapeHtml(item.id || "")}</p>
        </div>
        <span class="pill">${escapeHtml(formatStatus(status))}</span>
      </header>
      <div class="fields">
        ${field("WhatsApp", whatsapp)}
        ${field("Tipo", item.tipo || item.type)}
        ${field("Origem", item.origem || item.source)}
        ${field("Pagina", item.page || item.pagina)}
        ${field("Campanha", item.campaign || item.utm_campaign)}
        ${field("Operacao", item.operacao || item.operation)}
        ${field("Pipeline", formatPipeline(item.pipeline))}
        ${field("Interesse", item.interesse)}
        ${field("Cliente", item.nome || item.customerName)}
        ${field("Atualizado", item.atualizado_em || item.ultimo_contato_em || item.updatedAt)}
        ${field("Temperatura", item.leadTemperature)}
        ${field("Score", item.leadScore)}
        ${field("Valor estimado", formatCurrency(item.valor_estimado))}
        ${field("Valor fechado", formatCurrency(item.valorFechado || item.valor_fechado))}
        ${field("Motivo perda", item.motivoPerda || item.motivo_perda)}
        ${field("Proximo passo", item.proximo_passo || item.nextAction)}
        ${field("Proximo retorno", formatDateTime(item.nextFollowUpAt))}
        ${field("Atraso", item.atraso)}
        ${field("Data evento", item.eventDateText || item.eventDate || item.data)}
        ${field("Horario evento", item.eventTimeText)}
        ${field("Local evento", item.eventLocationText || item.local)}
        ${field("Pessoas", item.quantidade_pessoas)}
        ${field("Dados faltantes", formatMissing(missing))}
        ${field("Mensagem sugerida", item.mensagem_whatsapp_sugerida)}
        ${field("Historico", history)}
        ${field("Mensagem", message)}
        ${field("Itens", formatItems(item.itens || item.items))}
      </div>
      <div class="card-actions">
        ${waUrl ? `<a href="${waUrl}" target="_blank" rel="noopener">Continuar no WhatsApp</a>` : ""}
        ${waMessage ? `<button class="copy-button" type="button" data-copy="${escapeAttr(waMessage)}">Copiar mensagem</button>` : ""}
        ${renderCommercialActions(item, type)}
        ${type === "leads" && isEventLead(item) ? `<button class="copy-button" type="button" data-convert-lead="${escapeAttr(item.id)}">Converter em evento</button>` : ""}
      </div>
    </article>
  `;
}

function renderCommercialActions(item, type) {
  if (type !== "leads" || !item.id || String(item.id).startsWith("reativar_")) return "";
  return `
    <button class="copy-button" type="button" data-lead-id="${escapeAttr(item.id)}" data-commercial-action="mark-contacted">Marcar como contatado</button>
    <button class="copy-button" type="button" data-lead-id="${escapeAttr(item.id)}" data-commercial-action="mark-quote-sent">Marcar orcamento enviado</button>
    <button class="copy-button" type="button" data-lead-id="${escapeAttr(item.id)}" data-commercial-action="mark-won">Marcar fechado</button>
    <span class="loss-action">
      <select data-loss-reason aria-label="Motivo da perda">
        ${lossReasons().map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
      </select>
      <button class="copy-button" type="button" data-lead-id="${escapeAttr(item.id)}" data-commercial-action="mark-lost">Marcar perdido</button>
    </span>
  `;
}

function getTitle(item, type) {
  if (type === "clientes") return item.nome || item.whatsapp || "Cliente sem nome";
  if (type === "leads") return item.nome || item.interesse || "Lead";
  if (type === "eventos") return item.nome_evento || item.tipo_evento || "Evento";
  if (type === "precomandas") return item.nome || item.operacao || "Pre-comanda";
  return item.mensagem_cliente || item.nome || "Atendimento";
}

function field(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div><span>${label}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function formatItems(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((item) => `${item.quantidade || item.quantity || 1}x ${item.nome || item.name || item.product || ""}`).join("; ");
}

function formatCurrency(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return "";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMissing(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((item) => String(item).replaceAll("_", " ")).join(", ");
}

function formatStatus(status = "") {
  const labels = {
    aguardando_dados: "Aguardando dados",
    novo_contato: "Novo contato",
    orcamento_solicitado: "Orcamento solicitado",
    orcamento_enviado: "Orcamento enviado",
    aguardando_resposta: "Aguardando resposta",
    em_atendimento: "Em atendimento",
    retorno_futuro: "Retorno futuro",
    retornar_depois: "Retornar depois",
    cliente_recorrente: "Cliente recorrente",
    fechado: "Fechado",
    perdido: "Perdido"
  };
  return labels[status] || String(status).replaceAll("_", " ");
}

function formatPipeline(pipeline = "") {
  const labels = {
    pedido_rapido: "Pedido rapido",
    food_truck_evento: "Food truck para evento",
    festa_xeriffe: "Festa no Xeriffe",
    orcamento_corporativo: "Orcamento corporativo",
    cliente_recorrente: "Cliente recorrente",
    atendimento_humano: "Atendimento humano"
  };
  return labels[pipeline] || String(pipeline).replaceAll("_", " ");
}

function renderFilters() {
  const filters = [
    ["todos", "Todos"],
    ["quente", "Quentes"],
    ["morno", "Mornos"],
    ["frio", "Frios"],
    ["aguardando_dados", "Aguardando dados"],
    ["orcamento_solicitado", "Orcamento solicitado"],
    ["orcamento_enviado", "Orcamento enviado"],
    ["aguardando_resposta", "Aguardando resposta"],
    ["food_truck_evento", "Food truck"],
    ["festa_xeriffe", "Festa no Xeriffe"],
    ["orcamento_corporativo", "Corporativo"],
    ["fechado", "Fechados"],
    ["perdido", "Perdidos"]
  ];
  return `<div class="filter-row">${filters.map(([id, label]) => `<button class="${currentFilter === id ? "is-active" : ""}" type="button" data-filter="${id}">${label}</button>`).join("")}<button class="${hideCommercialTests ? "is-active" : ""}" type="button" data-toggle-tests>${hideCommercialTests ? "Mostrar testes comerciais" : "Ocultar testes comerciais"}</button></div>`;
}

function applyFilter(items = []) {
  const visibleItems = hideCommercialTests ? items.filter((item) => !isCommercialTest(item)) : items;
  if (currentFilter === "todos") return visibleItems;
  return visibleItems.filter((item) => item.leadTemperature === currentFilter || item.status === currentFilter || item.pipeline === currentFilter || item.interesse === currentFilter);
}

function isCommercialTest(item = {}) {
  return JSON.stringify(item).toUpperCase().includes("TESTE COMERCIAL");
}

function formatDateTime(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function isEventLead(item) {
  return ["evento", "food_truck", "orcamento", "festa_confraternizacao", "festa_xeriffe", "reserva_xeriffe"].includes(item.interesse);
}

function lossReasons() {
  return [
    ["sem_resposta", "Sem resposta"],
    ["preco", "Preco"],
    ["data_indisponivel", "Data indisponivel"],
    ["queria_outro_servico", "Queria outro servico"],
    ["local_distante", "Local distante"],
    ["evento_cancelado", "Evento cancelado"],
    ["so_pesquisando", "So pesquisando"],
    ["outro", "Outro"]
  ];
}

function buildWhatsAppMessage(item, type) {
  if (item.mensagem_whatsapp_sugerida || item.reactivationMessage) return item.mensagem_whatsapp_sugerida || item.reactivationMessage;
  if (type === "eventos" || item.interesse === "food_truck" || item.interesse === "festa_confraternizacao") {
    return `Buenas, SamBah!
Vamos seguir com teu evento pelo WhatsApp.

Resumo: ${item.observacoes || item.mensagem_original || ""}

Pode me passar os dados que faltam?`;
  }
  if (type === "precomandas") {
    return `Buenas, SamBah!
Vamos seguir com tua pre-comanda pelo WhatsApp.

Pedido: ${formatItems(item.itens)}

Pode confirmar comigo?`;
  }
  return `Buenas, SamBah!
Seguimos teu atendimento por aqui.

Mensagem: ${item.mensagem_cliente || item.mensagem_original || item.observacoes || ""}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

async function openExternalWhatsApp(url) {
  const shell = window.electron?.shell || window.electronAPI?.shell || window.SamBahElectron?.shell;
  if (shell?.openExternal) return shell.openExternal(url);
  window.open(url, "_blank", "noopener,noreferrer");
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href*='wa.me']");
  if (!link) return;
  event.preventDefault();
  openExternalWhatsApp(link.href);
});
