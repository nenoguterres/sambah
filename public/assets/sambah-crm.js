const state = {
  dashboard: {},
  clientes: [],
  leads: [],
  atendimentos: [],
  eventos: [],
  oportunidades: [],
  precomandas: [],
  pedidosSite: [],
  activeTab: "visao",
  filter: "todos",
  search: ""
};

const els = {
  status: document.querySelector("#crmStatus"),
  form: document.querySelector("#leadForm"),
  formMessage: document.querySelector("#formMessage"),
  refresh: document.querySelector("#refreshLeads"),
  metrics: document.querySelector("#metricGrid"),
  panels: document.querySelector("#crmPanels"),
  tabs: document.querySelector(".crm-tabs"),
  search: document.querySelector("#crmSearch"),
  filter: document.querySelector("#crmFilter")
};

const TAB_IDS = new Set(["visao", "leads", "clientes", "atendimentos", "oportunidades", "precomandas", "pedidos"]);

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `Falha em ${url}`);
  return data;
}

async function sendJson(url, method, body = {}) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `Falha em ${url}`);
  return data;
}

async function loadDashboard() {
  state.dashboard = await getJson("/api/crm/resumo");
  return state.dashboard;
}

async function loadClientes() {
  const data = await getJson("/api/clientes");
  state.clientes = data.items || [];
  return data;
}

async function loadLeads() {
  const data = await getJson("/api/leads");
  state.leads = data.items || [];
  return data;
}

async function loadAtendimentos() {
  const data = await getJson("/api/atendimentos");
  state.atendimentos = data.items || [];
  return data;
}

async function loadEventos() {
  const data = await getJson("/api/eventos");
  state.eventos = data.items || [];
  return data;
}

async function loadOportunidades() {
  const data = await getJson("/api/oportunidades");
  state.oportunidades = data.items || [];
  return data;
}

async function loadPrecomandas() {
  const data = await getJson("/api/precomandas");
  state.precomandas = data.items || [];
  return data;
}

async function loadPedidosSite() {
  const data = await getJson("/api/mesa/pedidos-site?status=todos");
  state.pedidosSite = data.items || [];
  return data;
}

async function refreshSambahCrm({ updateButton = true } = {}) {
  const originalText = els.refresh?.textContent || "Atualizar";
  if (updateButton && els.refresh) {
    els.refresh.disabled = true;
    els.refresh.textContent = "Atualizando...";
  }

  try {
    const results = await Promise.allSettled([
      loadDashboard(),
      loadClientes(),
      loadLeads(),
      loadAtendimentos(),
      loadEventos(),
      loadOportunidades(),
      loadPrecomandas(),
      loadPedidosSite()
    ]);
    const errors = results.filter((result) => result.status === "rejected");
    if (errors.length) {
      console.error("[SamBah CRM] Falha ao atualizar dados", errors.map((item) => item.reason));
      setStatus("Atualização parcial. Confira o console.");
    } else {
      setStatus(`${state.leads.length} leads | ${state.oportunidades.length} oportunidades`);
    }
    render();
  } catch (error) {
    console.error("[SamBah CRM] Erro inesperado ao atualizar", error);
    setStatus("Não foi possível atualizar agora.");
  } finally {
    if (updateButton && els.refresh) {
      els.refresh.disabled = false;
      els.refresh.textContent = originalText;
    }
  }
}

function setStatus(text) {
  if (els.status) els.status.textContent = text;
}

function render() {
  renderMetrics();
  renderPanels();
  document.querySelectorAll("[data-crm-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.crmTab === state.activeTab);
  });
}

