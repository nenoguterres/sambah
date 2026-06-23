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
  $("#messagingNotice").textContent = message;
  $("#messagingNotice").classList.toggle("error", Boolean(error));
}

function kpi(label, value) {
  return `<article class="eco-kpi"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></article>`;
}

function row(title, item) {
  return `<article class="eco-table-card">
    <header><strong>${esc(title)}</strong><small>${esc(item.status || item.topic || item.key || item.type || "")}</small></header>
    <pre class="eco-pre">${esc(JSON.stringify(item, null, 2))}</pre>
  </article>`;
}

async function load() {
  const [config, health, brokers, contracts, routes] = await Promise.all([
    getJson("/api/sambah-messaging/config"),
    getJson("/api/sambah-messaging/health"),
    getJson("/api/sambah-messaging/brokers"),
    getJson("/api/sambah-messaging/contracts"),
    getJson("/api/sambah-messaging/routes")
  ]);
  $("#brokerMode").textContent = config.broker || "internal";
  $("#messagingKpis").innerHTML = [
    kpi("contratos", contracts.total),
    kpi("topicos", contracts.topics.length),
    kpi("redis_configurado", config.redisConfigured ? 1 : 0),
    kpi("rabbitmq_configurado", config.rabbitmqConfigured ? 1 : 0)
  ].join("");
  $("#brokerList").innerHTML = [
    row("Config", config),
    row("Health", health),
    ...brokers.brokers.map((broker) => row(broker.label, broker))
  ].join("");
  $("#contractsCount").textContent = String(contracts.total);
  $("#topicsCount").textContent = String(routes.topics.length);
  $("#contractList").innerHTML = contracts.items.map((contract) => row(contract.type, contract)).join("");
  $("#routeList").innerHTML = routes.items.map((route) => row(route.routingKey, route)).join("");
  notice("Mensageria sincronizada. Event Bus interno segue como padrao.");
}

async function publishTest() {
  const result = await postJson("/api/sambah-messaging/publish-test", {
    type: "messaging.test.published",
    payload: { panel: "sambah-messaging", simulated: true }
  });
  notice(result.ok ? `Mensagem teste publicada: ${result.message.id}` : result.error, !result.ok);
  if (result.message?.correlationId) $("#replayCorrelationId").value = result.message.correlationId;
  await load();
  if (result.message?.correlationId) notice(`Mensagem teste publicada: ${result.message.id}`);
}

async function simulateRedis() {
  const result = await postJson("/api/sambah-messaging/simulate-redis");
  notice(result.ok ? result.message : result.error, !result.ok);
}

async function simulateRabbitmq() {
  const result = await postJson("/api/sambah-messaging/simulate-rabbitmq");
  notice(result.ok ? result.message : result.error, !result.ok);
}

async function simulateFailure() {
  const result = await postJson("/api/sambah-messaging/simulate-broker-failure", { broker: "redis_streams" });
  notice(result.ok ? `Falha simulada registrada: ${result.failure.id}` : result.error, !result.ok);
  await load();
  if (result.ok) notice(`Falha simulada registrada: ${result.failure.id}`);
}

async function replay() {
  const correlationId = $("#replayCorrelationId").value.trim();
  if (!correlationId) return notice("Informe um correlationId para replay simulado.", true);
  const result = await postJson(`/api/sambah-messaging/replay/${encodeURIComponent(correlationId)}`, { actor: "admin", role: "ADMIN" });
  $("#replayResult").innerHTML = row(result.ok ? "Replay concluido" : "Replay nao encontrado", result);
  notice(result.ok ? `Replay simulado concluido para ${correlationId}` : result.error, !result.ok);
  await load();
}

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshMessaging").addEventListener("click", load);
  $("#publishTest").addEventListener("click", publishTest);
  $("#simulateRedis").addEventListener("click", simulateRedis);
  $("#simulateRabbitmq").addEventListener("click", simulateRabbitmq);
  $("#simulateFailure").addEventListener("click", simulateFailure);
  $("#replayButton").addEventListener("click", replay);
  load();
});
