import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../src/auditService.js";
import { CrmService } from "../src/crmService.js";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import {
  buildOrderDraft,
  classifyIntent,
  normalizeText,
  OrderDraftService,
  validateDraftAgainstMenu
} from "../src/orderDraftService.js";
import { createApp } from "../src/server.js";

function tempCrm(dir) {
  return new CrmService({
    files: {
      clientes: join(dir, "clientes.json"),
      leads: join(dir, "leads.json"),
      atendimentos: join(dir, "atendimentos.json"),
      eventos: join(dir, "eventos.json"),
      precomandas: join(dir, "precomandas.json")
    }
  });
}

const menu = {
  ok: true,
  items: [
    {
      productId: "kachurrasco",
      name: "Kachurrasco",
      available: true,
      availability: { available: true },
      addons: [{ id: "bacon-extra", name: "Bacon extra", available: true }]
    },
    {
      productId: "espetinho-de-carne-fraldinha",
      name: "Espetinho de Carne fraldinha",
      available: true,
      availability: { available: true },
      addons: []
    },
    {
      productId: "coca-cola-lata-350",
      name: "Coca Cola lata 350 ml",
      available: true,
      availability: { available: true },
      addons: []
    }
  ]
};

const rules = {
  version: 1,
  globalSynonyms: {
    baicho: "baixo",
    espetim: "espetinho",
    kachurasco: "kachurrasco",
    "me ve": "me vê"
  },
  products: {
    kachurrasco: { aliases: ["kachurrasco", "ka churrasco"], keywords: ["baguete"] },
    "espetinho-de-carne-fraldinha": { aliases: ["espetinho de carne", "espetim de carne", "fraldinha"], keywords: ["espeto"] },
    "coca-cola-lata-350": { aliases: ["coca", "coca cola"], keywords: ["refrigerante"] }
  },
  addons: {
    "sem-cebola": { aliases: ["sem cebola", "tira cebola"], type: "note" },
    "extra-queijo": { aliases: ["queijo extra", "mais queijo"], type: "addon" },
    "bacon-extra": { aliases: ["bacon extra", "mais bacon"], type: "addon" }
  }
};

test("classifica intencoes principais", () => {
  assert.equal(classifyIntent("me ve dois kachurrasco"), "immediate_order");
  assert.equal(classifyIntent("quero food truck para aniversario"), "event_lead");
  assert.equal(classifyIntent("reserva no Xeriffe sexta"), "reservation");
  assert.equal(classifyIntent("quero falar com Neno"), "human_request");
});

test("normaliza sinonimos e identifica productId por alias", () => {
  assert.equal(normalizeText("espetim baicho", rules), "espetinho baixo");
  const draft = buildOrderDraft("qro 1 espetim de carne", menu, rules);
  assert.equal(draft.items[0].productId, "espetinho-de-carne-fraldinha");
});

test("monta rascunho com quantidade e transforma sem cebola em note", () => {
  const draft = buildOrderDraft("me ve dois kachurrasco sem cebola", menu, rules);
  assert.equal(draft.status, "draft");
  assert.equal(draft.intent, "immediate_order");
  assert.ok(draft.confidence >= 0.8);
  assert.equal(draft.items[0].productId, "kachurrasco");
  assert.equal(draft.items[0].qty, 2);
  assert.equal(draft.items[0].note, "sem cebola");
});

test("monta rascunho avancado com multiplos itens e observacao por item", () => {
  const draft = buildOrderDraft("me ve dois kachurrasco sem cebola e um espetinho de carne", menu, rules);
  assert.equal(draft.status, "draft");
  assert.ok(draft.confidence >= 0.8);
  assert.equal(draft.items.length, 2);
  assert.equal(draft.items[0].productId, "kachurrasco");
  assert.equal(draft.items[0].qty, 2);
  assert.equal(draft.items[0].note, "sem cebola");
  assert.equal(draft.items[1].productId, "espetinho-de-carne-fraldinha");
  assert.equal(draft.items[1].qty, 1);
  assert.equal(draft.items[1].note, "");
});

