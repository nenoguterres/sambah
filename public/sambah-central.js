const state = {
  role: localStorage.getItem("sambahEcoRole") || "ADMIN",
  lastStatus: null,
  demoSession: null
};

const rolePermissions = {
  ADMIN: ["bootstrap", "guided_demo", "operate", "audit"],
  CAIXA: ["guided_demo", "operate"],
  OPERADOR: ["guided_demo", "operate"],
  ATENDENTE: [],
  AUDITOR: ["audit"]
};

const $ = (selector) => document.querySelector(selector);

function bindRole() {
  const select = $("#ecoRole");
  if (!select) return;
  select.value = state.role;
  select.addEventListener("change", () => {
    state.role = select.value;
    localStorage.setItem("sambahEcoRole", state.role);
    applyRole();
    load();
  });
}

function headers() {
  return { "x-sambah-role": state.role };
}

async function getJson(path) {
  const response = await fetch(path, { headers: headers() });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `Falha ao consultar ${path}`);
  return payload;
}

async function postJson(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `Falha ao executar ${path}`);
  return payload;
}

function esc(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function notice(selector, message, error = false) {
  const node = $(selector);
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", Boolean(error));
}

function can(action) {
  return (rolePermissions[state.role] || []).includes(action);
}

function applyRole() {
  document.querySelectorAll("[data-permission]").forEach((node) => {
    const allowed = can(node.dataset.permission);
    node.disabled = !allowed;
    node.title = allowed ? "" : "Perfil sem permissao para esta acao simulada.";
  });
  const roleText = $("#roleSummary");
  if (roleText) roleText.textContent = `${state.role}: ${(rolePermissions[state.role] || ["consulta"]).join(", ") || "consulta"}`;
}

function card(item) {
  const attention = /atencao|fraud|warning|error/i.test(`${item.status || ""} ${item.summary || ""}`);
  return `<article class="eco-card ${attention ? "eco-card-attention" : ""}">
    <h3>${esc(item.title || item.name || item.id)}</h3>
    <span class="eco-status">${esc(item.status || item.type || "mock")}</span>
    <strong>${Number(item.count || 0)}</strong>
    <p>${esc(item.summary || item.message || "")}</p>
    <footer><a class="eco-secondary" href="${esc(item.href || "#")}">Abrir painel</a></footer>
  </article>`;
}

function row(title, item) {
  return `<article class="eco-table-card">
    <header><strong>${esc(title)}</strong><small>${esc(item.status || item.type || item.eventType || item.created_at || "")}</small></header>
    <pre class="eco-pre">${esc(JSON.stringify(item, null, 2))}</pre>
  </article>`;
}

function formatDate(value) {
  if (!value) return "Sem data";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR");
}

function field(label, value) {
  return `<div><span>${esc(label)}</span><strong>${esc(value || "-")}</strong></div>`;
}

function fieldGrid(fields) {
  return `<div class="eco-detail-grid">${fields.map(([label, value]) => field(label, value)).join("")}</div>`;
}

function alertCard(alert) {
  return `<article class="eco-table-card eco-alert-card">
    <header>
      <strong>${esc(alert.message || alert.type || "Alerta operacional")}</strong>
      <small>${esc(alert.status || "open")}</small>
    </header>
    ${fieldGrid([
      ["Severidade", alert.severity],
      ["Tipo", alert.type],
      ["Device", alert.device_id],
      ["Criado em", formatDate(alert.created_at)]
    ])}
  </article>`;
}

function auditCard(audit) {
  return `<article class="eco-table-card">
    <header>
      <strong>${esc(audit.message || audit.type || "Evento de auditoria")}</strong>
      <small>${esc(audit.status || "info")}</small>
    </header>
    ${fieldGrid([
      ["Tipo", audit.type],
      ["Origem", audit.source || audit.module || "SamBah"],
      ["Criado em", formatDate(audit.created_at || audit.createdAt)],
      ["Operador", audit.context?.username || audit.context?.role || "-"]
    ])}
  </article>`;
}

function securityCard(event) {
  return `<article class="eco-table-card">
    <header>
      <strong>${esc(event.eventType || event.type || "Evento preparado")}</strong>
      <small>${esc(event.severity || event.status || "simulado")}</small>
    </header>
    ${fieldGrid([
      ["Device", event.deviceId || event.device_id],
      ["Ação requerida", event.actionRequired ? "Sim" : "Não"],
      ["Enviado", event.sent ? "Sim" : "Não"],
      ["Criado em", formatDate(event.timestamp || event.created_at || event.createdAt)]
    ])}
  </article>`;
}

function kpi(label, value) {
  return `<article class="eco-kpi"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function step(label, status = "pending", detail = "") {
  return `<li class="eco-step ${status}"><strong>${esc(label)}</strong><span>${esc(detail)}</span></li>`;
}

document.addEventListener("DOMContentLoaded", () => {
  bindRole();
  applyRole();
  $("#bootstrapDemo").addEventListener("click", () => bootstrap("#centralNotice"));
  $("#guidedDemo").addEventListener("click", guidedDemo);
  $("#refreshCentral").addEventListener("click", load);
  $("#simulateCentralFraud").addEventListener("click", simulateFraud);
  load();
});

async function bootstrap(selector) {
  if (!can("bootstrap")) return notice(selector, "Perfil sem permissao para preparar demo.", true);
  const result = await postJson("/api/sambah-pay/demo/bootstrap");
  notice(selector, result.ok ? "Demo operacional pronta: " + (result.created || []).join(", ") : result.message || result.error, !result.ok);
  await load();
}

async function guidedDemo() {
  if (!can("guided_demo")) return notice("#centralNotice", "Perfil sem permissao para executar o demo guiado.", true);
  const list = $("#guidedSteps");
  const setSteps = (items) => { list.innerHTML = items.join(""); };
  try {
    setSteps([step("Preparar Locker e Weight", "active", "Criando base mock...")]);
    await postJson("/api/sambah-pay/locker/bootstrap");

    const zones = await getJson("/api/sambah-pay/locker/zones");
    const agua = zones.items.find((zone) => zone.product_id === "agua");
    const refri = zones.items.find((zone) => zone.product_id === "refri");
    const payment = await postJson("/api/sambah-pay/payments", {
      amount: 30,
      method: "manual_simulated",
      status: "paid",
      customer_id: "central-guided-demo"
    });
    setSteps([
      step("Preparar Locker e Weight", "done", `${zones.total} zonas`),
      step("Criar pagamento mock", "done", payment.payment?.status || "paid"),
      step("Gerar Secure Pickup", "active", "2 produtos")
    ]);

    const pickup = await postJson("/api/sambah-pay/secure-pickup/create", {
      payment_id: payment.payment.id,
      order_id: "central-guided-demo",
      customer_id: "central-guided-demo",
      items: [
        { product_id: "agua", zone_id: agua.zone_id, quantity: 1, expected_weight: agua.expected_unit_weight },
        { product_id: "refri", zone_id: refri.zone_id, quantity: 1, expected_weight: refri.expected_unit_weight }
      ]
    });
    state.demoSession = pickup;
    setSteps([
      step("Preparar Locker e Weight", "done", `${zones.total} zonas`),
      step("Criar pagamento mock", "done", payment.payment.status),
      step("Gerar Secure Pickup", "done", `PIN ${pickup.pin}`),
      step("Validar PIN e abrir zonas", "active", "Somente autorizadas")
    ]);

    await postJson("/api/sambah-pay/secure-pickup/validate-pin", { session_id: pickup.session.id, pin: pickup.pin });
    const opened = await postJson("/api/sambah-pay/secure-pickup/open-authorized-zones", { session_id: pickup.session.id, pin: pickup.pin });
    const item = pickup.items[0];
    setSteps([
      step("Preparar Locker e Weight", "done", `${zones.total} zonas`),
      step("Criar pagamento mock", "done", payment.payment.status),
      step("Gerar Secure Pickup", "done", `PIN ${pickup.pin}`),
      step("Validar PIN e abrir zonas", "done", `${opened.opened_zones.length} zonas`),
      step("Validar peso", "active", item.product_id)
    ]);

    const weight = await postJson("/api/sambah-pay/weight/validate", {
      device_id: pickup.session.device_id,
      zone_id: item.zone_id,
      product_id: item.product_id,
      pickup_session_id: pickup.session.id,
      pickup_item_id: item.id,
      use_case: "locker_zone_weight",
      expected_weight: item.expected_weight,
      actual_weight: item.expected_weight,
      tolerance_percent: item.tolerance_percent
    });
    setSteps([
      step("Preparar Locker e Weight", "done", `${zones.total} zonas`),
      step("Criar pagamento mock", "done", payment.payment.status),
      step("Gerar Secure Pickup", "done", `PIN ${pickup.pin}`),
      step("Validar PIN e abrir zonas", "done", `${opened.opened_zones.length} zonas`),
      step("Validar peso", "done", weight.validation.status),
      step("Auditoria e eventos", "done", "Registrados")
    ]);
    notice("#centralNotice", "Demo guiado concluido: pagamento, locker, PIN, peso e auditoria simulados.");
    await load();
  } catch (error) {
    setSteps([step("Demo guiado", "error", "Falha operacional simulada")]);
    notice("#centralNotice", error.message || "Falha ao executar demo guiado.", true);
  }
}

async function simulateFraud() {
  if (!can("operate")) return notice("#centralNotice", "Perfil sem permissao para simular divergencia.", true);
  const result = await postJson("/api/sambah-pay/weight/simulate-beverage", {
    expected_weight: 400,
    actual_weight: 650,
    payment_confirmed: true,
    force_fraud: true
  });
  notice("#centralNotice", result.ok ? `Divergencia critica simulada: ${result.validation.status}` : result.message || result.error, !result.ok);
  await load();
}

function renderMission(status, security) {
  const totals = status.totals || {};
  const openAlerts = totals.open_alerts || 0;
  const securityCount = totals.security_events || 0;
  const operational = openAlerts ? "Atencao operacional" : "Operacional";
  $("#missionSummary").innerHTML = [
    kpi("Estado", openAlerts ? openAlerts : 1),
    kpi("Alertas abertos", openAlerts),
    kpi("Eventos i9ACAO", securityCount),
    kpi("Validacoes peso", totals.weight_validations)
  ].join("");
  $("#missionState").textContent = operational;
  $("#criticalAlerts").innerHTML = (status.samples?.alerts || []).length
    ? status.samples.alerts.slice(0, 5).map(alertCard).join("")
    : '<p class="eco-muted">Sem alertas abertos no momento.</p>';
  $("#recentAudit").innerHTML = (status.samples?.audit || []).slice(0, 5).map(auditCard).join("") || '<p class="eco-muted">Sem eventos recentes.</p>';
  $("#securityEvents").innerHTML = (security.items || []).length
    ? security.items.slice(0, 8).map(securityCard).join("")
    : '<p class="eco-muted">Estrutura valida, sem eventos futuros enviados.</p>';
}

function updateOperationalPath(name, { status, summary, state = "ok" }) {
  const key = name.charAt(0).toUpperCase() + name.slice(1);
  const card = document.querySelector(`[data-path="${name}"]`);
  const statusNode = $(`#path${key}Status`);
  const summaryNode = $(`#path${key}Summary`);
  if (card) card.dataset.state = state;
  if (statusNode) statusNode.textContent = status;
  if (summaryNode) summaryNode.textContent = summary;
}

function pathFailure(name, label, reason) {
  updateOperationalPath(name, {
    status: "Indisponível",
    summary: `${label}: ${reason || "não respondeu"}`,
    state: "error"
  });
}

async function loadOperationalPaths() {
  const checks = await Promise.allSettled([
    getJson("/admin/mesa/status"),
    Promise.all([getJson("/health"), getJson("/api/crm/resumo")]),
    getJson("/api/sambah-pay/ecosystem/status"),
    getJson("/api/perola/operational-status")
  ]);

  const [mesaCheck, sambahCheck, payCheck, perolaCheck] = checks;

  if (mesaCheck.status === "fulfilled") {
    const mesa = mesaCheck.value;
    const queue = mesa.queue || {};
    updateOperationalPath("mesa", {
      status: mesa.ok ? "Conectado" : "Fila local ativa",
      summary: `${Number(queue.pending || 0)} pendentes, ${Number(queue.accepted || 0)} aceitos. Ponte ${mesa.ok ? "conectada" : "aguardando o Mesa"}.`,
      state: mesa.ok ? "ok" : "attention"
    });
  } else {
    pathFailure("mesa", "Ponte Mesa", mesaCheck.reason?.message);
  }

  if (sambahCheck.status === "fulfilled") {
    const [health, crm] = sambahCheck.value;
    updateOperationalPath("sambah", {
      status: health.ok ? "Operacional" : "Atenção",
      summary: `${Number(crm.leads || 0)} leads, ${Number(crm.clientes || 0)} clientes e ${Number(crm.atendimentos || 0)} atendimentos.`,
      state: health.ok ? "ok" : "attention"
    });
  } else {
    pathFailure("sambah", "Núcleo SamBah", sambahCheck.reason?.message);
  }

  if (payCheck.status === "fulfilled") {
    const totals = payCheck.value.totals || {};
    updateOperationalPath("pay", {
      status: "Operacional",
      summary: `${Number(totals.payments || 0)} pagamentos, ${Number(totals.devices || 0)} dispositivos e ${Number(totals.open_alerts || 0)} alertas abertos.`,
      state: Number(totals.open_alerts || 0) ? "attention" : "ok"
    });
  } else {
    pathFailure("pay", "SamBah Pay", payCheck.reason?.message);
  }

  if (perolaCheck.status === "fulfilled") {
    const perola = perolaCheck.value;
    const pending = Number(perola.mesaIntegration?.pendingInteractions || 0);
    updateOperationalPath("perola", {
      status: perola.ok ? (perola.mode || "Operacional") : "Atenção",
      summary: `${perola.publication || "Publicação manual"}. ${pending} interações do Mesa pendentes.`,
      state: perola.ok ? (pending ? "attention" : "ok") : "error"
    });
  } else {
    pathFailure("perola", "Pérola", perolaCheck.reason?.message);
  }

  const updatedAt = $("#pathsUpdatedAt");
  if (updatedAt) updatedAt.textContent = new Date().toLocaleString("pt-BR");
}

async function load() {
  notice("#centralNotice", "Sincronizando Mesa, SamBah, Pay e Pérola...");
  const pathsPromise = loadOperationalPaths();
  try {
    const [status, security] = await Promise.all([
      getJson("/api/sambah-pay/ecosystem/status"),
      getJson("/api/sambah-pay/security/events")
    ]);
    state.lastStatus = status;
    $("#updatedAt").textContent = status.generated_at ? new Date(status.generated_at).toLocaleString("pt-BR") : "Sem dados";
    const preferredKpis = ["payments", "devices", "locker_zones", "weight_validations", "event_bus_events", "event_dead_letter", "security_incidents_open", "lgpd_privacy_requests_open", "security_actions_mocked"];
    $("#kpis").innerHTML = preferredKpis.map((key) => kpi(key, status.totals?.[key])).join("");
    $("#moduleCards").innerHTML = (status.cards || []).map(card).join("");
    renderMission(status, security);
    applyRole();
    notice("#centralNotice", "Central sincronizada: Mesa, SamBah, Pay e Pérola.");
  } catch (error) {
    notice("#centralNotice", error.message || "Falha ao sincronizar a Central.", true);
  } finally {
    await pathsPromise;
  }
}
