import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../src/auditService.js";
import { EventScheduleService } from "../src/eventScheduleService.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { OrderDraftService } from "../src/orderDraftService.js";
import { SambahConversationService } from "../src/sambahConversationService.js";
import { MockWhatsAppProvider } from "../src/whatsapp/providers/mockProvider.js";
import { WhatsAppMessageService } from "../src/whatsapp/whatsappMessageService.js";

test("pedido por WhatsApp cria draft e CONFIRMAR envia para Mesa", async () => {
  const ctx = await createContext();
  try {
    const first = await ctx.service.handleIncoming({
      eventId: "wa-order-1",
      from: "51999999999",
      message: "me ve dois kachurrasco"
    }, ctx.services);
    assert.equal(first.intent, "immediate_order");
    assert.equal(first.draft.status, "draft");
    assert.match(first.responseText, /Responde CONFIRMAR/);

    const queueBefore = JSON.parse(await readFile(join(ctx.dir, "queue.json"), "utf8").catch(() => "[]"));
    assert.equal(queueBefore.length, 0);

    const sessions = await ctx.service.sessions();
    assert.equal(sessions.total, 1);
    assert.equal(sessions.items[0].status, "awaiting_confirmation");

    const confirmed = await ctx.service.handleIncoming({
      eventId: "wa-order-2",
      from: "51999999999",
      message: "CONFIRMAR"
    }, ctx.services);
    assert.equal(confirmed.intent, "immediate_order");
    assert.equal(confirmed.mesa.status, "accepted");
    assert.match(confirmed.responseText, /Pedido encaminhado/);

    const queueAfter = JSON.parse(await readFile(join(ctx.dir, "queue.json"), "utf8"));
    assert.equal(queueAfter.length, 1);
    assert.equal(queueAfter[0].status, "accepted");
  } finally {
    await ctx.cleanup();
  }
});

test("ALTERAR mantem pedido fora do Mesa", async () => {
  const ctx = await createContext();
  try {
    await ctx.service.handleIncoming({ eventId: "wa-alt-1", from: "51988888888", message: "me ve um kachurrasco" }, ctx.services);
    const result = await ctx.service.handleIncoming({ eventId: "wa-alt-2", from: "51988888888", message: "ALTERAR" }, ctx.services);
    assert.equal(result.route, "draft_change");
    assert.match(result.responseText, /Me manda como fica/);
    const queue = JSON.parse(await readFile(join(ctx.dir, "queue.json"), "utf8").catch(() => "[]"));
    assert.equal(queue.length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test("respostas automaticas cobrem Kazuko, Neno e Agenda Insano", async () => {
  const ctx = await createContext();
  try {
    const kazuko = await ctx.service.handleIncoming({ eventId: "wa-kazuko", from: "51977777777", message: "quero falar com Kazuko" }, ctx.services);
    assert.equal(kazuko.intent, "human_request");
    assert.match(kazuko.responseText, /5551997920292/);

    const neno = await ctx.service.handleIncoming({ eventId: "wa-neno", from: "51966666666", message: "quero falar com humano" }, ctx.services);
    assert.equal(neno.intent, "human_request");
    assert.match(neno.responseText, /5551980413745/);

    const event = await ctx.service.handleIncoming({ eventId: "wa-event", from: "51955555555", message: "quero food truck para aniversario" }, ctx.services);
    assert.equal(event.intent, "event_lead");
    assert.equal(event.route, "agenda_insano");
    assert.match(event.responseText, /Agenda Insano/);
  } finally {
    await ctx.cleanup();
  }
});

async function createContext() {
  const dir = await mkdtemp(join(tmpdir(), "sambha-wa-session-"));
  await writeFile(join(dir, "menu.json"), JSON.stringify({ items: menuItems(), updatedAt: "2026-06-15T00:00:00.000Z" }), "utf8");
  await writeFile(join(dir, "rules.json"), JSON.stringify(menuRules()), "utf8");
  const service = new WhatsAppMessageService({
    provider: new MockWhatsAppProvider({ logger: { info: () => {} } }),
    sessionsFile: join(dir, "sessions.json"),
    messagesFile: join(dir, "messages.json")
  });
  const services = {
    conversationService: new SambahConversationService({ scriptsFile: join(dir, "scripts.json") }),
    menuService: new MenuSyncService({ cacheFile: join(dir, "menu.json") }),
    draftService: new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") }),
    mesaService: new MesaIntegrationService({
      queueFile: join(dir, "queue.json"),
      fetchImpl: async () => new Response(JSON.stringify({ id: "mesa-ok", status: "accepted" }), { status: 202 })
    }),
    eventService: new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "services.json") }),
    auditService: new AuditService({ filePath: join(dir, "audit.json") })
  };
  return { dir, service, services, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

function menuItems() {
  return [{ productId: "kachurrasco", name: "Kachurrasco", price: 24, available: true, addons: [] }];
}

function menuRules() {
  return { version: 1, globalSynonyms: {}, products: { kachurrasco: { aliases: ["kachurrasco"], keywords: [] } }, addons: {} };
}
