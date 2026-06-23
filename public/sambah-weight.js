const state = { role: localStorage.getItem("sambahEcoRole") || "ADMIN" };
const $ = (selector) => document.querySelector(selector);

function headers() {
  return { "x-sambah-role": state.role };
}

async function getJson(path) {
  const response = await fetch(path, { headers: headers() });
  return response.json();
}

async function postJson(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
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
  $("#weightNotice").textContent = message;
  $("#weightNotice").classList.toggle("error", error);
}

function row(title, data) {
  return '<article class="eco-table-card"><header><strong>' + esc(title) + "</strong><small>" + esc(data.status || data.type || data.eventType || "") + '</small></header><pre class="eco-pre">' + esc(JSON.stringify(data, null, 2)) + "</pre></article>";
}

document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = $("#ecoRole");
  roleSelect.value = state.role;
  roleSelect.addEventListener("change", () => {
    state.role = roleSelect.value;
    localStorage.setItem("sambahEcoRole", state.role);
  });
  $("#calibrateWeight").addEventListener("click", calibrate);
  $("#simulateLocker").addEventListener("click", simulateLocker);
  $("#simulateFraud").addEventListener("click", simulateFraud);
  $("#simulateBeverage").addEventListener("click", simulateBeverage);
  $("#simulateUnder").addEventListener("click", simulateUnder);
  $("#simulateInventory").addEventListener("click", simulateInventory);
  $("#simulatePickup").addEventListener("click", simulatePickup);
  load();
});

async function calibrate() {
  const result = await postJson("/api/sambah-pay/weight/calibrate", { device_id: "mock-weight-panel", reference_weight: 1000, unit: "g" });
  notice(result.ok ? "Calibracao simulada registrada." : result.message || result.error, !result.ok);
  await load();
}

async function simulateLocker() {
  await postJson("/api/sambah-pay/locker/bootstrap");
  const result = await postJson("/api/sambah-pay/weight/simulate-locker-zone", { zone_id: "Z01", expected_weight: 520, actual_weight: 518, tolerance_percent: 8 });
  notice(result.ok ? "Locker validado por peso: " + result.validation.status : result.message || result.error, !result.ok);
  await load();
}

async function simulateFraud() {
  const result = await postJson("/api/sambah-pay/weight/simulate-beverage", { expected_weight: 400, actual_weight: 650, payment_confirmed: true, force_fraud: true });
  notice(result.ok ? "Divergencia critica simulada: " + result.validation.status : result.message || result.error, true);
  await load();
}

async function simulateBeverage() {
  const result = await postJson("/api/sambah-pay/weight/simulate-beverage", { expected_weight: 400, actual_weight: 392 });
  notice(result.ok ? "Bebida por peso: " + result.validation.status : result.message || result.error, !result.ok);
  await load();
}

async function simulateUnder() {
  const result = await postJson("/api/sambah-pay/weight/simulate-self-service", { expected_weight: 450, actual_weight: 250 });
  notice(result.ok ? "Self-service por peso: " + result.validation.status : result.message || result.error, !result.ok);
  await load();
}

async function simulateInventory() {
  await postJson("/api/sambah-pay/locker/bootstrap");
  const result = await postJson("/api/sambah-pay/weight/validate", { device_id: "mock-locker-scale", zone_id: "Z01", product_id: "agua", use_case: "stock_inventory_weight", expected_weight: 3120, actual_weight: 1040, unit_weight: 520, logical_quantity: 6, expected_weight_unit: "g" });
  notice(result.ok ? "Estoque por peso: " + (result.stock?.mismatch ? "divergente" : "ok") : result.message || result.error, !result.ok);
  await load();
}

async function simulatePickup() {
  const result = await postJson("/api/sambah-pay/weight/simulate-pickup", { expected_weight: 800, actual_weight: 798 });
  notice(result.ok ? "Pickup por peso: " + result.validation.status : result.message || result.error, !result.ok);
  await load();
}

async function load() {
  const [readings, validations, alerts, events, security] = await Promise.all([
    getJson("/api/sambah-pay/weight/readings"),
    getJson("/api/sambah-pay/weight/validations"),
    getJson("/api/sambah-pay/weight/alerts"),
    getJson("/api/sambah-pay/weight/events"),
    getJson("/api/sambah-pay/security/events")
  ]);
  $("#readingCount").textContent = readings.total || 0;
  $("#validationCount").textContent = validations.total || 0;
  $("#alertCount").textContent = alerts.total || 0;
  $("#eventCount").textContent = events.total || 0;
  $("#weightDetails").innerHTML = [
    ...(validations.items || []).slice(0, 5).map((item) => row("Validacao", item)),
    ...(readings.items || []).slice(0, 5).map((item) => row("Leitura", item)),
    ...(alerts.items || []).slice(0, 5).map((item) => row("Alerta", item)),
    ...(events.items || []).slice(0, 5).map((item) => row("Evento", item))
  ].join("") || '<p class="eco-muted">Sem leituras ainda.</p>';
  $("#securityEvents").innerHTML = (security.items || [])
    .filter((item) => item.module === "weight-control")
    .slice(0, 8)
    .map((item) => row(item.eventType, item))
    .join("") || '<p class="eco-muted">Sem eventos futuros de peso.</p>';
}
