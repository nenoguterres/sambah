const state = {
  summary: null,
  health: null,
  diagnostics: null,
  operationalStatus: null,
  posts: [],
  rules: [],
  sales: [],
  leads: [],
  campaigns: [],
  channels: [],
  radarSignals: [],
  paySignals: [],
  paySuggestions: [],
  campaignHistory: null,
  campaignActionMessage: "",
  postActionMessage: "",
  editingCampaignId: "",
  audit: [],
  alerts: [],
  giro: null,
  giroReport: [],
  postEnginePreview: null,
  postEngineDrafts: [],
  postEngineCalendar: [],
  postEngineStats: null,
  permissions: null,
  draftCampaignFilter: "",
  claudeVariations: null,
  claudeMessage: "",
  claudeError: "",
  campaignDraftForm: {
    open: false,
    campaignId: "",
    message: "",
    error: ""
  },
  activeRole: localStorage.getItem("perola-active-role") || "ATENDENTE",
  postEngineNotice: "",
  postEngineError: "",
  campaignPage: 1,
  campaignQuery: "",
  activeNavModule: ""
};

const $ = (selector) => document.querySelector(selector);

const RADAR_SECTIONS = [
  "#radarInsano",
  ".ecosystem-intro",
  ".operation-status-strip",
  ".ecosystem-cards",
  ".pearl-message"
];

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("perola-paged");
  setupSidebarDrawer();
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.querySelector('[name="date"]');
  if (dateInput) dateInput.value = today;
  setDefaultCampaignDates();
  const roleSelect = $("#perolaRole");
  if (roleSelect) {
    roleSelect.value = state.activeRole;
    roleSelect.addEventListener("change", () => {
      state.activeRole = roleSelect.value;
      localStorage.setItem("perola-active-role", state.activeRole);
      state.postEngineNotice = `Perfil ativo: ${state.activeRole}.`;
      loadPostEnginePreview();
    });
  }
  $("#reloadPerola")?.addEventListener("click", loadPerola);
  $("#runGiro")?.addEventListener("click", runGiro);
  $("#runIntelligentGiro")?.addEventListener("click", runIntelligentGiro);
  $("#refreshPostEngine")?.addEventListener("click", loadPostEnginePreview);
  $("#generateClaudeVariations")?.addEventListener("click", generateClaudeVariations);
  $("#postForm")?.addEventListener("submit", savePost);
  $("#salesForm")?.addEventListener("submit", saveSalesDay);
  $("#campaignForm")?.addEventListener("submit", saveCampaign);
  $("#cancelCampaignEdit")?.addEventListener("click", resetCampaignForm);
  document.querySelectorAll("[data-perola-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const hash = button.dataset.perolaTab === "campaigns" ? "#campaignsList" : "#radarInsano";
      navigateWorkspace(hash);
    });
  });
  document.querySelectorAll('.side-nav a[href^="#"], .ecosystem-card[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      state.activeNavModule = link.closest(".nav-module")?.dataset.navModule || "";
      navigateWorkspace(link.getAttribute("href"));
    });
  });
  window.addEventListener("hashchange", () => activateWorkspaceView(window.location.hash));
  activateWorkspaceView(window.location.hash || "#radarInsano");
  loadPerola();
  if (workspaceViewForHash(window.location.hash) === "materials") loadPostEnginePreview();
  if (["campaigns", "materials", "giro"].includes(workspaceViewForHash(window.location.hash))) ensurePermissions();
});

async function loadPerola() {
  const [summary, health, diagnostics, operationalStatus, posts, rules, sales, audit, alerts, giro, giroReport, campaigns, channels, leads, radarSignals, campaignHistory, paySignals, paySuggestions] = await Promise.all([
    getJson("/api/perola"),
    getJson("/api/perola/health"),
    getJson("/api/perola/diagnostics"),
    getJson("/api/perola/operational-status"),
    getJson("/api/perola/posts"),
    getJson("/api/perola/rules"),
    getJson("/api/perola/sales-daily"),
    getJson("/api/perola/audit?limit=8"),
    getJson("/api/perola/alerts"),
    getJson("/api/perola/giro"),
    getJson("/api/perola/giro/report"),
    getJson("/api/perola/campaigns"),
    getJson("/api/perola/channels"),
    getJson("/api/leads"),
    getJson("/api/perola/radar/signals"),
    getJson("/api/perola/history"),
    getJson("/api/pay-perola/signals"),
    getJson("/api/pay-perola/suggestions")
  ]);
  state.summary = summary;
  state.health = health;
  state.diagnostics = diagnostics;
  state.operationalStatus = operationalStatus;
  state.posts = posts.items || [];
  state.rules = rules.items || [];
  state.sales = sales.items || [];
  state.leads = leads.items || [];
  state.audit = audit.items || [];
  state.alerts = alerts.items || summary.alerts || [];
  state.giro = giro;
  state.giroReport = giroReport.items || [];
  state.campaigns = campaigns.items || [];
  state.channels = channels.items || [];
  state.radarSignals = radarSignals.signals || [];
  state.campaignHistory = campaignHistory;
  state.paySignals = paySignals.items || [];
  state.paySuggestions = paySuggestions.items || [];
  syncPostCampaignSelect();
  render();
}

async function loadPostEnginePreview() {
  const button = $("#refreshPostEngine");
  if (button) button.disabled = true;
  try {
    const [preview, drafts, calendar, stats, permissions] = await Promise.all([
      getJson("/api/perola/post-engine/preview"),
      getJson("/api/perola/post-engine/drafts"),
      getJson("/api/perola/post-engine/calendar"),
      getJson("/api/perola/post-engine/stats"),
      getJson("/api/perola/permissions")
    ]);
    if (!preview.success || !preview.data) {
      throw new Error("post_engine_preview_unavailable");
    }
    state.postEnginePreview = preview.data;
    state.postEngineDrafts = Array.isArray(drafts.drafts) ? drafts.drafts : [];
    state.postEngineCalendar = Array.isArray(calendar.items) ? calendar.items : [];
    state.postEngineStats = stats;
    state.permissions = permissions;
    renderCampaigns();
    state.postEngineError = "";
  } catch (error) {
    state.postEngineNotice = "";
    state.postEngineError = "Não foi possível carregar as ideias do Motor de Posts agora.";
  } finally {
    if (button) button.disabled = false;
    renderEcosystemCards();
    renderPostEnginePreview();
  }
}

async function ensurePermissions() {
  if (state.permissions) return state.permissions;
  state.permissions = await getJson("/api/perola/permissions");
  renderCampaigns();
  renderPostEnginePreview();
  return state.permissions;
}

async function createPostEngineDraft(index) {
  const ideas = Array.isArray(state.postEnginePreview?.postIdeas) ? state.postEnginePreview.postIdeas : [];
  const idea = ideas[index];
  if (!idea) return;
  const button = document.querySelector(`[data-create-post-engine-draft="${index}"]`);
  if (button) button.disabled = true;
  try {
    const result = await postJson("/api/perola/post-engine/drafts", {
      idea: {
        type: idea.type,
        title: idea.title,
        description: idea.idea || idea.suggestedCaption || ""
      }
    });
    if (!result.success) throw new Error(result.error || "post_engine_draft_error");
    await loadPostEnginePreview();
    state.postEngineNotice = `Draft criado: ${result.draft.title}`;
    renderPostEnginePreview();
  } catch (error) {
    state.postEngineError = "Não foi possível criar o draft do Motor de Posts agora.";
    renderPostEnginePreview();
  } finally {
    if (button) button.disabled = false;
  }
}

