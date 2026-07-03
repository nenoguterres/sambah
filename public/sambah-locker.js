const state = {
  role: localStorage.getItem("sambahEcoRole") || "ADMIN",
  session: null,
  pin: null,
  items: []
};

const $ = (selector) => document.querySelector(selector);

function headers() {
  return { "x-sambah-role": state.role };
}

async function getJson(path) {
  return fetch(path, { headers: headers() }).then((response) => response.json());
}

async function postJson(path, body = {}) {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify(body)
  }).then((response) => response.json());
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
  $("#lockerNotice").textContent = message;
  $("#lockerNotice").classList.toggle("error", error);
}

function row(title, data) {
  return '<article class="eco-table-card"><header><strong>' + esc(title) + "</strong><small>" + esc(data.status || data.type || "") + '</small></header><pre class="eco-pre">' + esc(JSON.stringify(data, null, 2)) + "</pre></article>";
}

document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = $("#ecoRole");
  roleSelect.value = state.role;
  roleSelect.addEventListener("change", () => {
    state.role = roleSelect.value;
    localStorage.setItem("sambahEcoRole", state.role);
  });

  $("#bootstrapLocker").addEventListener("click", bootstrap);
  $("#createOrderDemo").addEventListener("click", createOrderDemo);
  $("#validatePin").addEventListener("click", validatePin);
  $("#openZones").addEventListener("click", openZones);
  $("#completePickup").addEventListener("click", completePickup);
  $("#partialPickup").addEventListener("click", partialPickup);
  $("#extraPickup").addEventListener("click", extraPickup);
  load();
});

async function bootstrap() {
  const result = await postJson("/api/sambah-pay/locker/bootstrap");
  const total = result.total || result.zones?.length || result.zones?.total || 0;
  notice(result.ok ? "Locker demo preparado. Zonas: " + total : result.error, !result.ok);
  await load();
}

async function createOrderDemo() {
  await postJson("/api/sambah-pay/locker/bootstrap");
  const payment = await postJson("/api/sambah-pay/payments", {
    amount: 14,
    method: "manual_simulated",
    status: "paid",
    customer_id: "locker-demo"
  });
  const zones = await getJson("/api/sambah-pay/locker/zones");
  const agua = zones.items.find((zone) => zone.product_id === "agua");
  const refri = zones.items.find((zone) => zone.product_id === "refri");
  const created = await postJson("/api/sambah-pay/secure-pickup/create", {
    payment_id: payment.payment.id,
    order_id: "locker-demo-order",
    customer_id: "locker-demo",
    phone: "51999990000",
    device_id: agua.device_id,
    items: [
      { product_id: "agua", zone_id: agua.zone_id, quantity: 1, expected_weight: agua.expected_unit_weight },
      { product_id: "refri", zone_id: refri.zone_id, quantity: 1, expected_weight: refri.expected_unit_weight }
    ]
  });
  state.session = created.session;
  state.pin = created.pin;
  state.items = created.items || [];
  notice(created.ok ? "Pedido demo criado com PIN unico." : created.message || created.error, !created.ok);
  renderSession();
  await load();
}

async function validatePin() {
  if (!state.pin) return notice("Crie o pedido demo primeiro.", true);
  const result = await postJson("/api/sambah-pay/secure-pickup/validate-pin", { pin: state.pin });
  notice(result.ok ? "PIN valido para a sessao inteira." : result.error, !result.ok);
}

async function openZones() {
  if (!state.pin) return notice("Crie o pedido demo primeiro.", true);
  const result = await postJson("/api/sambah-pay/secure-pickup/open-authorized-zones", { pin: state.pin });
  if (result.ok) {
    state.session = result.session;
    const zones = result.opened_zones.map((entry) => entry.zone_id || entry.zone?.zone_id).filter(Boolean);
    notice("Zonas autorizadas abertas: " + zones.join(", "));
  } else {
    notice(result.message || result.error, true);
  }
  await load();
}

async function completePickup() {
  if (!state.session) return notice("Crie o pedido demo primeiro.", true);
  for (const item of state.items) {
    await postJson("/api/sambah-pay/secure-pickup/confirm-item", {
      pickup_session_id: state.session.id,
      item_id: item.id,
      actual_weight: item.expected_weight
    });
  }
  const result = await postJson("/api/sambah-pay/secure-pickup/complete", { session_id: state.session.id });
  state.session = result.session;
  state.items = result.items || state.items;
  notice("Retirada finalizada: " + result.session.status);
  await load();
}

async function partialPickup() {
  if (!state.session) return notice("Crie o pedido demo primeiro.", true);
  const first = state.items[0];
  await postJson("/api/sambah-pay/secure-pickup/confirm-item", {
    pickup_session_id: state.session.id,
    item_id: first.id,
    actual_weight: first.expected_weight
  });
  const result = await postJson("/api/sambah-pay/secure-pickup/complete", { session_id: state.session.id });
  state.session = result.session;
  state.items = result.items || state.items;
  notice("Retirada parcial simulada: " + result.session.status);
  await load();
}

async function extraPickup() {
  if (!state.session) return notice("Crie o pedido demo primeiro.", true);
  const first = state.items[0];
  const result = await postJson("/api/sambah-pay/secure-pickup/confirm-item", {
    pickup_session_id: state.session.id,
    item_id: first.id,
    actual_weight: first.expected_weight * 2
  });
  state.session = result.session;
  notice("Divergencia simulada: " + result.item.status, true);
  await load();
}

async function load() {
  const [zones, events, attempts] = await Promise.all([
    getJson("/api/sambah-pay/locker/zones"),
    getJson("/api/sambah-pay/secure-pickup/events"),
    getJson("/api/sambah-pay/secure-pickup/attempts")
  ]);
  $("#zonesGrid").innerHTML = (zones.items || [])
    .map((zone) => '<article class="eco-card"><h3>' + esc(zone.label) + '</h3><span class="eco-status">' + esc(zone.status) + " / " + esc(zone.door_status) + "</span><strong>" + esc(zone.zone_id) + "</strong><p>" + esc(zone.product_id) + " | " + esc(zone.size) + " | estoque " + esc(zone.stock_quantity) + "</p></article>")
    .join("") || '<p class="eco-muted">Prepare o locker demo.</p>';
  $("#lockerDetails").innerHTML = [
    ...(state.items || []).map((item) => row("Item " + item.product_id, item)),
    ...(events.items || []).slice(0, 5).map((event) => row(event.type, event)),
    ...(attempts.items || []).slice(0, 5).map((attempt) => row("Tentativa PIN", attempt))
  ].join("") || '<p class="eco-muted">Sem eventos.</p>';
  renderSession();
}

function renderSession() {
  if (!state.session) return;
  $("#pinValue").textContent = state.pin || "-";
  $("#sessionStatus").textContent = state.session.status;
  $("#itemCount").textContent = state.items.length;
  $("#zoneCount").textContent = new Set(state.items.map((item) => item.zone_id)).size;
  $("#pinState").textContent = "PIN da compra inteira";
}