function renderMetrics() {
  const data = state.dashboard || {};
  const comercial = data.comercial || {};
  const metrics = [
    ["Clientes", data.clientes],
    ["Leads", data.leads || state.leads.length],
    ["Atendimentos", data.atendimentos || state.atendimentos.length],
    ["Oportunidades", state.oportunidades.length],
    ["Pré-comandas", data.precomandas || state.precomandas.length],
    ["Pedidos site", state.pedidosSite.length],
    ["Quentes", data.leadsQuentes],
    ["Retornos hoje", data.retornosHoje],
    ["Orçamentos enviados", data.orcamentosEnviados],
    ["Fechados", data.fechados],
    ["Valor em negociação", formatCurrency(comercial.valorEmNegociacao)],
    ["Valor fechado", formatCurrency(comercial.valorFechado)]
  ];
  els.metrics.replaceChildren(...metrics.map(([label, value]) => metricCard(label, value)));
}

function metricCard(label, value) {
  const card = document.createElement("article");
  card.className = "metric-card";
  card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 0)}</strong>`;
  return card;
}

function renderPanels() {
  const panels = {
    visao: renderOverview,
    leads: () => panel("Leads", filtered(state.leads), renderLead, "Nenhum lead cadastrado."),
    clientes: () => panel("Clientes", filtered(state.clientes), renderCliente, "Nenhum cliente cadastrado."),
    atendimentos: () => panel("Atendimentos", filtered(state.atendimentos), renderAtendimento, "Nenhum atendimento registrado."),
    oportunidades: () => panel("Oportunidades", filtered(state.oportunidades), renderOportunidade, "Nenhuma oportunidade aberta."),
    precomandas: () => panel("Pré-comandas", filtered(state.precomandas), renderPrecomanda, "Nenhuma pré-comanda registrada."),
    pedidos: () => panel("Pedidos do Site", filtered(state.pedidosSite), renderPedidoSite, "Nenhum pedido do site.")
  };
  els.panels.innerHTML = panels[state.activeTab]?.() || panels.visao();
}

function renderOverview() {
  const data = state.dashboard || {};
  return [
    panel("Dinheiro do Dia", filtered(data.dinheiroDoDia || []), renderLead, "Nenhuma oportunidade prioritária agora."),
    panel("Retornos Vencidos", filtered(data.retornosVencidos || []), renderLead, "Nenhum retorno vencido."),
    panel("Orçamentos Parados", filtered(data.orcamentosParados || []), renderLead, "Nenhum orçamento parado."),
    panel("Leads do Site Insano", filtered(data.leadsInsanoSite || []), renderLead, "Nenhum lead do site Insano."),
    panel("Reativação", filtered(data.reativacao || []), renderReativacao, "Nenhum cliente para reativar agora."),
    panel("Últimos Atendimentos", filtered(data.ultimosAtendimentos || state.atendimentos.slice(0, 8)), renderAtendimento, "Nenhum atendimento recente."),
    panel("Últimas Pré-comandas", filtered(data.ultimasPrecomandas || state.precomandas.slice(0, 8)), renderPrecomanda, "Nenhuma pré-comanda recente.")
  ].join("");
}

function panel(title, items, renderer, emptyText) {
  return `
    <section class="crm-panel list-panel">
      <div class="section-title">
        <h2>${escapeHtml(title)}</h2>
        <span>${items.length} registros</span>
      </div>
      <div class="record-list">
        ${items.length ? items.map(renderer).join("") : `<p class="empty-state">${escapeHtml(emptyText)}</p>`}
      </div>
    </section>
  `;
}

function renderLead(lead = {}) {
  const phone = lead.whatsapp || lead.phone || lead.telefone || "";
  const title = lead.nome || lead.name || lead.customerName || lead.interesse || "Lead";
  const status = lead.status || lead.stage || "novo";
  const message = lead.mensagem_whatsapp_sugerida || lead.mensagemSugerida || lead.message || lead.mensagem_original || lead.notes || "";
  const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message || "Buenas, seguimos teu atendimento pelo SamBah.")}` : "";
  return `
    <article class="record-card ${lead.leadTemperature ? `temp-${escapeAttr(lead.leadTemperature)}` : ""}">
      ${recordHeader(title, status, lead.id)}
      <div class="fields">
        ${field("Telefone", phone)}
        ${field("Origem", lead.origem || lead.source)}
        ${field("Interesse", lead.interesse || lead.interest)}
        ${field("Pipeline", labelize(lead.pipeline))}
        ${field("Temperatura", lead.leadTemperature)}
        ${field("Score", lead.leadScore)}
        ${field("Valor estimado", formatCurrency(lead.valor_estimado || lead.valorEstimado))}
        ${field("Valor fechado", formatCurrency(lead.valorFechado || lead.valor_fechado))}
        ${field("Próximo passo", lead.proximo_passo || lead.nextAction)}
        ${field("Próximo retorno", formatDateTime(lead.nextFollowUpAt || lead.proximo_retorno))}
        ${field("Dados faltantes", formatList(lead.dados_faltantes || lead.faltantes))}
        ${field("Mensagem", lead.mensagem_original || lead.message || lead.notes)}
      </div>
      <div class="card-actions">
        ${waUrl ? `<a href="${escapeAttr(waUrl)}" target="_blank" rel="noopener" data-whatsapp-url>WhatsApp</a>` : ""}
        ${message ? `<button type="button" data-copy="${escapeAttr(message)}">Copiar mensagem</button>` : ""}
        ${lead.id ? `
          <button type="button" data-lead-action="mark-contacted" data-lead-id="${escapeAttr(lead.id)}">Contatado</button>
          <button type="button" data-lead-action="mark-quote-sent" data-lead-id="${escapeAttr(lead.id)}">Orçamento enviado</button>
          <button type="button" data-lead-action="mark-won" data-lead-id="${escapeAttr(lead.id)}">Fechado</button>
          <button type="button" data-lead-action="mark-lost" data-lead-id="${escapeAttr(lead.id)}">Perdido</button>
          ${isEventLead(lead) ? `<button type="button" data-convert-lead="${escapeAttr(lead.id)}">Converter evento</button>` : ""}
        ` : ""}
      </div>
    </article>
  `;
}