async function saveCampaignDraft(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const campaignId = String(formData.get("campaignId") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const type = String(formData.get("type") || "promocao").trim();
  state.campaignDraftForm.message = "";
  state.campaignDraftForm.error = "";
  try {
    const result = await postJson("/api/perola/post-engine/drafts", {
      idea: { type, title, description, campaignId }
    });
    if (!result.success) throw new Error(result.message || result.error || "draft_create_error");
    state.draftCampaignFilter = campaignId;
    state.campaignDraftForm = { open: false, campaignId: "", message: `Draft criado: ${result.draft.title}`, error: "" };
    await Promise.all([loadPerola(), loadPostEnginePreview()]);
  } catch (error) {
    state.campaignDraftForm.error = error.message || "Nao foi possivel criar o draft.";
    renderPostEnginePreview();
  }
}

function openCampaignDraftForm(campaignId) {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  state.campaignDraftForm = {
    open: true,
    campaignId,
    message: campaign ? `Novo draft para ${campaign.title || campaign.id}.` : "Novo draft de campanha.",
    error: ""
  };
  state.draftCampaignFilter = campaignId;
  navigateWorkspace("#postEngineBlock");
  renderPostEnginePreview();
  const form = $("#campaignDraftForm");
  if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeCampaignDraftForm() {
  state.campaignDraftForm = { open: false, campaignId: "", message: "", error: "" };
  renderPostEnginePreview();
}

async function runGiro() {
  await postJson("/api/perola/giro/run", {});
  await loadPerola();
}

async function runIntelligentGiro() {
  const result = await postJson("/api/perola/giro/intelligent", {});
  state.postEngineNotice = result.success ? "Giro Inteligente criou um draft para revisão." : "Não foi possível executar o Giro Inteligente.";
  await loadPostEnginePreview();
  renderPostEnginePreview();
}

async function generateClaudeVariations() {
  const ideaInput = $("#claudeCampaignIdea");
  state.claudeError = "";
  state.claudeMessage = "Gerando variacoes comerciais...";
  renderClaudeVariations();
  try {
    const result = await postJson("/api/perola/claude/variations", {
      idea: ideaInput?.value || ""
    });
    if (!result.success) {
      state.claudeError = result.message || "Nao foi possivel gerar variacoes agora.";
      state.claudeVariations = null;
      return;
    }
    state.claudeVariations = result;
    state.claudeMessage = "Variacoes prontas para revisar e usar.";
  } catch {
    state.claudeError = "Nao foi possivel falar com o assistente local agora.";
    state.claudeVariations = null;
  } finally {
    renderClaudeVariations();
  }
}

async function updatePostEngineDraft(id, patch) {
  const result = await patchJson(`/api/perola/post-engine/drafts/${encodeURIComponent(id)}`, patch);
  state.postEngineNotice = result.success ? `Draft atualizado para ${result.draft.status}.` : (result.message || "Não foi possível atualizar o draft.");
  await loadPostEnginePreview();
  renderPostEnginePreview();
}

async function deletePostEngineDraft(id) {
  const response = await fetch(`/api/perola/post-engine/drafts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: requestHeaders()
  });
  const result = await response.json();
  state.postEngineNotice = result.success ? "Draft removido." : "Não foi possível remover o draft.";
  await loadPostEnginePreview();
  renderPostEnginePreview();
}

async function savePost(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  body.networks = formData.getAll("networks");
  body.approved = formData.has("approved");
  body.autoPublishIfExpired = formData.has("autoPublishIfExpired");
  await postJson("/api/perola/posts", body);
  state.postActionMessage = "Publicacao salva no Perola.";
  form.reset();
  form.querySelector('[name="humanDeadlineMinutes"]').value = 15;
  form.querySelector('[name="networks"][value="instagram"]').checked = true;
  if (form.elements.campaignId) form.elements.campaignId.value = "";
  await loadPerola();
}

async function saveSalesDay(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  await postJson("/api/perola/sales-daily", body);
  await loadPerola();
}

async function saveCampaign(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  if (!payload.id) delete payload.id;
  const wasEditing = Boolean(state.editingCampaignId);
  const result = wasEditing
    ? await patchJson(`/api/perola/campaigns/${encodeURIComponent(state.editingCampaignId)}`, payload)
    : await postJson("/api/perola/campaigns", payload);
  const message = $("#campaignMessage");
  if (!result.success) {
    if (message) message.textContent = result.message || "Nao foi possivel salvar a campanha.";
    return;
  }
  resetCampaignForm();
  if (message) message.textContent = wasEditing ? "Campanha atualizada." : "Campanha criada.";
  await loadPerola();
  navigateWorkspace("#campaignsList");
}

async function deleteCampaign(id) {
  if (!can("campaign_delete")) {
    const switchRole = window.confirm(`O perfil ${state.activeRole} nao pode excluir campanhas. Ativar o perfil Administrador e continuar?`);
    if (!switchRole) return;
    state.activeRole = "ADMIN";
    localStorage.setItem("perola-active-role", state.activeRole);
    const roleSelect = $("#perolaRole");
    if (roleSelect) roleSelect.value = state.activeRole;
  }
  if (!window.confirm("Excluir esta campanha local?")) return;
  const result = await deleteJson(`/api/perola/campaigns/${encodeURIComponent(id)}`);
  const message = $("#campaignMessage");
  if (message) message.textContent = result.success ? "Campanha excluida." : (result.message || "Nao foi possivel excluir a campanha.");
  await loadPerola();
  navigateWorkspace("#campaignsList");
}

async function generateCampaignFromSignal(signalId) {
  const result = await postJson(`/api/perola/campaigns/from-signal/${encodeURIComponent(signalId)}`, {});
  state.campaignActionMessage = result.success
    ? `Campanha criada: ${result.campaign.title}.`
    : (result.message || "Nao foi possivel criar campanha a partir do sinal.");
  await loadPerola();
  navigateWorkspace("#campaignsList");
}

async function approveCampaign(id) {
  const result = await patchJson(`/api/perola/campaigns/${encodeURIComponent(id)}/approve`, {});
  state.campaignActionMessage = result.success
    ? `Campanha aprovada: ${result.campaign.title}.`
    : (result.message || "Nao foi possivel aprovar a campanha.");
  await loadPerola();
  navigateWorkspace("#campaignsList");
}

async function rejectCampaign(id) {
  const reason = window.prompt("Motivo da rejeicao local:", "") || "";
  const result = await patchJson(`/api/perola/campaigns/${encodeURIComponent(id)}/reject`, { rejectedReason: reason });
  state.campaignActionMessage = result.success
    ? `Campanha rejeitada: ${result.campaign.title}.`
    : (result.message || "Nao foi possivel rejeitar a campanha.");
  await loadPerola();
  navigateWorkspace("#campaignsList");
}

async function distributeCampaign(id) {
  const checkedChannels = [...document.querySelectorAll("[data-channel-campaign]:checked")]
    .filter((input) => input.dataset.channelCampaign === id)
    .map((input) => input.value)
    .filter(Boolean);
  if (!checkedChannels.length) {
    state.campaignActionMessage = "Seleciona ao menos um canal ativo antes de distribuir.";
    renderCampaigns();
    return;
  }
  const result = await postJson(`/api/perola/campaigns/${encodeURIComponent(id)}/distribute`, { channelIds: checkedChannels });
  state.campaignActionMessage = result.success
    ? `Material distribuido localmente em ${result.distribution.sentToChannels.length} canal${result.distribution.sentToChannels.length === 1 ? "" : "is"}.`
    : (result.message || "A campanha precisa estar aprovada antes de distribuir.");
  await loadPerola();
  navigateWorkspace("#campaignsList");
}

async function createCampaignPublication(id) {
  const result = await postJson(`/api/perola/campaigns/${encodeURIComponent(id)}/publication`, {});
  state.campaignActionMessage = result.success
    ? `Publicacao criada e vinculada: ${result.post.title}.`
    : (result.message || "Nao foi possivel criar a publicacao da campanha.");
  await Promise.all([loadPerola(), loadPostEnginePreview()]);
  navigateWorkspace("#postComposer");
}

async function toggleChannel(id, enabled) {
  const result = await patchJson(`/api/perola/channels/${encodeURIComponent(id)}`, { enabled });
  state.campaignActionMessage = result.success
    ? `Canal ${result.channel.name} ${result.channel.enabled ? "ativado" : "desativado"}.`
    : (result.message || "Nao foi possivel atualizar o canal.");
  await loadPerola();
  navigateWorkspace("#perolaChannelsPanel");
}

async function setPostStatus(id, status) {
  await fetch(`/api/perola/posts/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status })
  });
  await loadPerola();
}

async function setPostCampaign(id, campaignId) {
  const result = await patchJson(`/api/perola/posts/${encodeURIComponent(id)}`, { campaignId });
  if (!result.ok) window.alert(result.message || "Nao foi possivel alterar a campanha.");
  await loadPerola();
}

async function setPostApproval(id, approved) {
  await fetch(`/api/perola/posts/${encodeURIComponent(id)}/approval`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approved })
  });
  await loadPerola();
}

async function publishPost(id) {
  const button = document.querySelector(`[data-publish-id="${CSS.escape(id)}"]`);
  if (button) button.disabled = true;
  const result = await postJson(`/api/perola/posts/${encodeURIComponent(id)}/publish`, { source: "human" });
  if (result.ok && result.post?.publishProvider === "instagram") {
    state.postActionMessage = `Publicado no Instagram @${result.post.instagramAccount || "conta conectada"}.`;
  } else if (result.ok) {
    state.postActionMessage = "Publicacao marcada como simulada no Perola.";
  } else {
    state.postActionMessage = result.message || "Nao foi possivel publicar no Instagram.";
  }
  await loadPerola();
  if (button) button.disabled = false;
}

function render() {
  renderOperationalStatus();
  renderEcosystemCards();
  renderRadarSignals();
  renderKpis();
  renderCampaignRanking();
  renderLeadRadar();
  renderStatus();
  renderPostEnginePreview();
  renderAlerts();
  renderGiro();
  renderPosts();
  renderRules();
  renderSales();
  renderCampaigns();
  renderChannels();
  renderCampaignFunnel();
  renderCampaignHistory();
  renderAudit();
  renderPayPerolaBridge();
  activateWorkspaceView(window.location.hash || "#radarInsano");
}

function setupSidebarDrawer() {
  const toggle = $("#perolaMenuToggle");
  const sidebar = $("#perolaSidebar");
  const hint = $("#perolaMenuHint");
  if (!toggle || !sidebar) return;
  const setOpen = (open) => {
    document.body.classList.toggle("perola-sidebar-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    sidebar.setAttribute("aria-hidden", String(!open));
  };
  setOpen(false);
  const modules = [...sidebar.querySelectorAll(".nav-module")];
  modules.forEach((module) => {
    module.addEventListener("toggle", () => {
      if (!module.open) return;
      modules.forEach((other) => {
        if (other !== module) other.open = false;
      });
    });
  });
  toggle.addEventListener("click", () => setOpen(!document.body.classList.contains("perola-sidebar-open")));
  sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function renderOperationalStatus() {
  const panel = $("#perolaOperationalStatus");
  if (!panel) return;
  const status = state.operationalStatus || {};
  const checks = status.checks || {};
  const mesaIntegration = status.mesaIntegration || {};
  panel.innerHTML = [
    statusItem("Modo", status.mode || "Simulado", status.mode === "Operacional" ? "live" : "simulated", status.mode === "Operacional" ? "Publisher real habilitado" : "Sem publisher real ativo"),
    statusItem("Fonte de dados", status.dataSource || "JSON teste", "source", status.dataSourceDetail || "Dados locais do modulo Perola"),
    statusItem("Publicacao", status.publication || "Desativada", publicationTone(status.publication), status.publicationDetail || "Sem envio externo confirmado"),
    statusItem("Mesa", mesaIntegration.realTime ? "Mesa real" : "JSON teste", mesaIntegration.realTime ? "live" : "source", mesaIntegration.realTime ? "Integracao em tempo real" : `Bridge local: ${Number(checks.giroReportItems || 0)} item(ns) de relatorio`)
  ].join("");
}

function statusItem(label, value, tone, detail) {
  return `
    <article class="operation-status-item ${esc(tone || "source")}">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(detail)}</small>
    </article>
  `;
}

function publicationTone(value = "") {
  const normalized = String(value).toLowerCase();
  if (normalized.includes("autom")) return "automatic";
  if (normalized.includes("manual")) return "manual";
  return "disabled";
}

function renderPayPerolaBridge() {
  const signals = $("#payPerolaSignals");
  const suggestions = $("#payPerolaSuggestions");
  if (!signals || !suggestions) return;

  signals.innerHTML = state.paySignals.length
    ? state.paySignals.slice(0, 6).map((signal) => bridgeItem(signal, "recebido do Pay")).join("")
    : empty("Nenhum sinal recebido do Pay até agora.");

  suggestions.innerHTML = state.paySuggestions.length
    ? state.paySuggestions.slice(0, 6).map((suggestion) => bridgeItem(suggestion, "enviada ao Pay")).join("")
    : empty("Nenhuma sugestão enviada ao Pay até agora.");
}

function bridgeItem(item = {}, fallbackStatus) {
  const title = item.titulo || item.title || item.tipo || item.type || item.id || "Registro comercial";
  const detail = item.descricao || item.description || item.message || item.resumo || item.summary || "Integração registrada no bridge local.";
  return `
    <article class="item bridge-item">
      <header>
        <div>
          <h3>${esc(title)}</h3>
          <small>${formatDateTime(item.registradoEm || item.createdAt)}</small>
        </div>
        <span class="status active">${esc(item.status || fallbackStatus)}</span>
      </header>
      <p>${esc(detail)}</p>
    </article>
  `;
}

function renderEcosystemCards() {
  const totals = state.summary?.totals || {};
  const giro = state.giro || {};
  const ideas = Array.isArray(state.postEnginePreview?.postIdeas) ? state.postEnginePreview.postIdeas.length : 0;
  const drafts = Array.isArray(state.postEngineDrafts) ? state.postEngineDrafts.length : 0;
  const opportunities = Number(giro.opportunitiesTotal || 0);
  const signals = state.radarSignals.length || (Number(totals.alerts || 0) + opportunities + drafts);
  setText("#radarSignalCount", signals);
  setText("#radarSignalDelta", signals ? "+38% vs ontem" : "+0% vs ontem");
  setText("#mesaCardMetric", opportunities || Number(giro.reportTotal || 0));
  setText("#mesaCardLabel", opportunities ? "promocoes ativas" : "itens no relatorio");
  setText("#sambahCardMetric", Number(totals.posts || 0) + drafts);
  setText("#sambahCardLabel", "sinais enviados");
  setText("#payCardMetric", Number(totals.waitingHuman || 0) + Number(totals.scheduled || 0));
  setText("#payCardLabel", "oportunidades de venda");
  setText("#studioCardMetric", ideas + drafts);
  setText("#studioCardLabel", "materiais gerados");
  setText("#mesaCardTime", lastSignalLabel(12));
  setText("#sambahCardTime", lastSignalLabel(7));
  setText("#payCardTime", lastSignalLabel(5));
  setText("#studioCardTime", lastSignalLabel(2));
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = String(value);
}

function lastSignalLabel(minutes) {
  return `Ultimo envio ${minutes} min atras`;
}

function navigateWorkspace(hash) {
  const targetHash = hash && hash.startsWith("#") ? hash : "#radarInsano";
  if (window.location.hash === targetHash) activateWorkspaceView(targetHash);
  else window.location.hash = targetHash;
  if (workspaceViewForHash(targetHash) === "materials" && !state.postEnginePreview) loadPostEnginePreview();
  if (["campaigns", "materials", "giro"].includes(workspaceViewForHash(targetHash))) ensurePermissions();
}

function workspaceViewForHash(hash = "") {
  if (["#campaignComposer", "#campaignsList", "#perolaCampaigns", "#perolaChannelsPanel", "#campaignFunnelPanel", "#campaignHistoryPanel"].includes(hash)) return "campaigns";
  if (["#postEngineBlock", "#postEngineCalendar", "#postEngineAdvancedInsights"].includes(hash)) return "materials";
  if (["#postComposer", "#postsList", "#auditList"].includes(hash)) return "publications";
  if (["#giroBlock", "#giroSummary", "#salesList"].includes(hash)) return "giro";
  if (["#perolaKpis", "#leadRadar", "#perolaAlertPanel"].includes(hash)) return "dashboard";
  if (hash === "#payPerolaBridge") return "pay";
  if (hash === "#perolaStatusPanel") return "status";
  return "radar";
}

function activateWorkspaceView(hash = "#radarInsano") {
  const targetHash = hash || "#radarInsano";
  const view = workspaceViewForHash(targetHash);
  document.body.dataset.perolaView = view;

  const overview = $("#perolaOverview");
  const campaigns = $("#perolaCampaigns");
  const pay = $("#payPerolaBridge");
  const moduleTabs = document.querySelector(".module-tabs");
  const footer = document.querySelector(".perola-footer");

  RADAR_SECTIONS.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) {
      element.hidden = view !== "radar";
      element.classList.toggle("workspace-page-active", view === "radar");
    }
  });
  if (moduleTabs) moduleTabs.hidden = true;
  if (footer) footer.hidden = true;
  if (pay) {
    pay.hidden = view !== "pay";
    pay.classList.toggle("workspace-page-active", view === "pay");
  }

  if (overview) {
    overview.hidden = !["materials", "publications", "giro", "status", "dashboard"].includes(view);
    [...overview.children].forEach((section) => {
      section.hidden = true;
      section.classList.remove("workspace-page-active");
    });
    if (!overview.hidden) {
      const requested = document.querySelector(targetHash);
      const section = directChildContaining(overview, requested);
      if (section) {
        section.hidden = false;
        section.classList.add("workspace-page-active");
        if (section.matches(".main-grid, .dashboard-insights")) {
          const focusedChild = directChildContaining(section, requested);
          [...section.children].forEach((child) => { child.hidden = Boolean(focusedChild) && child !== focusedChild; });
        }
      }
    }
  }

  if (campaigns) {
    campaigns.hidden = view !== "campaigns";
    campaigns.classList.toggle("workspace-page-active", view === "campaigns");
    if (view === "campaigns") configureCampaignWorkspace(targetHash, campaigns);
  }

  setActiveSideNavForHash();
  const main = document.querySelector(".perola-main");
  if (main) main.scrollTop = 0;
  requestAnimationFrame(paginateActiveCollections);
}

