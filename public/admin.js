const totalEl = document.querySelector("#metricTotal");
const healthEl = document.querySelector("#metricHealth");
const lastErrorEl = document.querySelector("#metricLastError");
const lastEventEl = document.querySelector("#metricLastEvent");
const typeCountersEl = document.querySelector("#typeCounters");
const statusCountersEl = document.querySelector("#statusCounters");
const errorEventsEl = document.querySelector("#errorEvents");
const auditLogsEl = document.querySelector("#auditLogs");
const logCountEl = document.querySelector("#logCount");
const refreshButton = document.querySelector("#refreshAudit");
const topSystemStatusEl = document.querySelector("#topSystemStatus");

const webhookStatusEl = document.querySelector("#webhookStatus");
const whatsappReceivedEl = document.querySelector("#whatsappReceived");
const lastWebhookEl = document.querySelector("#lastWebhook");
const auditTotalCardEl = document.querySelector("#auditTotalCard");
const auditErrorsCardEl = document.querySelector("#auditErrorsCard");

const queuePendingCardEl = document.querySelector("#queuePendingCard");
const queueErrorsCardEl = document.querySelector("#queueErrorsCard");
const queueRetryShortcut = document.querySelector("#queueRetryShortcut");
const mesaEndpointStateEl = document.querySelector("#mesaEndpointState");
const mesaStatusEl = document.querySelector("#mesaStatus");
const mesaStatusCardEl = document.querySelector("#mesaStatusCard");
const mesaUrlEl = document.querySelector("#mesaUrl");
const mesaUrlCardEl = document.querySelector("#mesaUrlCard");
const mesaPendingEl = document.querySelector("#mesaPending");
const mesaLastSendEl = document.querySelector("#mesaLastSend");
const mesaLastSentCardEl = document.querySelector("#mesaLastSentCard");
const mesaLastErrorEl = document.querySelector("#mesaLastError");
const mesaLastAttemptEl = document.querySelector("#mesaLastAttempt");
const mesaQueueListEl = document.querySelector("#mesaQueueList");
const retryMesaBtn = document.querySelector("#retryMesaBtn");
const sendTestOrderBtn = document.querySelector("#sendTestOrderBtn");
const menuSyncStateEl = document.querySelector("#menuSyncState");
const menuStatusEl = document.querySelector("#menuStatus");
const menuLastSyncEl = document.querySelector("#menuLastSync");
const menuTotalProductsEl = document.querySelector("#menuTotalProducts");
const menuActiveProductsEl = document.querySelector("#menuActiveProducts");
const menuUnavailableProductsEl = document.querySelector("#menuUnavailableProducts");
const menuCacheListEl = document.querySelector("#menuCacheList");
const syncMenuBtn = document.querySelector("#syncMenuBtn");
const reviewCountEl = document.querySelector("#reviewCount");
const reviewOrdersListEl = document.querySelector("#reviewOrdersList");
const draftCountEl = document.querySelector("#draftCount");
const draftOrdersListEl = document.querySelector("#draftOrdersList");
const draftTestTextEl = document.querySelector("#draftTestText");
const draftTestBtn = document.querySelector("#draftTestBtn");
const whatsappProviderPillEl = document.querySelector("#whatsappProviderPill");
const whatsappProviderEl = document.querySelector("#whatsappProvider");
const whatsappConfiguredEl = document.querySelector("#whatsappConfigured");
const whatsappPhoneConfiguredEl = document.querySelector("#whatsappPhoneConfigured");
const whatsappPendingSessionsEl = document.querySelector("#whatsappPendingSessions");
const whatsappReceivedListEl = document.querySelector("#whatsappReceivedList");
const whatsappSentListEl = document.querySelector("#whatsappSentList");
const whatsappSessionsListEl = document.querySelector("#whatsappSessionsList");
const eventsLeadCountEl = document.querySelector("#eventsLeadCount");
const eventsNewEl = document.querySelector("#eventsNew");
const eventsNeedsInfoEl = document.querySelector("#eventsNeedsInfo");
const eventsQuotePendingEl = document.querySelector("#eventsQuotePending");
const eventsPreReservedEl = document.querySelector("#eventsPreReserved");
const eventsConfirmedEl = document.querySelector("#eventsConfirmed");
const eventsCanceledEl = document.querySelector("#eventsCanceled");
const eventsLeadListEl = document.querySelector("#eventsLeadList");
const trackingCountEl = document.querySelector("#trackingCount");
const trackingListEl = document.querySelector("#trackingList");
const trackingFeedbackEl = document.querySelector("#trackingFeedback");
const refreshTrackingBtn = document.querySelector("#refreshTrackingBtn");
const trackingStatusFilterEl = document.querySelector("#trackingStatusFilter");
const trackingFilterButtons = Array.from(document.querySelectorAll(".tracking-filter"));

