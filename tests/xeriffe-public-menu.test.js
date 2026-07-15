import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import { XeriffePublicMenuService } from "../src/xeriffePublicMenuService.js";

const menuPayload = {
  updatedAt: "2026-07-15T00:00:00.000Z",
  items: [
    {
      id: "burger-costela",
      productId: "BUR-COS-001",
      name: "Burger Costela",
      category: "Burgers",
      description: "Burger de costela e queijo",
      price: 29.9,
      imageUrl: "https://example.test/costela.jpg",
      available: true,
      addons: [
        { id: "A01", name: "Cebola caramelizada", price: 3, available: true },
        { id: "A02", name: "Ketchup de goiaba", price: 2.5, available: true }
      ]
    },
    {
      id: "batata",
      productId: "POR-BAT-001",
      name: "Batata Frita",
      category: "Porcoes",
      description: "Porcao de batatas",
      price: 18,
      imageUrl: "",
      available: true,
      addons: []
    },
    {
      id: "produto-sem-preco",
      productId: "SEM-PRECO-001",
      name: "Produto ainda nao configurado no Mesa",
      category: "Outros",
      description: "Nao deve ser publicado",
      price: 0,
      available: true,
      addons: []
    }
  ]
};

function fixtures(dir, accepted = false) {
  const menuService = { getMenuCache: async () => structuredClone(menuPayload) };
  const entries = [];
  const mesaService = {
    enqueueOrder: async (order) => {
      const entry = { id: `queue-${entries.length + 1}`, order, status: "pending" };
      entries.push(entry);
      return entry;
    },
    sendOrderToMesa: async (entry) => accepted
      ? { ok: true, entry: { ...entry, status: "accepted" }, httpStatus: 200 }
      : { ok: false, entry: { ...entry, status: "pending" }, error: "mesa_offline" }
  };
  const service = new XeriffePublicMenuService({
    menuService,
    mesaService,
    sessionsFile: join(dir, "sessions.json"),
    whatsappNumber: "5551980413745"
  });
  return { service, entries };
}