function directChildContaining(parent, element) {
  let current = element;
  while (current && current.parentElement !== parent) current = current.parentElement;
  return current?.parentElement === parent ? current : null;
}

function configureCampaignWorkspace(hash, campaigns) {
  const head = campaigns.querySelector(":scope > .block-head");
  const composer = $("#campaignComposer");
  const catalogTools = $("#campaignCatalogTools");
  const pagination = $("#campaignPagination");
  const dynamicPanels = [$("#perolaChannelsPanel"), $("#campaignFunnelPanel"), $("#campaignHistoryPanel")].filter(Boolean);
  if (head) head.hidden = true;
  if (composer) composer.hidden = true;
  if (catalogTools) catalogTools.hidden = true;
  if (pagination) pagination.hidden = true;
  dynamicPanels.forEach((panel) => { panel.hidden = true; });

  if (hash === "#perolaChannelsPanel" || hash === "#campaignFunnelPanel" || hash === "#campaignHistoryPanel") {
    const panel = document.querySelector(hash);
    if (panel) panel.hidden = false;
    return;
  }

  if (!composer) return;
  composer.hidden = false;
  const form = $("#campaignForm");
  const list = $("#campaignsList");
  const title = composer.querySelector(".panel-head h2");
  const listOnly = hash === "#campaignsList" || hash === "#perolaCampaigns";
  if (form) form.hidden = listOnly;
  if (list) list.hidden = !listOnly;
  if (catalogTools) catalogTools.hidden = !listOnly;
  if (pagination) pagination.hidden = !listOnly;
  if (title) title.textContent = listOnly ? "Campanhas salvas" : "Criar campanha";
}

function paginateActiveCollections() {
  const activeRoot = document.querySelector(".workspace-page-active:not([hidden])") || document.querySelector("#perolaOverview:not([hidden])");
  if (!activeRoot) return;
  const containers = [...activeRoot.querySelectorAll(".list, .radar-signals-grid, .channels-grid, .post-ideas-list")]
    .filter((container) => container.id !== "campaignsList" && container.children.length > 6);
  containers.forEach((container, index) => paginateDomCollection(container, index));
}

function paginateDomCollection(container, index) {
  const owner = container.id || `collection-${index}`;
  document.querySelectorAll(`[data-pager-owner="${CSS.escape(owner)}"]`).forEach((element) => element.remove());
  const items = [...container.children];
  if (items.length <= 6) return;
  let page = 1;
  let query = "";
  const search = document.createElement("label");
  search.className = "collection-search";
  search.dataset.pagerOwner = owner;
  search.innerHTML = `<span>Buscar nesta area</span><input type="search" placeholder="Buscar card" autocomplete="off">`;
  const nav = document.createElement("nav");
  nav.className = "collection-pagination";
  nav.dataset.pagerOwner = owner;
  nav.setAttribute("aria-label", "Paginas desta area");
  container.before(search);
  container.after(nav);

  const draw = () => {
    const filtered = items.filter((item) => item.textContent.toLowerCase().includes(query));
    const pages = Math.max(1, Math.min(50, Math.ceil(filtered.length / 6)));
    page = Math.min(page, pages);
    const visible = new Set(filtered.slice((page - 1) * 6, page * 6));
    items.forEach((item) => { item.hidden = !visible.has(item); });
    nav.innerHTML = paginationMarkup(page, pages, filtered.length);
    nav.querySelector("select")?.addEventListener("change", (event) => { page = Number(event.target.value); draw(); });
    nav.querySelector("[data-page-prev]")?.addEventListener("click", () => { page = Math.max(1, page - 1); draw(); });
    nav.querySelector("[data-page-next]")?.addEventListener("click", () => { page = Math.min(pages, page + 1); draw(); });
  };
  search.querySelector("input").addEventListener("input", (event) => {
    query = event.target.value.trim().toLowerCase();
    page = 1;
    draw();
  });
  draw();
}

function paginationMarkup(page, pages, total) {
  const options = Array.from({ length: pages }, (_, index) => `<option value="${index + 1}" ${index + 1 === page ? "selected" : ""}>${index + 1}</option>`).join("");
  return `<button type="button" data-page-prev ${page === 1 ? "disabled" : ""}>Anterior</button><span>Pagina</span><select aria-label="Pagina atual">${options}</select><span>de ${pages} | ${total} cards</span><button type="button" data-page-next ${page === pages ? "disabled" : ""}>Proxima</button>`;
}

function setActiveSideNav(activeLink) {
  document.querySelectorAll(".side-nav a").forEach((link) => {
    link.classList.toggle("active", link === activeLink);
  });
  document.querySelectorAll(".nav-module").forEach((module) => {
    module.classList.toggle("is-active", Boolean(activeLink && module.contains(activeLink)));
  });
}

function setActiveSideNavForHash() {
  const hash = window.location.hash || "#radarInsano";
  const links = [...document.querySelectorAll(".side-nav a")];
  const scoped = state.activeNavModule
    ? links.find((link) => link.closest(".nav-module")?.dataset.navModule === state.activeNavModule && link.getAttribute("href") === hash)
    : null;
  setActiveSideNav(scoped || links.find((link) => link.getAttribute("href") === hash));
}

function defaultCampaignDate() {
  return new Date().toISOString().slice(0, 10);
}

function setDefaultCampaignDates() {
  const form = $("#campaignForm");
  if (!form || state.editingCampaignId) return;
  const today = defaultCampaignDate();
  if (form.elements.startDate && !form.elements.startDate.value) form.elements.startDate.value = today;
  if (form.elements.endDate && !form.elements.endDate.value) form.elements.endDate.value = today;
}

function renderRadarSignals() {
  const container = ensureRadarSignalsPanel();
  if (!container) return;
  container.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Radar Insano</p>
        <h2>Sinais do Ecossistema</h2>
      </div>
      <span class="status active">${state.radarSignals.length} ${state.radarSignals.length === 1 ? "sinal" : "sinais"}</span>
    </div>
    ${state.campaignActionMessage ? `<p class="campaign-action-message">${esc(state.campaignActionMessage)}</p>` : ""}
    <div class="radar-signals-grid">
      ${state.radarSignals.length ? state.radarSignals.map((signal) => `
        <article class="item radar-signal-item priority-${esc(signal.priority || "medium")}">
          <header>
            <div>
              <h3>${esc(signal.title || signal.id)}</h3>
              <small>${esc(signal.sourceModule || "Perola")} | ${formatDateTime(signal.createdAt)}</small>
            </div>
            <span class="status">${esc(signal.priority || "medium")}</span>
          </header>
          <p>${esc(signal.description || "Sinal local do Radar Insano.")}</p>
          <dl class="meta-grid">
            <div><dt>Tipo</dt><dd>${esc(signal.type || "-")}</dd></div>
            <div><dt>Produto</dt><dd>${esc(signal.productName || "-")}</dd></div>
            <div><dt>Vendas</dt><dd>${Number(signal.salesCount || 0)}</dd></div>
          </dl>
          <div class="item-actions">
            <button type="button" data-generate-signal-campaign="${esc(signal.id)}">Gerar campanha</button>
          </div>
        </article>
      `).join("") : empty("Nenhum sinal local cadastrado no Radar.")}
    </div>
  `;
  container.querySelectorAll("[data-generate-signal-campaign]").forEach((button) => {
    button.addEventListener("click", () => generateCampaignFromSignal(button.dataset.generateSignalCampaign));
  });
}

function ensureRadarSignalsPanel() {
  let container = $("#radarSignalsPanel");
  if (container) return container;
  const overview = $("#perolaOverview");
  if (!overview) return null;
  container = document.createElement("article");
  container.id = "radarSignalsPanel";
  container.className = "panel radar-signals-panel";
  overview.insertBefore(container, overview.firstChild);
  return container;
}

function renderChannels() {
  const container = ensureChannelsPanel();
  if (!container) return;
  const activeTotal = state.channels.filter((channel) => channel.enabled).length;
  container.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Distribuicao simulada</p>
        <h2>Canais</h2>
      </div>
      <span class="status active">${activeTotal} ativo${activeTotal === 1 ? "" : "s"}</span>
    </div>
    <div class="channels-grid">
      ${state.channels.length ? state.channels.map((channel) => `
        <article class="item channel-item ${channel.enabled ? "is-enabled" : "is-disabled"}">
          <header>
            <div>
              <h3>${esc(channel.name || channel.id)}</h3>
              <small>${esc(channel.mode || "simulated")} | ${esc(channel.type || "canal")}</small>
            </div>
            <span class="status ${channel.enabled ? "active" : ""}">${channel.enabled ? "ativo" : "inativo"}</span>
          </header>
          <dl class="meta-grid">
            <div><dt>Formato</dt><dd>${esc((channel.formatsSupported || []).join(", ") || "-")}</dd></div>
            <div><dt>Limite diario</dt><dd>${Number(channel.dailyLimit || 0)}</dd></div>
            <div><dt>Hoje</dt><dd>${Number(channel.distributedToday || 0)}</dd></div>
            <div><dt>Ultimo envio</dt><dd>${formatDateTime(channel.lastDistributedAt)}</dd></div>
          </dl>
          <div class="item-actions">
            <button type="button" data-toggle-channel="${esc(channel.id)}" data-channel-enabled="${channel.enabled ? "false" : "true"}" ${permissionButtonState("campaign_update")}>
              ${channel.enabled ? "Desativar" : "Ativar"}
            </button>
          </div>
        </article>
      `).join("") : empty("Nenhum canal local cadastrado.")}
    </div>
  `;
  container.querySelectorAll("[data-toggle-channel]").forEach((button) => {
    button.addEventListener("click", () => toggleChannel(button.dataset.toggleChannel, button.dataset.channelEnabled === "true"));
  });
}