let trackingItems = [];
let trackingFilter = "all";

const mesaStatusLabels = {
  pending: "Aguardando conferencia",
  accepted: "Recebido pela equipe",
  em_preparo: "Em preparo",
  em_finalizacao: "Em finalizacao",
  pronto: "Pronto",
  pronto_para_retirada: "Pronto para retirada",
  com_garcom: "Com garcom",
  saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  erro: "Atencao da equipe",
  pending_mesa: "Aguardando Mesa"
};

async function loadAudit() {
  const [statsResponse, logsResponse, errorResponse] = await Promise.all([
    fetch("/admin/audit/stats"),
    fetch("/admin/audit/logs?limit=100"),
    fetch("/admin/audit/logs?status=error&limit=10")
  ]);
  const stats = await statsResponse.json();
  const logs = await logsResponse.json();
  const errors = await errorResponse.json();
  const lastWebhook = logs.items.find((item) => item.type === "webhook_received");
  const webhookCount = stats.byType?.webhook_received || 0;
  const errorCount = stats.byStatus?.error || 0;

  totalEl.textContent = stats.total;
  auditTotalCardEl.textContent = stats.total;
  auditErrorsCardEl.textContent = errorCount;
  healthEl.textContent = stats.health === "ok" ? "Operacional" : "Atenção";
  healthEl.className = stats.health === "ok" ? "state-ok" : "state-attention";
  topSystemStatusEl.textContent = stats.health === "ok" ? "Online / Operacional" : "Atenção";
  topSystemStatusEl.className = stats.health === "ok" ? "status-chip" : "status-chip attention";
  lastErrorEl.textContent = stats.lastErrorAt ? formatDate(stats.lastErrorAt) : "Sem erro";
  lastEventEl.textContent = stats.lastEventAt ? formatDate(stats.lastEventAt) : "Sem eventos";
  webhookStatusEl.textContent = webhookCount ? "Recebendo eventos" : "Aguardando webhook";
  webhookStatusEl.className = webhookCount ? "state-ok" : "state-neutral";
  whatsappReceivedEl.textContent = webhookCount;
  lastWebhookEl.textContent = lastWebhook ? formatDate(lastWebhook.createdAt) : "Sem evento";
  typeCountersEl.innerHTML = renderCounters(stats.byType);
  statusCountersEl.innerHTML = renderCounters(stats.byStatus);
  errorEventsEl.innerHTML = renderEvents(errors.items, "Nenhum erro operacional registrado.");
  auditLogsEl.innerHTML = renderEvents(logs.items, "Nenhum evento registrado.");
  logCountEl.textContent = `${logs.total} itens`;
}