function renderCliente(cliente = {}) {
  return `
    <article class="record-card">
      ${recordHeader(cliente.nome || cliente.whatsapp || "Cliente", cliente.status_comercial || "cliente", cliente.id)}
      <div class="fields">
        ${field("WhatsApp", cliente.whatsapp)}
        ${field("Email", cliente.email)}
        ${field("Origem", cliente.origem)}
        ${field("Pedidos", cliente.pedidos)}
        ${field("Valor acumulado", formatCurrency(cliente.valor_acumulado || cliente.valor_estimado_total))}
        ${field("Observações", cliente.observacoes)}
      </div>
    </article>
  `;
}

function renderAtendimento(item = {}) {
  return `
    <article class="record-card">
      ${recordHeader(item.nome || item.customerName || item.whatsapp || "Atendimento", item.status || item.interesse || "registrado", item.id)}
      <div class="fields">
        ${field("WhatsApp", item.whatsapp || item.phone)}
        ${field("Canal", item.canal || item.channel)}
        ${field("Origem", item.origem || item.source)}
        ${field("Interesse", item.interesse)}
        ${field("Data", formatDateTime(item.criado_em || item.createdAt))}
        ${field("Mensagem", item.mensagem_cliente || item.message || item.notes)}
      </div>
    </article>
  `;
}