test("testa frases principais do atendimento", () => {
  const espetinhoECoca = buildOrderDraft("quero um espetinho de carne e uma coca", menu, rules);
  assert.equal(espetinhoECoca.status, "draft");
  assert.deepEqual(espetinhoECoca.items.map((item) => item.productId), ["espetinho-de-carne-fraldinha", "coca-cola-lata-350"]);

  const cachorro = buildOrderDraft("tem cachorro?", menu, rules);
  assert.equal(cachorro.intent, "menu_request");

  const foodTruck = buildOrderDraft("quero food truck para aniversario", menu, rules);
  assert.equal(foodTruck.intent, "event_lead");

  const alias = buildOrderDraft("me ve um espetim de carne", menu, rules);
  assert.equal(alias.status, "draft");
  assert.equal(alias.items[0].productId, "espetinho-de-carne-fraldinha");
});

test("bloqueia produto inexistente e addon pago invalido", () => {
  const unknown = buildOrderDraft("quero xis alien", menu, rules);
  assert.equal(unknown.status, "needs_review");
  assert.equal(unknown.questions[0].reason, "productId_invalido");

  const invalidAddon = buildOrderDraft("quero kachurrasco queijo extra", menu, rules);
  assert.equal(invalidAddon.status, "needs_review");
  assert.equal(invalidAddon.questions[0].reason, "addon_invalido");
});

test("valida draft contra cardapio antes de confirmar", () => {
  const valid = buildOrderDraft("me ve um kachurrasco", menu, rules);
  assert.equal(validateDraftAgainstMenu(valid, menu).ok, true);
  const invalid = { ...valid, items: [{ productId: "nao-existe", qty: 1, addons: [] }] };
  const validation = validateDraftAgainstMenu(invalid, menu);
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, "productId_invalido");
});

test("confirma e cancela rascunhos persistidos", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-drafts-"));
  try {
    const service = new OrderDraftService({
      draftsFile: join(dir, "order-drafts.json"),
      rulesFile: join(dir, "rules.json")
    });
    await service.writeDrafts([]);
    await import("node:fs/promises").then(({ writeFile }) => writeFile(join(dir, "rules.json"), JSON.stringify(rules), "utf8"));
    const draft = await service.createDraft({ text: "me ve um kachurrasco", customer: { name: "Cliente", phone: "51999990000" }, menu });
    const confirmed = await service.confirmDraft(draft.id, menu);
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.order.order.items[0].productId, "kachurrasco");
    const second = await service.createDraft({ text: "me ve um kachurrasco", menu });
    const canceled = await service.cancelDraft(second.id);
    assert.equal(canceled.ok, true);
    assert.equal(canceled.draft.status, "canceled");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("endpoints de rascunho parseiam, confirmam e cancelam", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-draft-http-"));
  const audit = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({
    queueFile: join(dir, "queue.json"),
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 202, headers: { "content-type": "application/json" } })
  });
  try {
    await menuService.saveMenuCache(menu);
    await import("node:fs/promises").then(({ writeFile }) => writeFile(join(dir, "rules.json"), JSON.stringify(rules), "utf8"));
    const server = createApp({ auditService: audit, menuService, draftService, mesaService, crmService: tempCrm(dir) });
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    try {
      const parseResponse = await fetch(`http://127.0.0.1:${port}/admin/orders/drafts/test-parse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "me ve dois kachurrasco sem cebola", customer: { name: "Teste", phone: "51999999999" } })
      });
      assert.equal(parseResponse.status, 200);
      const parsed = await parseResponse.json();
      assert.equal(parsed.draft.status, "draft");
      assert.equal(parsed.draft.items[0].qty, 2);

      const listResponse = await fetch(`http://127.0.0.1:${port}/admin/orders/drafts`);
      assert.equal(listResponse.status, 200);
      assert.equal((await listResponse.json()).total, 1);

      const confirmResponse = await fetch(`http://127.0.0.1:${port}/admin/orders/drafts/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: parsed.draft.id })
      });
      assert.equal(confirmResponse.status, 202);
      assert.equal((await confirmResponse.json()).mesa.status, "accepted");

      const secondResponse = await fetch(`http://127.0.0.1:${port}/admin/orders/drafts/test-parse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "quero kachurrasco" })
      });
      const second = await secondResponse.json();
      const cancelResponse = await fetch(`http://127.0.0.1:${port}/admin/orders/drafts/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: second.draft.id })
      });
      assert.equal(cancelResponse.status, 200);
      assert.equal((await cancelResponse.json()).draft.status, "canceled");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