async function loadMesa() {
  const [statusResponse, queueResponse] = await Promise.all([
    fetch("/admin/mesa/status"),
    fetch("/admin/mesa/queue?limit=5")
  ]);
  const status = await statusResponse.json();
  const queue = await queueResponse.json();
  const connected = status.status === "connected";
  const lastAttempt = queue.items.find((item) => item.lastAttemptAt);

  mesaEndpointStateEl.textContent = connected ? "Mesa conectado" : "Mesa desconectado";
  mesaStatusEl.textContent = connected ? "Conectado" : "Desconectado";
  mesaStatusCardEl.textContent = connected ? "Conectado" : "Desconectado";
  mesaStatusEl.className = connected ? "state-ok" : "state-attention";
  mesaStatusCardEl.className = connected ? "state-ok" : "state-attention";
  mesaUrlEl.textContent = status.baseUrl || "Não configurado";
  mesaUrlCardEl.textContent = status.baseUrl || "Não configurado";
  mesaPendingEl.textContent = queue.pending;
  queuePendingCardEl.textContent = queue.pending;
  queueErrorsCardEl.textContent = queue.failed;
  mesaLastSendEl.textContent = queue.lastSentAt ? formatDate(queue.lastSentAt) : "Sem envio";
  mesaLastSentCardEl.textContent = queue.lastSentAt ? formatDate(queue.lastSentAt) : "Sem envio";
  mesaLastErrorEl.textContent = queue.lastError || "Sem erro";
  mesaLastAttemptEl.textContent = lastAttempt ? formatDate(lastAttempt.lastAttemptAt) : "Sem tentativa";
  mesaQueueListEl.innerHTML = renderMesaQueue(queue.items);
}

async function loadMenu() {
  const [statusResponse, cacheResponse] = await Promise.all([
    fetch("/admin/menu/status"),
    fetch("/admin/menu/cache")
  ]);
  const status = await statusResponse.json();
  const cache = await cacheResponse.json();
  const activeItems = Number(status.activeItems ?? cache.items.filter((item) => item.available !== false && item.availability?.available !== false).length);
  const unavailableItems = Number(status.unavailableItems ?? Math.max(0, cache.items.length - activeItems));

  menuSyncStateEl.textContent = status.cached ? "Cardapio sincronizado" : "Aguardando sincronizacao";
  menuStatusEl.textContent = status.cached ? "Sincronizado" : "Sem cache";
  menuStatusEl.className = status.cached ? "state-ok" : "state-attention";
  menuLastSyncEl.textContent = status.lastSyncAt ? formatDate(status.lastSyncAt) : "Sem sincronizacao";
  menuTotalProductsEl.textContent = status.totalItems ?? cache.items.length;
  menuActiveProductsEl.textContent = activeItems;
  menuUnavailableProductsEl.textContent = unavailableItems;
  menuCacheListEl.innerHTML = renderMenuCache(cache.items);
}

async function loadReviewOrders() {
  const response = await fetch("/admin/orders/review?limit=50");
  const review = await response.json();
  reviewCountEl.textContent = `${review.total || 0} itens`;
  reviewOrdersListEl.innerHTML = renderReviewOrders(review.items || []);
}

async function loadDrafts() {
  const response = await fetch("/admin/orders/drafts?limit=50");
  const drafts = await response.json();
  draftCountEl.textContent = `${drafts.total || 0} itens`;
  draftOrdersListEl.innerHTML = renderDrafts(drafts.items || []);
}

async function loadWhatsApp() {
  const [statusResponse, sessionsResponse, messagesResponse] = await Promise.all([
    fetch("/admin/whatsapp/status"),
    fetch("/admin/whatsapp/sessions"),
    fetch("/admin/whatsapp/messages?limit=8")
  ]);
  const status = await statusResponse.json();
  const sessions = await sessionsResponse.json();
  const messages = await messagesResponse.json();
  const pending = (sessions.items || []).filter((item) => item.status === "awaiting_confirmation");
  whatsappProviderPillEl.textContent = status.provider || "mock";
  whatsappProviderEl.textContent = status.provider || "mock";
  whatsappConfiguredEl.textContent = status.configured ? "Configurado" : "Pendente";
  whatsappConfiguredEl.className = status.configured ? "state-ok" : "state-attention";
  whatsappPhoneConfiguredEl.textContent = status.phoneNumberIdConfigured ? "sim" : "nao";
  whatsappPendingSessionsEl.textContent = pending.length;
  whatsappReceivedListEl.innerHTML = renderWhatsappMessages(messages.received || [], "Nenhuma mensagem recebida.");
  whatsappSentListEl.innerHTML = renderWhatsappMessages(messages.sent || [], "Nenhuma resposta enviada.");
  whatsappSessionsListEl.innerHTML = renderWhatsappSessions(pending);
}