test("backend recalcula produto e adicionais, ignora preco do navegador e isola sessoes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xeriffe-public-"));
  try {
    const { service } = fixtures(dir);
    const first = await service.ensureSession();
    const second = await service.ensureSession();
    await service.addItem(first.id, {
      productId: "BUR-COS-001",
      quantity: 2,
      addonIds: ["A01"],
      price: 0.01,
      total: 0.01
    });
    const firstCart = await service.cart(first.id);
    const secondCart = await service.cart(second.id);
    assert.equal(firstCart.itemCount, 2);
    assert.equal(firstCart.total, 65.8);
    assert.equal(firstCart.items[0].basePrice, 29.9);
    assert.equal(firstCart.items[0].compositeCode, "BUR-COS-001-A01");
    assert.equal(secondCart.itemCount, 0);
    await assert.rejects(
      service.addItem(first.id, { productId: "BUR-COS-001", addonIds: ["NAO-EXISTE"] }),
      (error) => error.code === "invalid_addon" && error.statusCode === 400
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("finalizacao registra pendente sem fingir envio quando Mesa esta indisponivel", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xeriffe-public-"));
  try {
    const { service, entries } = fixtures(dir, false);
    const session = await service.ensureSession();
    await service.addItem(session.id, { productId: "POR-BAT-001", quantity: 1 });
    const result = await service.finalize(session.id, { name: "Cliente", phone: "5551999999999" });
    assert.equal(result.status, "pending");
    assert.equal(result.requiresHuman, true);
    assert.match(result.message, /aguardando atendimento humano/i);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].order.order.total, 18);
    assert.equal(entries[0].order.order.items[0].productId, "POR-BAT-001");
    const duplicate = await service.finalize(session.id, {});
    assert.equal(duplicate.duplicate, true);
    assert.equal(entries.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rota publica abre sem login e API usa cookie HttpOnly separado do shell administrativo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xeriffe-public-"));
  const { service } = fixtures(dir);
  const server = createApp({ xeriffePublicMenuService: service, authMode: "session" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const pageResponse = await fetch(`${base}/xeriffe/cardapio`);
    const page = await pageResponse.text();
    assert.equal(pageResponse.status, 200);
    assert.match(page, /Xeriffe Obirici/);
    assert.doesNotMatch(page, /sambah-shell|Central de Conversas|Meta Dashboard|auditoria/i);

    const catalog = await fetch(`${base}/api/xeriffe/cardapio/catalogo`).then((response) => response.json());
    assert.equal(catalog.source, "mesa");
    assert.equal(catalog.items.length, 2);
    assert.equal(catalog.items[0].price, 29.9);
    assert.equal(catalog.items.some((item) => item.id === "SEM-PRECO-001"), false);

    const firstCartResponse = await fetch(`${base}/api/xeriffe/cardapio/comanda`);
    const cookie = firstCartResponse.headers.get("set-cookie");
    assert.match(cookie, /xeriffe_cart=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);

    const addedResponse = await fetch(`${base}/api/xeriffe/cardapio/comanda/itens`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-xeriffe-cart": "1" },
      body: JSON.stringify({ productId: "BUR-COS-001", quantity: 1, addonIds: ["A02"], price: 1 })
    });
    const added = await addedResponse.json();
    assert.equal(addedResponse.status, 201);
    assert.equal(added.total, 32.4);

    const isolated = await fetch(`${base}/api/xeriffe/cardapio/comanda`).then((response) => response.json());
    assert.equal(isolated.itemCount, 0);

    const blocked = await fetch(`${base}/api/xeriffe/cardapio/comanda/itens`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ productId: "POR-BAT-001" })
    });
    assert.equal(blocked.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("Mesa publica 17 produtos autenticados no cache exclusivo do Xeriffe", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xeriffe-mesa-publish-"));
  const menuService = new MenuSyncService({
    cacheFile: join(dir, "menu-cache.json"),
    config: { apiToken: "token-mesa-teste", baseUrl: "http://127.0.0.1", menuPath: "/api/menu" }
  });
  const mesaService = {
    enqueueOrder: async (order) => ({ id: "queue-1", order }),
    sendOrderToMesa: async (entry) => ({ ok: false, entry })
  };
  const publicMenu = new XeriffePublicMenuService({
    menuService,
    mesaService,
    sessionsFile: join(dir, "sessions.json")
  });
  const server = createApp({
    menuService,
    xeriffePublicMenuService: publicMenu,
    auditService: { record: async () => ({ event: null, duplicated: false }) },
    authMode: "mock"
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const items = Array.from({ length: 17 }, (_, index) => ({
    productId: `XER-${String(index + 1).padStart(3, "0")}`,
    name: index === 0 ? "Burger Costela" : `Produto Xeriffe ${index + 1}`,
    category: index < 4 ? "Burguers" : "Cardapio",
    price: 20 + index,
    description: `Produto oficial ${index + 1}`,
    available: true,
    addons: index === 0 ? [{ id: "A01", name: "Cebola caramelizada", price: 3 }] : []
  }));
  try {
    const unauthorized = await fetch(`${base}/api/mesa/cardapio`, { method: "POST" });
    assert.equal(unauthorized.status, 401);

    const invalidToken = await fetch(`${base}/api/mesa/cardapio`, {
      method: "POST",
      headers: { authorization: "Bearer token-errado", "content-type": "application/json" },
      body: JSON.stringify({ items })
    });
    assert.equal(invalidToken.status, 403);

    const publishedResponse = await fetch(`${base}/api/mesa/cardapio`, {
      method: "POST",
      headers: { authorization: "Bearer token-mesa-teste", "content-type": "application/json" },
      body: JSON.stringify({ source: "mesa-do-xeriffe", items })
    });
    const published = await publishedResponse.json();
    assert.equal(publishedResponse.status, 200);
    assert.equal(published.totalItems, 17);

    const catalog = await fetch(`${base}/api/xeriffe/cardapio/catalogo`).then((response) => response.json());
    assert.equal(catalog.source, "mesa");
    assert.equal(catalog.items.length, 17);
    assert.equal(catalog.items[0].name, "Burger Costela");
    assert.equal(catalog.items[0].price, 20);
    assert.equal(catalog.items[0].addons[0].id, "A01");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