function ensureChannelsPanel() {
  let container = $("#perolaChannelsPanel");
  if (container) return container;
  const campaignsSection = $("#perolaCampaigns");
  if (!campaignsSection) return null;
  container = document.createElement("article");
  container.id = "perolaChannelsPanel";
  container.className = "panel channels-panel";
  campaignsSection.appendChild(container);
  return container;
}

function renderCampaigns() {
  const list = $("#campaignsList");
  const count = $("#campaignCount");
  const search = $("#campaignSearch");
  const pagination = $("#campaignPagination");
  if (!list || !count) return;
  const sorted = [...state.campaigns].sort((left, right) => campaignTime(right) - campaignTime(left));
  const query = state.campaignQuery.trim().toLowerCase();
  const filtered = sorted.filter((campaign) => [campaign.title, campaign.objective, campaign.description, campaign.status, campaign.id]
    .some((value) => String(value || "").toLowerCase().includes(query)));
  const pages = Math.max(1, Math.min(50, Math.ceil(filtered.length / 6)));
  state.campaignPage = Math.min(Math.max(1, state.campaignPage), pages);
  const visibleCampaigns = filtered.slice((state.campaignPage - 1) * 6, state.campaignPage * 6);
  count.textContent = `${filtered.length} campanha${filtered.length === 1 ? "" : "s"}`;
  list.innerHTML = visibleCampaigns.length
    ? visibleCampaigns.map((campaign) => `
      <article class="item campaign-item priority-${esc(campaign.priority)}" data-campaign-id="${esc(campaign.id)}">
        <header>
          <div>
            <div class="campaign-title-row">
              <h3>${esc(campaign.title)}</h3>
              ${campaign.priority === "high" ? '<span class="campaign-priority-badge">ALTA PRIORIDADE</span>' : ""}
            </div>
            <p class="campaign-objective">${esc(campaign.objective || "Objetivo não informado")}</p>
            <small>${esc(campaign.id)}</small>
          </div>
          <span class="status ${campaign.status === "active" ? "active" : ""}">${esc(campaign.status)}</span>
        </header>
        <p>${esc(campaign.description || "Sem descricao")}</p>
        <dl class="meta-grid">
          <div><dt>Prioridade</dt><dd>${esc(campaign.priority)}</dd></div>
          <div><dt>Inicio</dt><dd>${formatDateOnly(campaign.startDate)}</dd></div>
          <div><dt>Fim</dt><dd>${formatDateOnly(campaign.endDate)}</dd></div>
        </dl>
        <details class="campaign-card-details">
          <summary>Ver detalhes</summary>
          ${renderCampaignLeadershipBadge(campaign)}
          ${renderCampaignRank(campaign)}
          ${renderCampaignScore(campaign)}
          <dl class="meta-grid">
            <div><dt>Drafts vinculados</dt><dd>${Number(campaign.draftsTotal || campaign.draftCounters?.total || 0)}</dd></div>
            <div><dt>Aprovados</dt><dd>${Number(campaign.draftsApproved || campaign.draftCounters?.approved || 0)}</dd></div>
            <div><dt>Agendados</dt><dd>${Number(campaign.draftsScheduled || campaign.draftCounters?.scheduled || 0)}</dd></div>
          </dl>
          ${renderCampaignCommercialInsight(campaign)}
          ${renderCampaignMedia(campaign)}
          ${renderCampaignReadyMaterial(campaign)}
          ${renderChannelSelector(campaign)}
        </details>
        <div class="item-actions">
          <button type="button" data-create-campaign-publication="${esc(campaign.id)}" ${campaign.mediaUrl ? "" : "disabled title=\"Informe a URL publica da midia na campanha\""}>Criar publicacao</button>
          <button type="button" data-create-campaign-draft="${esc(campaign.id)}" ${permissionButtonState("draft_create")}>Criar Draft</button>
          <button type="button" data-edit-campaign="${esc(campaign.id)}" ${permissionButtonState("campaign_update")}>Editar</button>
          ${campaign.status !== "approved" ? `<button type="button" data-approve-campaign="${esc(campaign.id)}" ${permissionButtonState("campaign_update")}>Aprovar</button>` : ""}
          ${campaign.status !== "rejected" ? `<button type="button" data-reject-campaign="${esc(campaign.id)}" ${permissionButtonState("campaign_update")}>Rejeitar</button>` : ""}
          <button type="button" data-distribute-campaign="${esc(campaign.id)}" ${campaign.status === "approved" ? "" : "disabled title=\"Campanha precisa estar aprovada\""}>Distribuir</button>
          <button type="button" data-delete-campaign="${esc(campaign.id)}" title="Excluir campanha; perfil Administrador ou Operador necessario">Excluir</button>
        </div>
      </article>
    `).join("")
    : empty(query ? "Nenhuma campanha encontrada para esta busca." : "Nenhuma campanha cadastrada.");
  if (search) {
    search.value = state.campaignQuery;
    search.oninput = (event) => {
      state.campaignQuery = event.target.value;
      state.campaignPage = 1;
      renderCampaigns();
    };
  }
  if (pagination) {
    pagination.innerHTML = paginationMarkup(state.campaignPage, pages, filtered.length);
    pagination.querySelector("select")?.addEventListener("change", (event) => {
      state.campaignPage = Number(event.target.value);
      renderCampaigns();
    });
    pagination.querySelector("[data-page-prev]")?.addEventListener("click", () => {
      state.campaignPage = Math.max(1, state.campaignPage - 1);
      renderCampaigns();
    });
    pagination.querySelector("[data-page-next]")?.addEventListener("click", () => {
      state.campaignPage = Math.min(pages, state.campaignPage + 1);
      renderCampaigns();
    });
  }
  list.querySelectorAll("[data-edit-campaign]").forEach((button) => {
    button.addEventListener("click", () => editCampaign(button.dataset.editCampaign));
  });
  list.querySelectorAll("[data-delete-campaign]").forEach((button) => {
    button.addEventListener("click", () => deleteCampaign(button.dataset.deleteCampaign));
  });
  list.querySelectorAll("[data-create-campaign-draft]").forEach((button) => {
    button.addEventListener("click", () => openCampaignDraftForm(button.dataset.createCampaignDraft));
  });
  list.querySelectorAll("[data-create-campaign-publication]").forEach((button) => {
    button.addEventListener("click", () => createCampaignPublication(button.dataset.createCampaignPublication));
  });
  list.querySelectorAll("[data-approve-campaign]").forEach((button) => {
    button.addEventListener("click", () => approveCampaign(button.dataset.approveCampaign));
  });
  list.querySelectorAll("[data-reject-campaign]").forEach((button) => {
    button.addEventListener("click", () => rejectCampaign(button.dataset.rejectCampaign));
  });
  list.querySelectorAll("[data-distribute-campaign]").forEach((button) => {
    button.addEventListener("click", () => distributeCampaign(button.dataset.distributeCampaign));
  });
  const saveButton = $("#saveCampaign");
  if (saveButton) saveButton.disabled = !can(state.editingCampaignId ? "campaign_update" : "campaign_create");
}

function campaignTime(campaign = {}) {
  return Date.parse(campaign.createdAt || campaign.updatedAt || campaign.startDate || "") || 0;
}

function renderChannelSelector(campaign = {}) {
  const activeChannels = state.channels.filter((channel) => channel.enabled);
  if (campaign.status !== "approved") {
    return "";
  }
  return `
    <aside class="campaign-channel-selector">
      <strong>Canais ativos</strong>
      <div class="channel-choice-grid">
        ${activeChannels.length ? activeChannels.map((channel) => `
          <label class="channel-choice">
            <input type="checkbox" data-channel-campaign="${esc(campaign.id)}" value="${esc(channel.id)}" checked>
            <span>
              <b>${esc(channel.name || channel.id)}</b>
              <small>${esc((channel.formatsSupported || []).join(", ") || "simulated")} | ${Number(channel.distributedToday || 0)}/${Number(channel.dailyLimit || 0)}</small>
            </span>
          </label>
        `).join("") : "<p>Nenhum canal ativo para distribuicao.</p>"}
      </div>
    </aside>
  `;
}

function renderCampaignReadyMaterial(campaign = {}) {
  const material = campaign.readyMaterial || {};
  if (!material.postText && !material.whatsappText && !material.statusText) return "";
  return `
    <aside class="campaign-ready-material">
      <strong>Material pronto</strong>
      <p>${esc(material.postText || "")}</p>
      <small>${esc(material.cta || "")}</small>
    </aside>
  `;
}

function renderCampaignMedia(campaign = {}) {
  if (!campaign.mediaUrl && !campaign.caption) return "";
  return `
    <aside class="campaign-ready-material campaign-media-summary">
      <strong>Midia da campanha</strong>
      ${campaign.mediaUrl ? `<p>${esc(campaign.mediaType || "IMAGE")} | <a href="${esc(campaign.mediaUrl)}" target="_blank" rel="noopener">abrir midia publica</a></p>` : "<p>Sem URL publica de midia.</p>"}
      ${campaign.caption ? `<small>${esc(shortText(campaign.caption, 140))}</small>` : ""}
    </aside>
  `;
}

