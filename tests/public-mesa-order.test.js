import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.js";
import { createWhatsAppV2State } from "../src/whatsapp/v2/conversationState.js";
import { InMemoryWhatsAppV2ConversationRepository } from "../src/whatsapp/v2/inMemoryRepositories.js";
import { buildConfirmedCustomerOrder, hashCustomerOrderToken, matchesCustomerOrderToken, sanitizePublicMesaMenu } from "../src/publicMesaOrderService.js";

const rawMenu = {
  updatedAt: "2026-07-14T00:00:00.000Z",
  items: [{
    productId: "burger-1",
    name: "Burger Xeriffe",
    category: "Burgers",
    description: "Burger da casa",
    price: 25,
    imageUrl: "https://cdn.example.test/burger.jpg",
    available: true,
    stock: 2,
    preparationSector: "cozinha",
    addons: [{ id: "bacon", name: "Bacon", price: 4, available: true }, { id: "secret", name: "Indisponivel", price: 1, available: false }]
  }, { productId: "off", name: "Indisponivel", price: 10, available: false }]
};

test("cardapio publico remove estoque, setor e produtos indisponiveis", () => {
  const menu = sanitizePublicMesaMenu(rawMenu);
  assert.equal(menu.items.length, 1);
  assert.equal(menu.items[0].imageUrl, "https://cdn.example.test/burger.jpg");
  assert.equal(Object.hasOwn(menu.items[0], "stock"), false);
  assert.equal(Object.hasOwn(menu.items[0], "preparationSector"), false);
  assert.deepEqual(menu.items[0].addons.map((item) => item.id), ["bacon"]);
});

test("servidor recalcula produtos e adicionais sem confiar no valor do navegador", () => {
  const result = buildConfirmedCustomerOrder(rawMenu, [{ productId: "burger-1", quantity: 2, addonIds: ["bacon"], price: 0.01 }]);
  assert.equal(result.ok, true);
  assert.equal(result.order.items[0].unitPrice, 29);
  assert.equal(result.order.total, 58);
});

test("comanda rejeita produto, adicional e quantidade invalidos", () => {
  assert.equal(buildConfirmedCustomerOrder(rawMenu, [{ productId: "missing", quantity: 1 }]).error, "product_unavailable");
  assert.equal(buildConfirmedCustomerOrder(rawMenu, [{ productId: "burger-1", quantity: 1, addonIds: ["missing"] }]).error, "addon_unavailable");
  assert.equal(buildConfirmedCustomerOrder(rawMenu, [{ productId: "burger-1", quantity: 99 }]).error, "invalid_quantity");
});

test("token da comanda e comparado por hash", () => {
  const hash = hashCustomerOrderToken("token-seguro-123");
  assert.equal(matchesCustomerOrderToken("token-seguro-123", hash), true);
  assert.equal(matchesCustomerOrderToken("outro-token", hash), false);
});

test("rota publica nao expoe o shell operacional do SamBah", async () => {
  const { server, base } = await startServer({ authMode: "session" });
  try {
    const response = await fetch(`${base}/cardapio/xeriffe`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Monte sua comanda/);
    assert.doesNotMatch(html, /SamBah CRM|SamBah Pay|Perola|Mesa do Xeriffe/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await close(server);
  }
});

test("telas operacionais exigem sessao e cardapio publico permanece acessivel", async () => {
  const { server, base } = await startServer({ authMode: "session" });
  try {
    for (const path of ["/garcom", "/cozinha", "/admin/qrcodes", "/mesa/xeriffe/10", "/cardapio/insano"]) {
      const response = await fetch(`${base}${path}`, { redirect: "manual" });
      assert.equal(response.status, 302);
      assert.match(response.headers.get("location"), /^\/login\?next=/);
    }
    assert.equal((await fetch(`${base}/cardapio/xeriffe`)).status, 200);
  } finally {
    await close(server);
  }
});

test("confirmacao publica cria somente pagamento pending e nao envia pedido ao Mesa", async () => {
  const repository = new InMemoryWhatsAppV2ConversationRepository();
  const phone = "5551999999900";
  const token = "token-publico-seguro-com-mais-de-24";
  await repository.save({
    ...createWhatsAppV2State(phone),
    sambahConversationId: "central-123",
    serviceState: "AGUARDANDO_COMANDA_MESA",
    customerOrderTokenHash: hashCustomerOrderToken(token)
  });
  const payments = [];
  const mesaCalls = [];
  const { server, base } = await startServer({
    repository,
    menuPayload: rawMenu,
    paymentService: {
      async createPayment(input) {
        payments.push(input);
        return { ok: true, payment: { id: "pay-pending-1", status: "pending" } };
      }
    },
    mesaCalls
  });
  try {
    const response = await fetch(`${base}/api/mesa/comanda-cliente`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: `wa_${phone}`,
        sambahConversationId: "central-123",
        phone,
        origin: "WHATSAPP_SAMBAH",
        unit: "XERIFFE_OBIRICI",
        token,
        items: [{ productId: "burger-1", quantity: 1, addonIds: ["bacon"] }]
      })
    });
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.deepEqual(result.payment, { id: "pay-pending-1", status: "pending", confirmed: false, productionReleased: false });
    assert.equal(payments[0].status, "pending");
    assert.equal(payments[0].confirmed, false);
    assert.equal(payments[0].metadata.productionReleaseAllowed, false);
    assert.deepEqual(mesaCalls, []);
    const state = await repository.get(phone);
    assert.equal(state.serviceState, "COMANDA_MESA_CONFIRMADA");
    assert.equal(state.sambahPayPaymentId, "pay-pending-1");
    assert.equal(state.customerOrderTokenHash, null);
  } finally {
    await close(server);
  }
});

async function startServer({ authMode = "session", repository = new InMemoryWhatsAppV2ConversationRepository(), menuPayload = rawMenu, paymentService = null, mesaCalls = [] } = {}) {
  const menuService = { async getMenuCache() { return structuredClone(menuPayload); } };
  const pendingPaymentService = paymentService || { async createPayment() { return { ok: true, payment: { id: "unused", status: "pending" } }; } };
  const sambahPayModule = { services: { coreService: pendingPaymentService }, async handle() { return false; } };
  const mesaService = {
    async checkMesaHealth() { return { ok: true }; },
    async queueSnapshot() { return { items: [] }; },
    async sendOrder(...args) { mesaCalls.push(args); throw new Error("mesa_must_not_be_called"); }
  };
  const server = createApp({ authMode, whatsappV2ConversationRepository: repository, menuService, sambahPayModule, mesaService });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}