function renderOportunidade(item = {}) {
  const message = item.mensagemSugerida || item.mensagem_whatsapp_sugerida || "";
  return `
    <article class="record-card">
      ${recordHeader(item.nome || item.telefone || "Oportunidade", `${item.prioridade || ""} ${item.tempoParado || ""}`.trim(), item.id)}
      <div class="fields">
        ${field("Telefone", item.telefone)}
        ${field("Operação", item.operacao)}
        ${field("Origem", item.origem)}
        ${field("Pipeline", labelize(item.pipeline))}
        ${field("Alerta", item.alerta)}
        ${field("Ação sugerida", item.acaoSugerida)}
        ${field("Mensagem sugerida", message)}
      </div>
      <div class="card-actions">
        ${item.whatsappUrl ? `<a href="${escapeAttr(item.whatsappUrl)}" target="_blank" rel="noopener" data-whatsapp-url>WhatsApp</a>` : ""}
        ${message ? `<button type="button" data-copy="${escapeAttr(message)}">Copiar mensagem</button>` : ""}
        ${item.id ? `<button type="button" data-opportunity-action="retornado" data-opportunity-id="${escapeAttr(item.id)}">Retornado</button><button type="button" data-opportunity-action="arquivar" data-opportunity-id="${escapeAttr(item.id)}">Arquivar</button>` : ""}
      </div>
    </article>
  `;
}

function renderPrecomanda(item = {}) {
  return `
    <article class="record-card">
      ${recordHeader(item.nome || item.cliente || item.whatsapp || "Pré-comanda", item.status || item.status_comercial || "registrada", item.id)}
      <div class="fields">
        ${field("WhatsApp", item.whatsapp || item.phone)}
        ${field("Operação", item.operacao)}
        ${field("Tipo", item.tipo || item.type)}
        ${field("Valor", formatCurrency(item.valor_total || item.total || item.valor_estimado))}
        ${field("Itens", formatItems(item.itens || item.items))}
        ${field("Criada", formatDateTime(item.criado_em || item.createdAt))}
      </div>
    </article>
  `;
}

function renderPedidoSite(item = {}) {
  return `
    <article class="record-card">
      ${recordHeader(item.customer?.name || item.nome || item.id || "Pedido do Site", item.status || "pedido", item.id)}
      <div class="fields">
        ${field("Telefone", item.customer?.phone || item.whatsapp || item.phone)}
        ${field("Status", item.status)}
        ${field("Canal", item.channel || item.origem)}
        ${field("Total", formatCurrency(item.total || item.valor_total))}
        ${field("Itens", formatItems(item.items || item.itens))}
        ${field("Criado", formatDateTime(item.createdAt || item.criado_em))}
      </div>
    </article>
  `;
}

function renderReativacao(item = {}) {
  return `
    <article class="record-card">
      ${recordHeader(item.nome || item.telefone || "Cliente para reativar", "reativação", item.id)}
      <div class="fields">
        ${field("Telefone", item.telefone || item.whatsapp)}
        ${field("Motivo", item.reason || item.motivo)}
        ${field("Mensagem", item.reactivationMessage || item.mensagem_whatsapp_sugerida)}
      </div>
      <div class="card-actions">
        ${item.reactivationMessage ? `<button type="button" data-copy="${escapeAttr(item.reactivationMessage)}">Copiar mensagem</button>` : ""}
      </div>
    </article>
  `;
}

function recordHeader(title, status, id) {
  return `
    <header>
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p class="meta">${escapeHtml(id || "")}</p>
      </div>
      <span class="stage-chip">${escapeHtml(labelize(status || ""))}</span>
    </header>
  `;
}

function field(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function filtered(items = []) {
  const term = normalize(state.search);
  return items.filter((item) => {
    const text = normalize(JSON.stringify(item));
    const matchesSearch = !term || text.includes(term);
    const matchesFilter = state.filter === "todos"
      || item.leadTemperature === state.filter
      || item.status === state.filter
      || item.stage === state.filter
      || item.pipeline === state.filter
      || item.interesse === state.filter
      || item.status_comercial === state.filter;
    return matchesSearch && matchesFilter;
  });
}

async function createLead(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(els.form).entries());
  els.formMessage.textContent = "Criando...";
  try {
    await sendJson("/api/leads", "POST", body);
    els.form.reset();
    els.formMessage.textContent = "Lead criado.";
    await refreshSambahCrm({ updateButton: false });
  } catch (error) {
    console.error("[SamBah CRM] Falha ao criar lead", error);
    els.formMessage.textContent = error.message;
  }
}