function renderCampaignFunnel() {
  const container = ensureCampaignFunnelPanel();
  if (!container) return;
  const stages = [
    { id: "atrair", label: "Atrair" },
    { id: "qualificar", label: "Qualificar" },
    { id: "remodelar", label: "Remodelar" },
    { id: "converter", label: "Converter" },
    { id: "encantar", label: "Encantar" }
  ];
  const grouped = stages.reduce((map, stage) => ({ ...map, [stage.id]: [] }), {});
  for (const campaign of state.campaigns) {
    const stage = grouped[campaign.funnelStage] ? campaign.funnelStage : "qualificar";
    grouped[stage].push(campaign);
  }
  container.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Funil local</p>
        <h2>Campanhas por Funil</h2>
      </div>
      <span class="status active">${state.campaigns.length} campanha${state.campaigns.length === 1 ? "" : "s"}</span>
    </div>
    <div class="campaign-funnel-grid">
      ${stages.map((stage) => `
        <section class="campaign-funnel-column">
          <header>
            <h3>${stage.label}</h3>
            <span>${grouped[stage.id].length}</span>
          </header>
          <div class="list compact">
            ${grouped[stage.id].length ? grouped[stage.id].map(renderCampaignFunnelItem).join("") : empty("Sem campanhas nesta etapa.")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function renderCampaignHistory() {
  const container = ensureCampaignHistoryPanel();
  if (!container) return;
  const history = state.campaignHistory || {};
  const totals = history.totals || {};
  container.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Historico local</p>
        <h2>Rotinas do Perola</h2>
      </div>
      <span class="status">${Number(totals.distributed || 0)} distribuida${Number(totals.distributed || 0) === 1 ? "" : "s"}</span>
    </div>
    <section class="kpis campaign-history-kpis">
      ${kpi("Criadas", Number(totals.created || 0))}
      ${kpi("Aprovadas", Number(totals.approved || 0))}
      ${kpi("Rejeitadas", Number(totals.rejected || 0))}
      ${kpi("Distribuidas", Number(totals.distributed || 0))}
      ${kpi("Mesa", Number(totals.mesaInteractions || 0))}
    </section>
    <div class="campaign-history-grid">
      ${renderHistoryColumn("Aprovadas", history.approvedCampaigns || [], "approvedAt")}
      ${renderHistoryColumn("Rejeitadas", history.rejectedCampaigns || [], "rejectedAt")}
      ${renderDistributionHistory(history.distributedCampaigns || [])}
      ${renderMesaInteractionHistory(history.mesaInteractions || [])}
    </div>
  `;
}

function ensureCampaignHistoryPanel() {
  let container = $("#campaignHistoryPanel");
  if (container) return container;
  const campaignsSection = $("#perolaCampaigns");
  if (!campaignsSection) return null;
  container = document.createElement("article");
  container.id = "campaignHistoryPanel";
  container.className = "panel campaign-history-panel";
  campaignsSection.appendChild(container);
  return container;
}

function renderHistoryColumn(title, campaigns = [], dateField = "createdAt") {
  return `
    <section class="campaign-history-column">
      <h3>${esc(title)}</h3>
      <div class="list compact">
        ${campaigns.length ? campaigns.slice(0, 6).map((campaign) => `
          <article class="item">
            <h4>${esc(campaign.title || campaign.id)}</h4>
            <p>${esc(campaign.productName || campaign.objective || "Campanha local")}</p>
            <small>${formatDateTime(campaign[dateField] || campaign.createdAt)}</small>
          </article>
        `).join("") : empty("Sem registros.")}
      </div>
    </section>
  `;
}

function renderDistributionHistory(distributions = []) {
  return `
    <section class="campaign-history-column">
      <h3>Distribuidas</h3>
      <div class="list compact">
        ${distributions.length ? distributions.slice(0, 6).map((distribution) => `
          <article class="item">
            <h4>${esc(distribution.campaignId)}</h4>
            <p>${esc(distributionChannelLabel(distribution))}</p>
            <small>${formatDateTime(distribution.createdAt)}</small>
          </article>
        `).join("") : empty("Sem distribuicoes locais.")}
      </div>
    </section>
  `;
}

function distributionChannelLabel(distribution = {}) {
  const channels = Array.isArray(distribution.channels) && distribution.channels.length
    ? distribution.channels.map((channel) => channel.name || channel.id)
    : (distribution.sentToChannels || []);
  return channels.length ? channels.join(", ") : (distribution.sentToModules || []).join(", ");
}

function renderMesaInteractionHistory(interactions = []) {
  return `
    <section class="campaign-history-column">
      <h3>Mesa Xeriffe</h3>
      <div class="list compact">
        ${interactions.length ? interactions.slice(0, 6).map((interaction) => `
          <article class="item">
            <h4>${esc(interaction.payload?.title || interaction.campaignId)}</h4>
            <p>${esc(interaction.receiver || "receivePerolaCommercialAction")} | ${esc(interaction.payload?.mesaStatus || interaction.status)}</p>
            <small>${formatDateTime(interaction.createdAt)}</small>
          </article>
        `).join("") : empty("Sem interacoes com o Mesa.")}
      </div>
    </section>
  `;
}

function ensureCampaignFunnelPanel() {
  let container = $("#campaignFunnelPanel");
  if (container) return container;
  const campaignsSection = $("#perolaCampaigns");
  if (!campaignsSection) return null;
  container = document.createElement("article");
  container.id = "campaignFunnelPanel";
  container.className = "panel campaign-funnel-panel";
  campaignsSection.appendChild(container);
  return container;
}

function renderCampaignFunnelItem(campaign = {}) {
  return `
    <article class="item campaign-funnel-item">
      <h4>${esc(campaign.title || campaign.id)}</h4>
      <p>${esc(campaign.productName || campaign.objective || "Campanha local")}</p>
      <small>${esc(campaign.status || "draft")} | ${esc(campaign.sourceSignalId || campaign.id)}</small>
    </article>
  `;
}

function renderCampaignLeadershipBadge(campaign = {}) {
  if (Number(campaign.campaignRank) !== 1) return "";
  return "<p>🏆 Líder da semana</p>";
}

function renderCampaignRank(campaign = {}) {
  if (!campaign.campaignRank) return "";
  return `<p>Ranking da campanha: #${esc(campaign.campaignRank)}</p>`;
}

function renderCampaignScore(campaign = {}) {
  if (!campaign.campaignScore) return "";
  return `<p>Pontuação comercial: ${esc(campaign.campaignScore)}</p>`;
}

function renderCampaignCommercialInsight(campaign = {}) {
  const insight = campaign.commercialInsight;
  if (!insight) return "";
  return `
    <aside class="campaign-commercial-insight">
      <strong>${esc(insight.title || "Insight comercial")}</strong>
      <span>${esc(insight.message)}</span>
    </aside>
  `;
}

function editCampaign(id) {
  const campaign = state.campaigns.find((item) => item.id === id);
  const form = $("#campaignForm");
  if (!campaign || !form) return;
  state.editingCampaignId = id;
  for (const field of ["id", "title", "description", "objective", "status", "priority", "startDate", "endDate", "mediaUrl", "mediaType", "caption"]) {
    if (form.elements[field]) form.elements[field].value = campaign[field] || "";
  }
  form.elements.id.disabled = true;
  $("#saveCampaign").textContent = "Atualizar campanha";
  $("#cancelCampaignEdit").hidden = false;
  $("#campaignMessage").textContent = `Editando ${campaign.title}.`;
  renderCampaigns();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetCampaignForm() {
  const form = $("#campaignForm");
  if (!form) return;
  state.editingCampaignId = "";
  form.reset();
  form.elements.id.disabled = false;
  form.elements.priority.value = "medium";
  if (form.elements.mediaType) form.elements.mediaType.value = "IMAGE";
  setDefaultCampaignDates();
  $("#saveCampaign").textContent = "Salvar campanha";
  $("#cancelCampaignEdit").hidden = true;
  renderCampaigns();
}

function renderStatus() {
  let panel = $("#perolaStatusPanel");
  if (!panel) return;
  const health = state.health || {};
  const diagnostics = state.diagnostics || {};
  panel.innerHTML = [
    kpi("Status", health.status || diagnostics.status || "-"),
    kpi("Storage", health.storage || diagnostics.storage || "-"),
    kpi("Backups", health.backups || diagnostics.backups || "-"),
    kpi("Posts", diagnostics.posts ?? 0),
    kpi("Rules", diagnostics.rules ?? 0),
    kpi("Alerts", diagnostics.alerts ?? 0),
    kpi("Audit", diagnostics.audit ?? 0)
  ].join("");
}

function renderPostEnginePreview() {
  const message = $("#postEngineMessage");
  const insightsPanel = $("#postEngineInsights");
  const ideasList = $("#postEngineIdeas");
  const draftsList = $("#postEngineDrafts");
  const calendarList = $("#postEngineCalendar");
  const advancedInsights = $("#postEngineAdvancedInsights");
  const roleHint = $("#perolaRoleHint");
  const intelligentGiroButton = $("#runIntelligentGiro");
  if (!message || !insightsPanel || !ideasList || !draftsList || !calendarList || !advancedInsights) return;
  if (roleHint) roleHint.textContent = permissionSummary();
  renderCampaignDraftForm(draftsList);
  renderDraftCampaignFilter(draftsList);
  if (intelligentGiroButton) {
    intelligentGiroButton.disabled = !can("giro_intelligent_run");
    intelligentGiroButton.title = can("giro_intelligent_run") ? "" : `Perfil ${state.activeRole} sem permissao`;
  }

  if (state.postEngineError) {
    message.textContent = state.postEngineError;
    message.classList.toggle("error", !state.postEngineError.startsWith("Draft criado:"));
    if (!state.postEnginePreview) {
      insightsPanel.innerHTML = "";
      ideasList.innerHTML = "";
      draftsList.innerHTML = renderPostEngineDrafts();
      return;
    }
  }

  const preview = state.postEnginePreview;
  if (!preview) {
    message.textContent = "Carregando ideias do Motor de Posts...";
    message.classList.remove("error");
    insightsPanel.innerHTML = "";
    ideasList.innerHTML = "";
    draftsList.innerHTML = renderPostEngineDrafts();
    return;
  }

  const insights = preview.insights || {};
  const postIdeas = Array.isArray(preview.postIdeas) ? preview.postIdeas : [];
  message.textContent = `Prévia gerada em ${formatDateTime(preview.generatedAt)} a partir de ${esc(preview.source)}.`;
  message.classList.remove("error");
  if (state.postEngineNotice) {
    message.textContent = state.postEngineNotice;
  }
  insightsPanel.innerHTML = [
    kpi("Produto mais vendido", productLabel(insights.topSellingProduct, "quantity")),
    kpi("Maior faturamento", productLabel(insights.highestRevenueProduct, "revenue")),
    kpi("Melhor horário", insights.bestHour || "-"),
    kpi("Melhor dia", insights.bestDay || "-"),
    kpi("Drafts criados", state.postEngineStats?.draftsCreated || 0),
    kpi("Aprovados", state.postEngineStats?.draftsApproved || 0),
    kpi("Agendados", state.postEngineStats?.draftsScheduled || 0),
    kpi("Ideias / insights", `${state.postEngineStats?.ideasGenerated || 0} / ${state.postEngineStats?.insightsGenerated || 0}`)
  ].join("");
  ideasList.innerHTML = postIdeas.length
    ? postIdeas.map((idea, index) => `
      <article class="item post-engine-idea">
        <header>
          <div>
            <h3>${index + 1}. ${esc(idea.title || idea.type || "Ideia de post")}</h3>
            <small>${esc(idea.type || "post")}</small>
          </div>
          <span class="status active">sugestão</span>
        </header>
        <p>${esc(idea.idea || "")}</p>
        <small>${esc(idea.suggestedCaption || "")}</small>
        <div class="score-strip">
          <span>Relevancia <strong>${Number(idea.relevanceScore || 0)}</strong></span>
          <span>Venda <strong>${Number(idea.salesPotentialScore || 0)}</strong></span>
          <span>Urgencia <strong>${Number(idea.urgencyScore || 0)}</strong></span>
          <span>Score <strong>${Number(idea.score || 0)}</strong></span>
        </div>
        <div class="item-actions">
          <button type="button" data-create-post-engine-draft="${index}" ${permissionButtonState("draft_create")}>Criar draft</button>
        </div>
      </article>
    `).join("")
    : empty("Nenhuma ideia do Motor de Posts retornada agora.");
  ideasList.querySelectorAll("[data-create-post-engine-draft]").forEach((button) => {
    button.addEventListener("click", () => createPostEngineDraft(Number(button.dataset.createPostEngineDraft)));
  });
  draftsList.innerHTML = renderPostEngineDrafts();
  bindPostEngineDraftActions(draftsList);
  calendarList.innerHTML = renderPostEngineCalendar();
  advancedInsights.innerHTML = renderAdvancedInsights(insights);
  renderClaudeVariations();
}

function renderClaudeVariations() {
  const container = $("#claudeVariations");
  if (!container) return;
  if (state.claudeError) {
    container.innerHTML = `<article class="item"><p class="error">${esc(state.claudeError)}</p></article>`;
    return;
  }
  if (!state.claudeVariations) {
    container.innerHTML = empty(state.claudeMessage || "Informe uma ideia e gere variacoes com tom humano do Insano.");
    return;
  }
  const variations = state.claudeVariations.variations || {};
  const labels = [
    ["Instagram", variations.instagramCaption],
    ["WhatsApp", variations.whatsappShort],
    ["Chamada para arte", variations.artCall],
    ["Mais emocional", variations.emotionalVersion],
    ["Venda direta", variations.directSalesVersion],
  ];
  container.innerHTML = `
    <article class="item claude-status">
      <header>
        <div>
          <h3>Assistente criativo ativo</h3>
          <small>${esc(state.claudeVariations.provider || "local")}</small>
        </div>
        <span class="status active">${esc(state.claudeVariations.mode || "local")}</span>
      </header>
      <p>${esc(state.claudeMessage || "Variacoes prontas.")}</p>
    </article>
    ${labels.map(([label, text]) => `
      <article class="item claude-copy-card">
        <header>
          <h3>${esc(label)}</h3>
          <span class="status active">pronto</span>
        </header>
        <p>${esc(text || "")}</p>
      </article>
    `).join("")}
  `;
}

function renderPostEngineDrafts() {
  const drafts = filteredPostEngineDrafts();
  return drafts.length
    ? drafts.map((draft) => `
      <article class="item post-engine-draft">
        <header>
          <div>
            <h3>${esc(draft.title)}</h3>
            <small>${formatDateTime(draft.createdAt)}</small>
          </div>
          <span class="status active">${esc(draft.status)}</span>
        </header>
        <p>${esc(draft.ideaType)} | ${esc(draft.body)}</p>
        <small>Campanha: ${esc(draftCampaignName(draft))}</small>
        <small>${esc(draft.cta || "")} ${(draft.hashtags || []).map(esc).join(" ")}</small>
        <label class="inline-campaign">Campanha
          <select data-draft-campaign="${esc(draft.id)}" ${permissionButtonState("draft_update")}>
            ${campaignOptions(draft.campaignId)}
          </select>
        </label>
        <div class="item-actions">
          ${draft.status === "draft" ? `<button type="button" data-draft-status="pending_review" data-draft-id="${esc(draft.id)}" ${permissionButtonState("draft_submit_review")}>Enviar para revisao</button>` : ""}
          ${draft.status === "pending_review" ? `<button type="button" data-draft-status="approved" data-draft-id="${esc(draft.id)}" ${permissionButtonState("draft_approve")}>Aprovar</button><button type="button" data-draft-status="rejected" data-draft-id="${esc(draft.id)}" ${permissionButtonState("draft_reject")}>Rejeitar</button>` : ""}
          ${draft.status === "approved" ? `<button type="button" data-draft-status="scheduled" data-draft-id="${esc(draft.id)}" ${permissionButtonState("draft_schedule")}>Agendar +1h</button>` : ""}
          <button type="button" data-delete-draft="${esc(draft.id)}" ${permissionButtonState("draft_delete")}>Excluir</button>
        </div>
      </article>
    `).join("")
    : empty(state.draftCampaignFilter ? "Nenhum draft encontrado para esta campanha." : "Nenhum draft interno criado pelo Motor de Posts.");
}

function renderCampaignDraftForm(anchor) {
  const wrapper = ensureCampaignDraftForm(anchor);
  if (!wrapper) return;
  if (!state.campaignDraftForm.open) {
    wrapper.hidden = true;
    wrapper.innerHTML = "";
    return;
  }
  wrapper.hidden = false;
  const campaign = state.campaigns.find((item) => item.id === state.campaignDraftForm.campaignId);
  wrapper.innerHTML = `
    <form id="campaignDraftForm" class="item campaign-draft-form">
      <header>
        <div>
          <h3>Novo draft</h3>
          <small>${esc(campaign ? campaign.title || campaign.id : "Campanha selecionada")}</small>
        </div>
        <span class="status active">draft</span>
      </header>
      <div class="rule-grid">
        <label>Campanha
          <select name="campaignId" required>
            ${campaignOptions(state.campaignDraftForm.campaignId)}
          </select>
        </label>
        <label>Tipo
          <select name="type">
            <option value="promocao">Promocao</option>
            <option value="campanha_dia_forte">Campanha do dia</option>
            <option value="produto_campeao">Produto campeao</option>
            <option value="urgencia">Urgencia</option>
          </select>
        </label>
        <label class="wide">Titulo<input name="title" required value="${esc(campaign ? `Draft para ${campaign.title || campaign.id}` : "Novo draft de campanha")}"></label>
        <label class="wide">Texto<textarea name="description" required>${esc(campaign ? `Conteudo planejado para a campanha ${campaign.title || campaign.id}.` : "Conteudo planejado para a campanha.")}</textarea></label>
      </div>
      <div class="item-actions">
        <span class="${state.campaignDraftForm.error ? "error" : ""}">${esc(state.campaignDraftForm.error || state.campaignDraftForm.message)}</span>
        <button class="primary" type="submit">Salvar draft</button>
        <button type="button" data-close-campaign-draft>Cancelar</button>
      </div>
    </form>
  `;
  const form = wrapper.querySelector("#campaignDraftForm");
  if (form) form.addEventListener("submit", saveCampaignDraft);
  wrapper.querySelector("[data-close-campaign-draft]")?.addEventListener("click", closeCampaignDraftForm);
}

function ensureCampaignDraftForm(anchor) {
  if (!anchor) return null;
  let wrapper = $("#campaignDraftFormWrap");
  if (wrapper) return wrapper;
  wrapper = document.createElement("div");
  wrapper.id = "campaignDraftFormWrap";
  anchor.insertAdjacentElement("beforebegin", wrapper);
  return wrapper;
}

function bindPostEngineDraftActions(container) {
  container.querySelectorAll("[data-draft-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const patch = { status: button.dataset.draftStatus };
      if (patch.status === "scheduled") patch.scheduledAt = new Date(Date.now() + 60 * 60000).toISOString();
      updatePostEngineDraft(button.dataset.draftId, patch);
    });
  });
  container.querySelectorAll("[data-delete-draft]").forEach((button) => {
    button.addEventListener("click", () => deletePostEngineDraft(button.dataset.deleteDraft));
  });
  container.querySelectorAll("[data-draft-campaign]").forEach((select) => {
    select.addEventListener("change", () => {
      updatePostEngineDraft(select.dataset.draftCampaign, { campaignId: select.value });
    });
  });
}