async function loadEvents() {
  const [statsResponse, leadsResponse] = await Promise.all([
    fetch("/admin/events/stats"),
    fetch("/admin/events/leads?limit=50")
  ]);
  const stats = await statsResponse.json();
  const leads = await leadsResponse.json();
  eventsLeadCountEl.textContent = `${leads.total || 0} leads`;
  eventsNewEl.textContent = stats.byStatus?.new || 0;
  eventsNeedsInfoEl.textContent = stats.byStatus?.needs_info || 0;
  eventsQuotePendingEl.textContent = stats.quotePending || 0;
  eventsPreReservedEl.textContent = stats.byStatus?.pre_reserved || 0;
  eventsConfirmedEl.textContent = stats.byStatus?.confirmed || 0;
  eventsCanceledEl.textContent = stats.byStatus?.canceled || 0;
  eventsLeadListEl.innerHTML = renderEventLeads(leads.items || [], stats.upcoming || []);
}

async function loadTracking() {
  const response = await fetch("/admin/orders/tracking?limit=100");
  const data = await response.json();
  trackingItems = data.items || [];
  renderTracking();
}

function renderCounters(counters = {}) {
  const entries = Object.entries(counters);
  if (!entries.length) return `<p class="empty">Sem dados.</p>`;
  return entries.map(([label, value]) => `
    <div class="counter-row">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderEvents(items, emptyText) {
  if (!items.length) return `<p class="empty">${emptyText}</p>`;
  return items.map((item) => `
    <article class="event ${escapeHtml(item.status)}">
      <div>
        <strong>${escapeHtml(item.type)}</strong>
        <span>${escapeHtml(item.message || "")}</span>
      </div>
      <time>${formatDate(item.createdAt)}</time>
      <code>${escapeHtml(JSON.stringify(item.context || {}))}</code>
    </article>
  `).join("");
}

function renderMesaQueue(items = []) {
  if (!items.length) return `<p class="empty">Nenhum pedido na fila Mesa.</p>`;
  return items.map((item) => `
    <article class="queue-item ${escapeHtml(item.status)}">
      <div>
        <strong>${escapeHtml(item.order?.customer?.name || "Cliente WhatsApp")}</strong>
        <span>${escapeHtml(item.order?.customer?.phone || "")}</span>
      </div>
      <div>
        <span>Status</span>
        <strong>${escapeHtml(item.status)}</strong>
      </div>
      <div>
        <span>Tentativas</span>
        <strong>${item.attempts}</strong>
      </div>
      <time>${formatDate(item.updatedAt || item.createdAt)}</time>
    </article>
  `).join("");
}

function renderMenuCache(items = []) {
  if (!items.length) return `<p class="empty">Nenhum cardapio sincronizado.</p>`;
  return items.slice(0, 8).map((item) => {
    const available = item.available !== false && item.availability?.available !== false;
    return `
      <article class="menu-item ${available ? "available" : "unavailable"}">
        <div>
          <strong>${escapeHtml(item.name || item.productId)}</strong>
          <span>${escapeHtml(item.category || "Sem categoria")}</span>
        </div>
        <code>${escapeHtml(item.productId)}</code>
        <strong>${formatMoney(item.price)}</strong>
        <span>${available ? "Ativo" : "Indisponivel"}</span>
      </article>
    `;
  }).join("");
}

function renderReviewOrders(items = []) {
  if (!items.length) return `<p class="empty">Nenhum pedido aguardando revisao.</p>`;
  return items.map((item) => `
    <article class="review-item">
      <div>
        <strong>${escapeHtml(item.customer?.name || "Cliente WhatsApp")}</strong>
        <span>${escapeHtml(item.customer?.phoneMasked || "")}</span>
        <time>${formatDate(item.createdAt)}</time>
      </div>
      <div>
        <span>Itens recebidos</span>
        <code>${escapeHtml(formatReviewItems(item.items))}</code>
      </div>
      <div>
        <span>Motivo</span>
        <strong>${escapeHtml(item.reason || "needs_review")}</strong>
        <small>${escapeHtml(item.message || "")}</small>
      </div>
      <div class="review-actions">
        <button class="ghost-button" type="button" disabled>Editar e enviar</button>
        <button class="ghost-button cancel-review-btn" type="button" data-review-id="${escapeHtml(item.id)}">Cancelar</button>
      </div>
    </article>
  `).join("");
}

function renderDrafts(items = []) {
  if (!items.length) return `<p class="empty">Nenhum rascunho criado.</p>`;
  return items.map((draft) => `
    <article class="draft-item ${escapeHtml(draft.status)}">
      <div>
        <strong>${escapeHtml(draft.rawText || "Sem texto")}</strong>
        <span>${escapeHtml(draft.customer?.name || "Cliente WhatsApp")} ${escapeHtml(draft.customer?.phoneMasked || "")}</span>
      </div>
      <div>
        <span>Intencao</span>
        <strong>${escapeHtml(draft.intent)}</strong>
        <small>Status: ${escapeHtml(draft.status)}</small>
      </div>
      <div>
        <span>Produtos encontrados</span>
        <code>${escapeHtml(formatDraftItems(draft.items))}</code>
      </div>
      <div>
        <span>Confianca</span>
        <strong>${Math.round(Number(draft.confidence || 0) * 100)}%</strong>
        <small>${escapeHtml(formatDraftQuestions(draft.questions))}</small>
      </div>
      <div class="review-actions">
        <button class="ghost-button confirm-draft-btn" type="button" data-draft-id="${escapeHtml(draft.id)}" ${draft.status === "draft" ? "" : "disabled"}>Confirmar e enviar</button>
        <button class="ghost-button cancel-draft-btn" type="button" data-draft-id="${escapeHtml(draft.id)}" ${draft.status === "canceled" ? "disabled" : ""}>Cancelar</button>
      </div>
    </article>
  `).join("");
}

function renderWhatsappMessages(items = [], emptyText) {
  if (!items.length) return `<p class="empty">${emptyText}</p>`;
  return items.map((item) => `
    <article class="whatsapp-item">
      <div>
        <strong>${escapeHtml(item.customerName || item.phone || "Cliente WhatsApp")}</strong>
        <span>${escapeHtml(item.text || "")}</span>
      </div>
      <small>${escapeHtml(item.provider || "mock")} / ${escapeHtml(item.status || "")}</small>
      <time>${formatDate(item.createdAt)}</time>
    </article>
  `).join("");
}

function renderWhatsappSessions(items = []) {
  if (!items.length) return `<p class="empty">Nenhuma sessao pendente.</p>`;
  return items.map((item) => `
    <article class="whatsapp-item">
      <div>
        <strong>${escapeHtml(item.phone || "Cliente WhatsApp")}</strong>
        <span>${escapeHtml(item.lastIntent || "")} / ${escapeHtml(item.status || "")}</span>
      </div>
      <button class="ghost-button clear-whatsapp-session-btn" type="button" data-session-draft="${escapeHtml(item.draftId || "")}">Limpar</button>
    </article>
  `).join("");
}

function renderEventLeads(items = [], upcoming = []) {
  const upcomingHtml = upcoming.length
    ? `<div class="events-upcoming"><strong>Próximos eventos</strong>${upcoming.map((item) => `<span>${escapeHtml(item.event?.date || "")} - ${escapeHtml(item.customer?.name || "Cliente")} / ${escapeHtml(formatServiceName(item.event?.service || "Serviço"))}</span>`).join("")}</div>`
    : `<div class="events-upcoming"><strong>Próximos eventos</strong><span>Nenhum evento datado.</span></div>`;
  if (!items.length) return `${upcomingHtml}<p class="empty">Nenhum lead na Agenda Insano.</p>`;
  return `
    ${upcomingHtml}
    ${items.map((item) => `
      <article class="event-lead ${escapeHtml(item.status)}">
        <div>
          <strong>${escapeHtml(item.customer?.name || "Cliente")}</strong>
          <span>${escapeHtml(item.customer?.phoneMasked || "")}</span>
        </div>
        <div>
          <span>Data</span>
          <strong>${escapeHtml(item.event?.date || "Sem data")}</strong>
          <small>${escapeHtml(item.event?.time || "")}</small>
        </div>
        <div>
          <span>Serviço</span>
          <strong>${escapeHtml(formatServiceName(item.event?.service || "Outro"))}</strong>
          <small>${escapeHtml(item.event?.location || "")}</small>
        </div>
        <div>
          <span>Pessoas</span>
          <strong>${item.event?.people || "-"}</strong>
          <small>${escapeHtml(item.status)}</small>
        </div>
        <div class="review-actions">
          <button class="ghost-button event-status-btn" type="button" data-event-id="${escapeHtml(item.id)}" data-event-status="needs_info" ${item.status === "canceled" ? "disabled" : ""}>Pedir info</button>
          <button class="ghost-button event-status-btn" type="button" data-event-id="${escapeHtml(item.id)}" data-event-status="quote_sent" ${item.status === "canceled" ? "disabled" : ""}>Orçamento</button>
          <button class="ghost-button cancel-event-btn" type="button" data-event-id="${escapeHtml(item.id)}" ${item.status === "canceled" ? "disabled" : ""}>Cancelar</button>
        </div>
      </article>
    `).join("")}
  `;
}

function renderTracking() {
  const filtered = filterTrackingItems(trackingItems);
  trackingCountEl.textContent = `${filtered.length} de ${trackingItems.length} pedidos`;
  if (!filtered.length) {
    trackingListEl.innerHTML = `<p class="empty">Nenhum pedido encontrado no acompanhamento.</p>`;
    return;
  }
  trackingListEl.innerHTML = filtered.map((item) => {
    const message = item.pendingWhatsappMessage || item.lastMessageSent || "";
    const needsNotice = Boolean(item.needsCustomerNotification);
    const whatsappStatus = item.whatsappDeliveryStatus === "sent"
      ? "Comunicado"
      : needsNotice
        ? "Cliente precisa ser avisado"
        : "Aguardando";
    return `
      <article class="tracking-card ${needsNotice ? "needs-notice" : "ok"}">
        <div class="tracking-card-head">
          <div>
            <strong>${escapeHtml(item.customerName || "Cliente")}</strong>
            <span>${escapeHtml(item.operation || "Operacao")}</span>
          </div>
          <span class="tracking-alert">${needsNotice ? "Cliente precisa ser avisado" : "Acompanhado"}</span>
        </div>
        <div class="tracking-grid">
          ${renderTrackingField("WhatsApp", item.customerPhone || "-")}
          ${renderTrackingField("Tipo", item.serviceType || "-")}
          ${renderTrackingField("Pagamento", item.paymentMethod || "-")}
          ${renderTrackingField("MesaOrderId", item.mesaOrderId || "-")}
          ${renderTrackingField("Status Mesa", friendlyMesaStatus(item.lastMesaStatus))}
          ${renderTrackingField("Status WhatsApp", whatsappStatus)}
          ${renderTrackingField("Criado em", item.createdAt ? formatDate(item.createdAt) : "-")}
          ${renderTrackingField("Atualizado em", item.updatedAt ? formatDate(item.updatedAt) : "-")}
        </div>
        <div class="tracking-message">
          <span>Ultima mensagem</span>
          <p>${escapeHtml(message || "Sem mensagem pendente.")}</p>
        </div>
        <div class="tracking-actions">
          <button class="ghost-button refresh-one-tracking-btn" type="button">Atualizar status</button>
          ${item.whatsappUrl ? `<button class="ghost-button open-whatsapp-btn" type="button" data-whatsapp-url="${escapeHtml(item.whatsappUrl)}">Abrir WhatsApp</button>` : ""}
          <button class="ghost-button copy-tracking-message-btn" type="button" data-message="${escapeHtml(message)}" ${message ? "" : "disabled"}>Copiar mensagem</button>
          <button class="primary-button mark-whatsapp-sent-btn" type="button" data-tracking-id="${escapeHtml(item.sambahOrderId)}" ${item.sambahOrderId ? "" : "disabled"}>Marcar como comunicado</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderTrackingField(label, value) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function filterTrackingItems(items = []) {
  const statusFilter = trackingStatusFilterEl.value;
  return items.filter((item) => {
    if (trackingFilter === "needs" && !item.needsCustomerNotification) return false;
    if (trackingFilter === "sent" && item.whatsappDeliveryStatus !== "sent") return false;
    if (trackingFilter.startsWith("op:") && item.operation !== trackingFilter.slice(3)) return false;
    if (statusFilter && item.lastMesaStatus !== statusFilter) return false;
    return true;
  });
}

function friendlyMesaStatus(status = "") {
  return mesaStatusLabels[status] || status || "Sem status";
}

async function refreshTracking() {
  refreshTrackingBtn.disabled = true;
  setTrackingFeedback("Atualizando status no Mesa...");
  try {
    await fetch("/api/orders/tracking/refresh");
    await loadTracking();
    setTrackingFeedback("Status atualizado. Confira se algum cliente precisa ser avisado.");
  } finally {
    refreshTrackingBtn.disabled = false;
  }
}

async function copyTrackingMessage(message) {
  if (!message) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = message;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  setTrackingFeedback("Mensagem copiada.");
}

function setTrackingFeedback(message) {
  trackingFeedbackEl.textContent = message;
}

function formatDraftItems(items = []) {
  if (!items.length) return "Sem produto oficial encontrado";
  return items.map((item) => `${item.qty || 1}x ${item.productId}${item.note ? ` (${item.note})` : ""}`).join(" | ");
}

function formatDraftQuestions(questions = []) {
  if (!questions.length) return "Sem pendencias";
  return questions.map((item) => item.reason || item.message || "pendencia").join(", ");
}

function formatReviewItems(items = []) {
  if (!items.length) return "Sem itens estruturados";
  return items.map((item) => {
    const qty = item.qty ?? item.quantity ?? item.quantidade ?? 1;
    const addons = Array.isArray(item.addons) && item.addons.length
      ? ` addons=${item.addons.map((addon) => addon.id || addon).join(",")}`
      : "";
    return `${qty}x ${item.productId || item.name || item.nome || "item sem productId"}${addons}`;
  }).join(" | ");
}

function formatServiceName(value = "") {
  const services = {
    food_truck_insano: "Food Truck Insano",
    beer_truck_insano: "Beer Truck Insano"
  };
  return services[value] || value;
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshDashboard() {
  await Promise.all([loadAudit(), loadMesa(), loadTracking(), loadMenu(), loadEvents(), loadReviewOrders(), loadDrafts(), loadWhatsApp()]);
}

async function retryPendingOrders() {
  retryMesaBtn.disabled = true;
  queueRetryShortcut.disabled = true;
  try {
    await fetch("/admin/mesa/retry", { method: "POST" });
    await Promise.all([loadMesa(), loadAudit()]);
  } finally {
    retryMesaBtn.disabled = false;
    queueRetryShortcut.disabled = false;
  }
}

refreshButton.addEventListener("click", refreshDashboard);
retryMesaBtn.addEventListener("click", retryPendingOrders);
queueRetryShortcut.addEventListener("click", retryPendingOrders);
sendTestOrderBtn.addEventListener("click", async () => {
  sendTestOrderBtn.disabled = true;
  try {
    await fetch("/admin/mesa/send-test-order", { method: "POST" });
    await Promise.all([loadMesa(), loadAudit()]);
  } finally {
    sendTestOrderBtn.disabled = false;
  }
});
syncMenuBtn.addEventListener("click", async () => {
  syncMenuBtn.disabled = true;
  try {
    await fetch("/admin/menu/sync", { method: "POST" });
    await Promise.all([loadMenu(), loadAudit()]);
  } finally {
    syncMenuBtn.disabled = false;
  }
});

refreshTrackingBtn.addEventListener("click", refreshTracking);

trackingStatusFilterEl.addEventListener("change", renderTracking);

trackingFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    trackingFilter = button.dataset.trackingFilter || "all";
    trackingFilterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderTracking();
  });
});