async function handlePanelClick(event) {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    await navigator.clipboard.writeText(copyButton.dataset.copy || "");
    copyButton.textContent = "Copiado";
    return;
  }

  const leadAction = event.target.closest("[data-lead-action]");
  if (leadAction) {
    await runButtonAction(leadAction, async () => {
      const payload = leadAction.dataset.leadAction === "mark-lost" ? { motivo_perda: "outro" } : {};
      await sendJson(`/api/crm/leads/${encodeURIComponent(leadAction.dataset.leadId)}/${leadAction.dataset.leadAction}`, "POST", payload);
    });
    return;
  }

  const convertLead = event.target.closest("[data-convert-lead]");
  if (convertLead) {
    await runButtonAction(convertLead, async () => {
      await sendJson(`/api/crm/leads/${encodeURIComponent(convertLead.dataset.convertLead)}/convert-event`, "POST", {});
    });
    return;
  }

  const opportunityAction = event.target.closest("[data-opportunity-action]");
  if (opportunityAction) {
    await runButtonAction(opportunityAction, async () => {
      await sendJson(`/api/oportunidades/${encodeURIComponent(opportunityAction.dataset.opportunityId)}/${opportunityAction.dataset.opportunityAction}`, "POST", {});
    });
  }
}

async function runButtonAction(button, action) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Atualizando...";
  try {
    await action();
    button.textContent = "Atualizado";
    await refreshSambahCrm({ updateButton: false });
  } catch (error) {
    console.error("[SamBah CRM] Falha na ação", error);
    button.textContent = "Erro";
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 800);
  }
}

function isEventLead(item = {}) {
  return ["evento", "food_truck", "orcamento", "festa_confraternizacao", "festa_xeriffe", "reserva_xeriffe"].includes(item.interesse);
}

function formatItems(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((item) => `${item.quantidade || item.quantity || 1}x ${item.nome || item.name || item.product || item.product_id || ""}`.trim()).join("; ");
}

function formatList(items = []) {
  return Array.isArray(items) ? items.map(labelize).join(", ") : items;
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function labelize(value = "") {
  const labels = {
    aguardando_dados: "Aguardando dados",
    novo_contato: "Novo contato",
    em_atendimento: "Em atendimento",
    orcamento_solicitado: "Orçamento solicitado",
    orcamento_enviado: "Orçamento enviado",
    aguardando_resposta: "Aguardando resposta",
    retorno_futuro: "Retorno futuro",
    fechado: "Fechado",
    perdido: "Perdido",
    food_truck_evento: "Food truck evento",
    festa_xeriffe: "Festa Xeriffe",
    orcamento_corporativo: "Orçamento corporativo"
  };
  return labels[value] || String(value).replaceAll("_", " ");
}

function normalize(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

els.form.addEventListener("submit", createLead);
els.refresh.addEventListener("click", () => refreshSambahCrm());
els.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-crm-tab]");
  if (!button) return;
  state.activeTab = button.dataset.crmTab;
  history.replaceState(null, "", `#${state.activeTab}`);
  render();
});
els.panels.addEventListener("click", handlePanelClick);
els.search.addEventListener("input", () => {
  state.search = els.search.value;
  renderPanels();
});
els.filter.addEventListener("change", () => {
  state.filter = els.filter.value;
  renderPanels();
});
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-whatsapp-url], a[href*='wa.me']");
  if (!link) return;
  event.preventDefault();
  openExternalWhatsApp(link.href);
});
window.addEventListener("hashchange", () => {
  applyHashTab();
  render();
});

window.refreshSambahCrm = refreshSambahCrm;
applyHashTab();
refreshSambahCrm({ updateButton: false });

function applyHashTab() {
  const tab = window.location.hash.replace("#", "");
  if (TAB_IDS.has(tab)) state.activeTab = tab;
}