function renderPostEngineCalendar() {
  return state.postEngineCalendar.length
    ? state.postEngineCalendar.map((item) => `
      <article class="item">
        <header><h3>${esc(item.title)}</h3><span class="status active">${esc(item.calendarStatus)}</span></header>
        <p>${formatDateTime(item.scheduledAt)}</p>
        <small>${esc(item.ideaType)}</small>
        ${item.campaignId ? `<small>Campanha: ${esc(draftCampaignName(item))}</small>` : ""}
      </article>
    `).join("")
    : empty("Nenhum conteudo agendado no calendario interno.");
}

function renderDraftCampaignFilter(anchor) {
  const wrapper = ensureDraftCampaignFilter(anchor);
  if (!wrapper) return;
  const select = wrapper.querySelector("[data-draft-campaign-filter]");
  if (!select) return;
  select.innerHTML = draftCampaignFilterOptions();
  select.value = state.draftCampaignFilter;
}

function ensureDraftCampaignFilter(anchor) {
  if (!anchor) return null;
  let wrapper = $("#draftCampaignFilterWrap");
  if (wrapper) return wrapper;
  wrapper = document.createElement("div");
  wrapper.id = "draftCampaignFilterWrap";
  wrapper.className = "panel-filter-row";
  const label = document.createElement("label");
  label.textContent = "Filtrar por campanha";
  const select = document.createElement("select");
  select.dataset.draftCampaignFilter = "true";
  select.addEventListener("change", () => {
    state.draftCampaignFilter = select.value;
    anchor.innerHTML = renderPostEngineDrafts();
    bindPostEngineDraftActions(anchor);
  });
  label.appendChild(select);
  wrapper.appendChild(label);
  anchor.insertAdjacentElement("beforebegin", wrapper);
  return wrapper;
}

function draftCampaignFilterOptions() {
  const options = [`<option value="">Todas as campanhas</option>`, `<option value="__none">Sem campanha</option>`];
  const linkedIds = new Set((state.postEngineDrafts || []).map((draft) => draft.campaignId).filter(Boolean));
  for (const campaign of state.campaigns) {
    const id = campaign.id || "";
    options.push(`<option value="${esc(id)}">${esc(campaign.title || id)}</option>`);
    linkedIds.delete(id);
  }
  if (linkedIds.size) options.push(`<option value="__missing">Campanha nao encontrada</option>`);
  return options.join("");
}

function filteredPostEngineDrafts() {
  const drafts = Array.isArray(state.postEngineDrafts) ? state.postEngineDrafts : [];
  if (!state.draftCampaignFilter) return drafts;
  if (state.draftCampaignFilter === "__none") return drafts.filter((draft) => !draft.campaignId);
  if (state.draftCampaignFilter === "__missing") {
    return drafts.filter((draft) => draft.campaignId && draftCampaignName(draft) === "Campanha nao encontrada");
  }
  return drafts.filter((draft) => draft.campaignId === state.draftCampaignFilter);
}

function draftCampaignName(draft = {}) {
  if (!draft.campaignId) return "Sem campanha";
  return draft.campaignName || campaignLabel(draft.campaignId);
}

function renderAdvancedInsights(insights) {
  const items = Array.isArray(insights.insights) ? insights.insights : [];
  return items.length
    ? items.map((item) => `
      <article class="item insight-row">
        <header><h3>${esc(item.label)}</h3><span class="status">${Number(item.score || 0)}</span></header>
        <p>${esc(item.product?.name || item.value || "-")}</p>
      </article>
    `).join("")
    : empty("Nenhum insight avancado disponivel.");
}