trackingListEl.addEventListener("click", async (event) => {
  const refreshButton = event.target.closest(".refresh-one-tracking-btn");
  const whatsappButton = event.target.closest(".open-whatsapp-btn");
  const copyButton = event.target.closest(".copy-tracking-message-btn");
  const markButton = event.target.closest(".mark-whatsapp-sent-btn");
  if (refreshButton) {
    await refreshTracking();
    return;
  }
  if (whatsappButton) {
    openExternalWhatsApp(whatsappButton.dataset.whatsappUrl);
    return;
  }
  if (copyButton) {
    await copyTrackingMessage(copyButton.dataset.message || "");
    return;
  }
  if (!markButton) return;
  markButton.disabled = true;
  try {
    const id = encodeURIComponent(markButton.dataset.trackingId);
    await fetch(`/api/orders/tracking/${id}/mark-whatsapp-sent`, { method: "POST" });
    await loadTracking();
    setTrackingFeedback("Pedido marcado como comunicado.");
  } finally {
    markButton.disabled = false;
  }
});

reviewOrdersListEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".cancel-review-btn");
  if (!button) return;
  button.disabled = true;
  try {
    await fetch("/admin/orders/review/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: button.dataset.reviewId })
    });
    await Promise.all([loadReviewOrders(), loadMesa(), loadAudit()]);
  } finally {
    button.disabled = false;
  }
});

