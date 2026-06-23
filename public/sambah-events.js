const $ = (selector) => document.querySelector(selector);

async function getJson(path) {
  const response = await fetch(path);
  return response.json();
}

async function postJson(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

function esc(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function notice(message, error = false) {
  $("#eventsNotice").textContent = message;
  $("#eventsNotice").classList.toggle("error", Boolean(error));
}

function kpi(label, value) {
  return `<article class="eco-kpi"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function row(title, item) {
  return `<article class="eco-table-card">
    <header><strong>${esc(title)}</strong><small>${esc(item.status || item.type || item.consumer || item.stage || "")}</small></header>
    <pre class="eco-pre">${esc(JSON.stringify(item, null, 2))}</pre>
  </article>`;
}

function consumerCard(item) {
  return `<article class="eco-card">
    <h3>${esc(item.name)}</h3>
    <span class="eco-status">${esc(item.status)}</span>
    <strong>${Number(item.processed || 0)}</strong>
    <p>Consumidor simulado com idempotencia por evento.</p>
  </article>`;
}

async function load() {
  const [events, outbox, deadLetter, consumers, metrics] = await Promise.all([
    getJson("/api/sambah-events?limit=30"),
    getJson("/api/sambah-events/outbox?limit=30"),
    getJson("/api/sambah-events/dead-letter?limit=30"),
    getJson("/api/sambah-events/consumers"),
    getJson("/api/sambah-observability/metrics")
  ]);
  $("#eventsUpdated").textContent = new Date().toLocaleString("pt-BR");
  $("#eventKpis").innerHTML = [
    kpi("total_events", metrics.total_events),
    kpi("pending_events", metrics.pending_events),
    kpi("processed_events", metrics.processed_events),
    kpi("failed_events", metrics.failed_events),
    kpi("dead_letter_events", metrics.dead_letter_events),
    kpi("erp_failures", metrics.erp_failures)
  ].join("");
  $("#eventsList").innerHTML = (events.items || []).slice(0, 15).map((item) => row(item.type, item)).join("") || '<p class="eco-muted">Nenhum evento publicado.</p>';
  $("#outboxList").innerHTML = (outbox.items || []).slice(0, 15).map((item) => row(item.type, item)).join("") || '<p class="eco-muted">Outbox vazio.</p>';
  $("#deadLetterList").innerHTML = (deadLetter.items || []).slice(0, 10).map((item) => row(item.type, item)).join("") || '<p class="eco-muted">Sem dead letter.</p>';
  $("#consumerList").innerHTML = (consumers.consumers || []).map(consumerCard).join("");
  notice("Event Bus sincronizado em modo simulado.");
}

async function publishPayment() {
  const result = await postJson("/api/sambah-events/simulate-payment-confirmed", { amount: 42 });
  notice(result.ok ? `Pagamento confirmado publicado: ${result.event.id}` : result.error, !result.ok);
  await load();
}

async function processQueue() {
  const result = await postJson("/api/sambah-events/process", { limit: 50 });
  notice(result.ok ? `Fila processada: ${result.processed} OK, ${result.failed} falhas.` : result.error, !result.ok);
  await load();
}

async function simulateErpFailure() {
  const result = await postJson("/api/sambah-events/simulate-erp-failure", { payment_id: "payment-erp-demo" });
  notice(result.ok ? `Falha ERP preparada: ${result.event.correlationId}` : result.error, !result.ok);
  await load();
}

async function retryAll() {
  const result = await postJson("/api/sambah-events/retry-all");
  notice(result.ok ? `Eventos reenfileirados: ${result.retried}` : result.error, !result.ok);
  await load();
}

async function searchCorrelation() {
  const id = $("#correlationInput").value.trim();
  if (!id) return notice("Informe um correlationId.", true);
  const result = await getJson(`/api/sambah-events/correlation/${encodeURIComponent(id)}`);
  $("#correlationResult").innerHTML = [
    ...(result.events || []).map((item) => row(item.type, item)),
    ...(result.traces || []).map((item) => row(item.stage, item))
  ].join("") || '<p class="eco-muted">Nada encontrado para esta correlacao.</p>';
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshEvents").addEventListener("click", load);
  $("#publishPayment").addEventListener("click", publishPayment);
  $("#processQueue").addEventListener("click", processQueue);
  $("#simulateErpFailure").addEventListener("click", simulateErpFailure);
  $("#retryAll").addEventListener("click", retryAll);
  $("#searchCorrelation").addEventListener("click", searchCorrelation);
  load();
});
