import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MenuSyncService } from "../src/menuSyncService.js";
import { WhatsAppCatalogService } from "../src/whatsappCatalogService.js";
import { AuditService } from "../src/auditService.js";
import { createApp } from "../src/server.js";

test("Cardapio WhatsApp usa cache oficial do Mesa como fonte da verdade", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-whatsapp-catalog-mesa-"));
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const catalog = new WhatsAppCatalogService({
    filePath: join(dir, "whatsapp-catalog.json"),
    menuService,
    now: () => new Date("2026-07-07T12:00:00.000Z")
  });
  try {
    await menuService.saveMenuCache({
      source: "mesa-do-xeriffe",
      lastSyncAt: "2026-07-07T11:58:00.000Z",
      items: [
        { productId: "mesa-xis", name: "Xis Mesa Oficial", category: "Lanches", price: 28, available: true },
        { productId: "mesa-esgotado", name: "Produto Esgotado", category: "Lanches", price: 20, available: false }
      ]
    });

    const listed = await catalog.list();
    const whatsappText = await catalog.formatForWhatsApp();

    assert.equal(listed.ok, true);
    assert.equal(listed.source, "mesa_menu_cache");
    assert.equal(listed.synced, true);
    assert.equal(listed.products.length, 2);
    assert.equal(listed.products[0].id, "mesa-xis");
    assert.equal(listed.products[0].mesaProductId, "mesa-xis");
    assert.match(whatsappText, /Xis Mesa Oficial/);
    assert.doesNotMatch(whatsappText, /Produto Esgotado/);
    assert.doesNotMatch(whatsappText, /Hamburguer/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Cardapio WhatsApp nao envia fallback como oficial sem Mesa sincronizado", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-whatsapp-catalog-fallback-"));
  const catalog = new WhatsAppCatalogService({
    filePath: join(dir, "whatsapp-catalog.json"),
    now: () => new Date("2026-07-07T12:00:00.000Z")
  });
  try {
    const listed = await catalog.list();
    const whatsappText = await catalog.formatForWhatsApp();

    assert.equal(listed.ok, true);
    assert.equal(listed.source, "sambah_fallback");
    assert.equal(listed.synced, false);
    assert.match(whatsappText, /Mesa ainda nao foi sincronizado/);
    assert.doesNotMatch(whatsappText, /Cardapio SamBah de hoje/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Endpoint sincroniza cardapio WhatsApp a partir do Mesa sem rota solta", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-whatsapp-catalog-route-"));
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = {
    syncMenu: async () => ({
      ok: true,
      source: "mesa-do-xeriffe",
      lastSyncAt: "2026-07-07T12:10:00.000Z",
      items: [
        { productId: "mesa-coca", name: "Coca Mesa", category: "Bebidas", price: 8, available: true }
      ]
    }),
    cacheSnapshot: async () => ({
      ok: true,
      source: "mesa-do-xeriffe",
      lastSyncAt: "2026-07-07T12:10:00.000Z",
      items: [
        { productId: "mesa-coca", name: "Coca Mesa", category: "Bebidas", price: 8, available: true }
      ]
    })
  };
  const whatsappCatalogService = new WhatsAppCatalogService({
    filePath: join(dir, "whatsapp-catalog.json"),
    menuService,
    now: () => new Date("2026-07-07T12:11:00.000Z")
  });
  const server = createApp({ auditService, menuService, whatsappCatalogService });
  try {
    await new Promise((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const syncResponse = await fetch(`${base}/api/sambah/cardapio/sync-mesa`, { method: "POST" });
    const sync = await syncResponse.json();
    const catalogResponse = await fetch(`${base}/api/sambah/cardapio`);
    const catalog = await catalogResponse.json();

    assert.equal(syncResponse.status, 200);
    assert.equal(sync.ok, true);
    assert.equal(sync.source, "mesa_menu_cache");
    assert.equal(sync.products[0].id, "mesa-coca");
    assert.equal(catalog.ok, true);
    assert.equal(catalog.source, "mesa_menu_cache");
    assert.equal(catalog.synced, true);
    assert.equal(catalog.products[0].name, "Coca Mesa");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