draftTestBtn.addEventListener("click", async () => {
  draftTestBtn.disabled = true;
  try {
    await fetch("/admin/orders/drafts/test-parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: draftTestTextEl.value,
        customer: { name: "Cliente Teste", phone: "51999999999" }
      })
    });
    await Promise.all([loadDrafts(), loadAudit()]);
  } finally {
    draftTestBtn.disabled = false;
  }
});
draftOrdersListEl.addEventListener("click", async (event) => {
  const confirmButton = event.target.closest(".confirm-draft-btn");
  const cancelButton = event.target.closest(".cancel-draft-btn");
  const button = confirmButton || cancelButton;
  if (!button) return;
  button.disabled = true;
  try {
    await fetch(confirmButton ? "/admin/orders/drafts/confirm" : "/admin/orders/drafts/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: button.dataset.draftId })
    });
    await Promise.all([loadDrafts(), loadMesa(), loadAudit()]);
  } finally {
    button.disabled = false;
  }
});

whatsappSessionsListEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".clear-whatsapp-session-btn");
  if (!button) return;
  button.disabled = true;
  try {
    await fetch("/admin/whatsapp/sessions/clear", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: button.dataset.sessionDraft })
    });
    await loadWhatsApp();
  } finally {
    button.disabled = false;
  }
});