function renderGiro() {
  const summary = $("#giroSummary");
  const list = $("#giroList");
  if (!summary || !list) return;
  const giro = state.giro || {};
  summary.innerHTML = `
    <article class="giro-card">
      <div><span>Itens Mesa</span><strong>${Number(giro.reportTotal || 0)}</strong></div>
      <div><span>Regras promo</span><strong>${Number(giro.rulesTotal || 0)}</strong></div>
      <div><span>Oportunidades</span><strong>${Number(giro.opportunitiesTotal || 0)}</strong></div>
    </article>
  `;
  const opportunities = giro.opportunities || [];
  list.innerHTML = opportunities.length
    ? opportunities.map((item) => `
      <article class="item giro-item">
        <header>
          <h3>${esc(item.product)}</h3>
          <span class="status active">${Number(item.rule.authorizedDiscountPercent || 0)}% off</span>
        </header>
        <p>Venda baixa (${Number(item.salePercent || 0)}%) e oportunidade ativa para ${esc(item.rule.allowedNetworks.join(", "))}.</p>
        <small>Horario sugerido ${esc(item.rule.suggestedTime)} | modo ${esc(item.rule.publishMode)}</small>
      </article>
    `).join("")
    : state.giroReport.map((item) => `
      <article class="item giro-item">
        <header>
          <h3>${esc(item.product)}</h3>
          <span class="status">${Number(item.sold || 0)} vendidos</span>
        </header>
        <p>Estoque final ${Number(item.finalStock || 0)} | preco normal ${money(item.normalPrice)}</p>
        <small>${esc(item.date)}</small>
      </article>
    `).join("") || empty("Sem relatorio diario do Mesa cadastrado.");
}

function renderKpis() {
  const totals = state.summary?.totals || {};
  const mostActiveCampaign = state.campaigns.reduce((leader, campaign) => {
    const campaignDrafts = Number(campaign.draftsTotal || campaign.draftCounters?.total || 0);
    const leaderDrafts = Number(leader?.draftsTotal || leader?.draftCounters?.total || 0);
    return !leader || campaignDrafts > leaderDrafts ? campaign : leader;
  }, null);
  $("#perolaKpis").innerHTML = [
    kpi("Publicacoes", totals.posts),
    kpi("Agendadas", totals.scheduled),
    kpi("Aguardando humano", totals.waitingHuman),
    kpi("Alertas", totals.alerts),
    campaignActivityKpi(mostActiveCampaign),
    campaignSummaryKpi(state.campaigns)
  ].join("");
}

function campaignActivityKpi(campaign) {
  const drafts = Number(campaign?.draftsTotal || campaign?.draftCounters?.total || 0);
  const name = campaign ? (campaign.title || campaign.id) : "Nenhuma campanha";
  return `
    <article class="kpi">
      <span>Campanha Mais Ativa</span>
      <strong>${esc(name)}</strong>
      <small>${drafts} draft${drafts === 1 ? "" : "s"}</small>
    </article>
  `;
}

function campaignSummaryKpi(campaigns = []) {
  const statusTotals = campaigns.reduce((totals, campaign) => {
    if (campaign.status === "active") totals.active += 1;
    if (campaign.status === "paused") totals.paused += 1;
    if (campaign.status === "completed") totals.completed += 1;
    return totals;
  }, { active: 0, paused: 0, completed: 0 });

  return `
    <article class="kpi">
      <span>Resumo de Campanhas</span>
      <strong>${campaigns.length}</strong>
      <dl class="campaign-summary">
        <div><dt>Ativas</dt><dd>${statusTotals.active}</dd></div>
        <div><dt>Pausadas</dt><dd>${statusTotals.paused}</dd></div>
        <div><dt>Finalizadas</dt><dd>${statusTotals.completed}</dd></div>
      </dl>
    </article>
  `;
}

function renderCampaignRanking() {
  const container = $("#campaignRanking");
  if (!container) return;
  const campaigns = [...state.campaigns]
    .sort((left, right) => campaignDraftTotal(right) - campaignDraftTotal(left))
    .slice(0, 5);

  if (!campaigns.length) {
    container.innerHTML = empty("Nenhuma campanha cadastrada.");
    return;
  }

  container.innerHTML = `
    <div class="campaign-ranking-head" aria-hidden="true">
      <span>Posicao</span>
      <span>Campanha</span>
      <span>Drafts vinculados</span>
    </div>
    <ol class="campaign-ranking">
      ${campaigns.map((campaign, index) => `
        <li>
          <span class="campaign-ranking-position">#${index + 1}</span>
          <span class="campaign-ranking-name">${esc(campaign.title || campaign.id)}</span>
          <span class="campaign-ranking-drafts">${campaignDraftTotal(campaign)}</span>
        </li>
      `).join("")}
    </ol>
  `;
}

function campaignDraftTotal(campaign = {}) {
  return Number(campaign.draftsTotal || campaign.draftCounters?.total || 0);
}

function renderLeadRadar() {
  const container = $("#leadRadar");
  if (!container) return;
  const topIntent = mostFrequentLeadValue(state.leads, (lead) => lead.interesse || lead.interest || lead.intent);
  const topCity = mostFrequentLeadValue(state.leads, (lead) => (
    lead.cidade || lead.city || lead.eventCity || lead.eventLocationText || lead.local || lead.location
  ));

  container.innerHTML = `
    <div class="lead-radar-total"><span>Total de leads</span><strong>${state.leads.length}</strong></div>
    <dl class="lead-radar-list">
      <div><dt>Intenção mais frequente</dt><dd>${esc(formatLeadRadarValue(topIntent))}</dd></div>
      <div><dt>Cidade mais frequente</dt><dd>${esc(topCity || "Não informada")}</dd></div>
    </dl>
  `;
}