eventsLeadListEl.addEventListener("click", async (event) => {
  const statusButton = event.target.closest(".event-status-btn");
  const cancelButton = event.target.closest(".cancel-event-btn");
  const button = statusButton || cancelButton;
  if (!button) return;
  button.disabled = true;
  try {
    await fetch(cancelButton ? "/admin/events/leads/cancel" : "/admin/events/leads/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: button.dataset.eventId,
        status: button.dataset.eventStatus,
        reason: "Cancelado pelo painel",
        note: button.dataset.eventStatus ? `Status alterado para ${button.dataset.eventStatus}` : "Cancelado pelo painel"
      })
    });
    await Promise.all([loadEvents(), loadAudit()]);
  } finally {
    button.disabled = false;
  }
});

refreshDashboard().catch(() => {
  auditLogsEl.innerHTML = `<p class="empty">Não foi possível carregar a auditoria.</p>`;
  mesaQueueListEl.innerHTML = `<p class="empty">Não foi possível carregar a integração Mesa.</p>`;
});

async function openExternalWhatsApp(url) {
  const shell = window.electron?.shell || window.electronAPI?.shell || window.SamBahElectron?.shell;
  if (shell?.openExternal) return shell.openExternal(url);
  window.open(url, "_blank", "noopener,noreferrer");
}