function mostFrequentLeadValue(leads, valueForLead) {
  const counts = new Map();
  let leader = "";
  let leaderCount = 0;
  for (const lead of leads) {
    const value = String(valueForLead(lead) || "").trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("pt-BR");
    const entry = counts.get(key) || { value, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
    if (entry.count > leaderCount) {
      leader = entry.value;
      leaderCount = entry.count;
    }
  }
  return leader;
}

function formatLeadRadarValue(value) {
  if (!value) return "Não informada";
  const label = String(value).replaceAll("_", " ");
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function renderAlerts() {
  const panel = $("#perolaAlertPanel");
  if (!panel) return;
  if (!state.alerts.length) {
    panel.innerHTML = `
      <div class="alert-head">
        <div>
          <p class="eyebrow">Perola Alerta</p>
          <h2>Alertas</h2>
        </div>
        <strong>0</strong>
      </div>
      <div class="alert-list">
        ${empty("Sem alertas no momento.")}
      </div>
    `;
    return;
  }
  panel.innerHTML = `
    <div class="alert-head">
      <div>
        <p class="eyebrow">Perola Alerta</p>
        <h2>Publicacoes perto do horario</h2>
      </div>
      <strong>${state.alerts.length}</strong>
    </div>
    <div class="alert-list">
      ${state.alerts.map((alert) => {
        const priority = alertPriority(alert);
        return `
        <article class="alert-item ${esc(alert.severity)} priority-${priority.level}">
          <div>
            <div class="alert-title-row">
              <h3>${esc(alert.title)}</h3>
              <span class="priority-badge ${priority.level}">${priority.label}</span>
            </div>
            <p>${formatAlertTime(alert)} | ${esc(alert.networks.join(", "))}</p>
            ${alert.source === "mesa_daily_report" ? `<p class="giro-inline">Giro: ${esc(alert.productName)} | ${Number(alert.discountPercent || 0)}% | relatorio ${esc(alert.reportDate)}</p>` : ""}
            <small>${esc(alert.publishMode)} ${alert.autoPublishIfExpired ? "| autopublica se expirar" : ""}</small>
          </div>
          ${alert.status !== "published" ? `<button type="button" data-publish-id="${esc(alert.id)}">Marcar publicada</button>` : ""}
        </article>
      `;}).join("")}
    </div>
  `;
  panel.querySelectorAll("[data-publish-id]").forEach((button) => {
    button.addEventListener("click", () => publishPost(button.dataset.publishId));
  });
}

function renderPosts() {
  const message = $("#postActionMessage");
  if (message) {
    message.textContent = state.postActionMessage || "";
    message.classList.toggle("error", /nao foi|falha|erro|informe/i.test(state.postActionMessage || ""));
  }
  $("#postsList").innerHTML = state.posts.length
    ? state.posts.map((post) => {
      const source = post.source === "mesa_daily_report" ? "Pérola Giro" : (post.source || post.campaign || "Perola");
      const channel = post.networks?.length ? post.networks.join(", ") : "manual";
      const instagramReady = Boolean(state.summary?.socialNetworksConnected && post.networks?.includes("instagram"));
      return `
      <article class="item publication ${post.status === "published" ? "published" : ""}">
        <header class="publication-head">
          <div>
            <h3>${esc(post.title)}</h3>
            <small>${esc(shortText(post.caption || post.campaign || post.title, 120))}</small>
          </div>
          <span class="status ${post.approved ? "active" : ""}">${statusLabel(post.status)}</span>
        </header>
        <div class="publication-strip">
          <span><strong>Canal</strong>${esc(channel)}</span>
          <span><strong>Origem</strong>${esc(source)}</span>
          <span><strong>Campanha</strong>${esc(campaignLabel(post.campaignId) || post.campaign || "Sem campanha")}</span>
          <span><strong>Horario</strong>${formatDateTime(post.scheduledAt)}</span>
        </div>
        <p class="publication-caption">${esc(post.caption)}</p>
        ${post.mediaUrl ? `<p class="publication-media"><strong>Midia</strong> ${esc(post.mediaType)} | <a href="${esc(post.mediaUrl)}" target="_blank" rel="noopener">abrir arquivo publico</a></p>` : ""}
        ${post.instagramPermalink ? `<p class="publication-media success"><strong>Instagram</strong> <a href="${esc(post.instagramPermalink)}" target="_blank" rel="noopener">ver publicacao</a></p>` : ""}
        ${post.lastPublishError ? `<p class="publication-media error"><strong>Falha</strong> ${esc(post.lastPublishError)}</p>` : ""}
        ${post.source === "mesa_daily_report" ? renderGiroPublicationMeta(post) : ""}
        <dl class="meta-grid">
          <div><dt>Horario</dt><dd>${formatDateTime(post.scheduledAt)}</dd></div>
          <div><dt>Modo</dt><dd>${esc(post.publishMode)}</dd></div>
          <div><dt>Aprovado</dt><dd>${post.approved ? "Sim" : "Nao"}</dd></div>
          <div><dt>Prazo humano</dt><dd>${Number(post.humanDeadlineMinutes || 0)} min</dd></div>
          <div><dt>Auto expira</dt><dd>${post.autoPublishIfExpired ? "Sim" : "Nao"}</dd></div>
          <div><dt>Publicado</dt><dd>${post.publishedAt ? `${formatDateTime(post.publishedAt)} (${post.autoPublished ? "auto" : "humano"})` : "Nao"}</dd></div>
        </dl>
        <label class="inline-campaign">Campanha vinculada
          <select data-post-campaign="${esc(post.id)}">
            ${campaignOptions(post.campaignId)}
          </select>
        </label>
        <div class="item-actions">
          <button type="button" data-approval="true" data-id="${esc(post.id)}">Aprovar</button>
          <button type="button" data-status="review" data-id="${esc(post.id)}">Revisar</button>
          <button type="button" data-status="scheduled" data-id="${esc(post.id)}">Agendar</button>
          ${post.status !== "published" ? `<button class="simulate-button" type="button" data-publish-id="${esc(post.id)}">${instagramReady ? "Publicar no Instagram" : "Simular publicacao"}</button>` : `<button type="button" disabled>${post.publishProvider === "instagram" ? "Publicado no Instagram" : "Simulacao concluida"}</button>`}
          <button type="button" data-status="archived" data-id="${esc(post.id)}">Arquivar</button>
        </div>
      </article>
    `;}).join("")
    : empty("Nenhuma publicacao local cadastrada.");

  document.querySelectorAll("[data-status][data-id]").forEach((button) => {
    button.addEventListener("click", () => setPostStatus(button.dataset.id, button.dataset.status));
  });
  document.querySelectorAll("[data-approval][data-id]").forEach((button) => {
    button.addEventListener("click", () => setPostApproval(button.dataset.id, button.dataset.approval === "true"));
  });
  document.querySelectorAll("[data-publish-id]").forEach((button) => {
    button.addEventListener("click", () => publishPost(button.dataset.publishId));
  });
  document.querySelectorAll("[data-post-campaign]").forEach((select) => {
    select.addEventListener("change", () => setPostCampaign(select.dataset.postCampaign, select.value));
  });
}

function renderRules() {
  const giroRules = state.rules.filter((rule) => rule.type === "promotional_rule");
  $("#rulesList").innerHTML = giroRules.length
    ? giroRules.map(renderGiroRuleForm).join("")
    : empty("Nenhuma regra de Giro cadastrada.");

  document.querySelectorAll("[data-rule-form]").forEach((form) => {
    form.addEventListener("submit", saveGiroRule);
  });
}

function renderGiroRuleForm(rule) {
  return `
    <form class="item rule-form" data-rule-form data-rule-id="${esc(rule.id)}">
      <header>
        <div>
          <h3>${esc(rule.product || rule.name)}</h3>
          <small>${esc(rule.name)} | ${esc(rule.id)}</small>
        </div>
        <span class="status ${rule.active ? "active" : ""}">${rule.active ? "ativa" : "inativa"}</span>
      </header>
      <div class="rule-grid">
        <label>Produto<input value="${esc(rule.product || "")}" disabled></label>
        <label>Ativa<select name="enabled"><option value="true" ${rule.active ? "selected" : ""}>Ativa</option><option value="false" ${!rule.active ? "selected" : ""}>Inativa</option></select></label>
        <label>Sobra minima<input name="minPreviousLeftover" type="number" min="0" step="1" value="${Number(rule.minimumLeftover || 0)}"></label>
        <label>Venda baixa max %<input name="lowSalesMaxPercent" type="number" min="0" max="100" step="1" value="${Number(rule.lowSalePercent || 0)}"></label>
        <label>Desconto autorizado %<input name="discountPercent" type="number" min="0" max="50" step="1" value="${Number(rule.authorizedDiscountPercent || 0)}"></label>
        <label>Redes permitidas<input name="allowedNetworks" value="${esc((rule.allowedNetworks || []).join(", "))}"></label>
        <label>Modo<select name="publishMode">
          <option value="manual" ${rule.publishMode === "manual" ? "selected" : ""}>Manual</option>
          <option value="assistido" ${rule.publishMode === "assistido" ? "selected" : ""}>Assistido</option>
          <option value="automatico" ${rule.publishMode === "automatico" ? "selected" : ""}>Automatico</option>
        </select></label>
        <label>Horario sugerido<input name="suggestedPublishTime" type="time" value="${esc(rule.suggestedTime || "18:00")}"></label>
        <label>Prazo humano min<input name="humanDeadlineMinutes" type="number" min="1" step="1" value="${Number(rule.humanDeadlineMinutes || 1)}"></label>
        <label>AutoPublicar<select name="autoPublishIfExpired"><option value="true" ${rule.autoPublishIfExpired ? "selected" : ""}>Ativo</option><option value="false" ${!rule.autoPublishIfExpired ? "selected" : ""}>Inativo</option></select></label>
        <label>Exige aprovacao<select name="requiresApproval"><option value="true" ${rule.requiresApproval ? "selected" : ""}>Sim</option><option value="false" ${!rule.requiresApproval ? "selected" : ""}>Nao</option></select></label>
      </div>
      <div class="rule-actions">
        <span data-rule-result></span>
        <button class="primary" type="submit">Salvar regra</button>
      </div>
    </form>
  `;
}

async function saveGiroRule(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  body.allowedNetworks = String(body.allowedNetworks || "").split(",").map((item) => item.trim()).filter(Boolean);
  const result = await patchJson(`/api/perola/rules/${encodeURIComponent(form.dataset.ruleId)}`, body);
  const resultEl = form.querySelector("[data-rule-result]");
  if (resultEl) {
    resultEl.textContent = result.ok ? "Regra salva" : (result.message || result.error || "Erro ao salvar");
    resultEl.classList.toggle("error", !result.ok);
  }
  if (result.ok) await loadPerola();
}

function renderGiroPublicationMeta(post) {
  return `
    <div class="giro-publication-meta">
      <strong>Veio do Pérola Giro</strong>
      <span>Produto: ${esc(post.productName || post.giroProduct || post.productId)}</span>
      <span>Desconto: ${Number(post.discountPercent || post.giroDiscountPercent || 0)}%</span>
      <span>Relatorio: ${esc(post.reportDate || "-")}</span>
      <span>Regra: ${esc(post.ruleId || "-")}</span>
      <span>AutoPublicar: ${post.autoPublishIfExpired ? "ativo" : "inativo"}</span>
    </div>
  `;
}

function renderSales() {
  $("#salesList").innerHTML = state.sales.length
    ? state.sales.map((item) => `
      <article class="item">
        <header>
          <h3>${esc(item.date)}</h3>
          <span class="status active">${esc(item.channel)}</span>
        </header>
        <p>${Number(item.orders || 0)} pedidos | ${money(item.revenue)}</p>
        <small>${esc(item.notes || "")}</small>
      </article>
    `).join("")
    : empty("Nenhum dia de venda cadastrado.");
}

function renderAudit() {
  $("#auditList").classList.add("timeline");
  $("#auditList").innerHTML = state.audit.length
    ? state.audit.map((item) => {
      const source = item.source || item.context?.source || "perola";
      return `
      <article class="timeline-item">
        <time>${formatDateTime(item.createdAt)}</time>
        <div>
          <header>
            <h3>${esc(item.type)}</h3>
            <span class="status">${esc(source)}</span>
          </header>
          <p>${esc(item.message || "Evento registrado")}</p>
          <small>${esc(auditDetails(item))}</small>
        </div>
      </article>
    `;}).join("")
    : empty("Nenhum registro de auditoria ainda.");
}

function syncPostCampaignSelect() {
  const form = $("#postForm");
  if (!form || form.elements.campaignId) return;
  const campaignInput = form.elements.campaign;
  const anchor = campaignInput?.closest("label") || form.querySelector("fieldset");
  if (!anchor) return;
  const label = document.createElement("label");
  label.textContent = "Campanha vinculada";
  const select = document.createElement("select");
  select.name = "campaignId";
  select.innerHTML = campaignOptions("");
  label.appendChild(select);
  anchor.insertAdjacentElement("afterend", label);
}

function campaignOptions(selectedId = "") {
  const selected = String(selectedId || "");
  const options = [`<option value="" ${selected ? "" : "selected"}>Sem campanha</option>`];
  let selectedFound = !selected;
  for (const campaign of state.campaigns) {
    const id = campaign.id || "";
    if (id === selected) selectedFound = true;
    options.push(`<option value="${esc(id)}" ${id === selected ? "selected" : ""}>${esc(campaign.title || id)}</option>`);
  }
  if (!selectedFound) {
    options.push(`<option value="${esc(selected)}" selected>Campanha nao encontrada</option>`);
  }
  return options.join("");
}

function campaignLabel(campaignId = "") {
  if (!campaignId) return "";
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  return campaign ? (campaign.title || campaign.id) : "Campanha nao encontrada";
}

async function getJson(path) {
  const response = await fetch(path, { headers: requestHeaders() });
  return response.json();
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: requestHeaders(true),
    body: JSON.stringify(body)
  });
  return response.json();
}

async function patchJson(path, body) {
  const response = await fetch(path, {
    method: "PATCH",
    headers: requestHeaders(true),
    body: JSON.stringify(body)
  });
  return response.json();
}

async function deleteJson(path) {
  const response = await fetch(path, { method: "DELETE", headers: requestHeaders() });
  return response.json();
}

function requestHeaders(json = false) {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    "x-sambah-role": state.activeRole
  };
}

function can(action) {
  return state.permissions?.matrix?.[state.activeRole]?.[action] === true;
}

function permissionButtonState(action) {
  return can(action) ? "" : `disabled title="Perfil ${esc(state.activeRole)} sem permissao"`;
}

function permissionSummary() {
  if (!state.permissions) return "Carregando permissoes locais...";
  const allowed = Object.values(state.permissions.matrix?.[state.activeRole] || {}).filter(Boolean).length;
  return `${state.activeRole}: ${allowed} de ${state.permissions.actions.length} acoes liberadas.`;
}

function kpi(label, value) {
  return `<article class="kpi"><span>${esc(label)}</span><strong>${esc(value ?? 0)}</strong></article>`;
}

function empty(message) {
  return `<article class="item"><p>${esc(message)}</p></article>`;
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function productLabel(product, metric) {
  if (!product) return "-";
  const detail = metric === "revenue"
    ? money(product.revenue)
    : `${Number(product.quantity || 0)} vendas`;
  return `${product.name} (${detail})`;
}

function formatDateTime(value) {
  if (!value) return "Nao agendado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nao agendado";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDateOnly(value) {
  if (!value) return "Nao definida";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "Nao definida";
}

function formatAlertTime(alert) {
  if (alert.minutesToSchedule < 0) return `${Math.abs(alert.minutesToSchedule)} min atrasada`;
  if (alert.minutesToSchedule === 0) return "agora";
  return `em ${alert.minutesToSchedule} min`;
}

function alertPriority(alert) {
  if (alert.severity === "late" || alert.severity === "urgent" || alert.minutesToSchedule <= 5) {
    return { level: "high", label: "Alta" };
  }
  if (alert.minutesToSchedule <= 15 || alert.status === "waiting_human") {
    return { level: "medium", label: "Media" };
  }
  return { level: "low", label: "Baixa" };
}

function statusLabel(status) {
  return {
    draft: "rascunho",
    review: "revisao",
    pending_approval: "pendente aprovacao",
    scheduled: "agendada",
    waiting_human: "aguardando humano",
    published: "publicada",
    archived: "arquivada"
  }[status] || status;
}

function shortText(value = "", max = 100) {
  const textValue = String(value || "").trim();
  if (textValue.length <= max) return textValue;
  return `${textValue.slice(0, max - 3).trim()}...`;
}

function auditDetails(item = {}) {
  const context = item.context || {};
  const details = [
    context.postId ? `post ${context.postId}` : "",
    context.productName || context.product ? `produto ${context.productName || context.product}` : "",
    context.ruleId ? `regra ${context.ruleId}` : "",
    Number.isFinite(Number(context.created)) ? `${context.created} criados` : "",
    Number.isFinite(Number(context.skipped)) ? `${context.skipped} ignorados` : ""
  ].filter(Boolean);
  return details.length ? details.join(" | ") : "Sem detalhes adicionais.";
}

function esc(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
