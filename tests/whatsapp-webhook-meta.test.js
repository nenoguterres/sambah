import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../src/auditService.js";
import { CrmService } from "../src/crmService.js";
import { EventScheduleService } from "../src/eventScheduleService.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { OrderDraftService } from "../src/orderDraftService.js";
import { SambahConversationService } from "../src/sambahConversationService.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";
import { createApp } from "../src/server.js";
import { MockWhatsAppProvider } from "../src/whatsapp/providers/mockProvider.js";
import { WhatsAppMessageService } from "../src/whatsapp/whatsappMessageService.js";

test("GET /webhook/whatsapp valida challenge da Meta", async () => {
  const previous = process.env.WHATSAPP_META_VERIFY_TOKEN;
  process.env.WHATSAPP_META_VERIFY_TOKEN = "token-certo";
  const { server, base, cleanup } = await createTestServer();
  try {
    const ok = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token-certo&hub.challenge=abc123`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "abc123");

    const denied = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123`);
    assert.equal(denied.status, 403);
  } finally {
    await close(server);
    await cleanup();
    if (previous === undefined) delete process.env.WHATSAPP_META_VERIFY_TOKEN;
    else process.env.WHATSAPP_META_VERIFY_TOKEN = previous;
  }
});

test("POST /webhook/whatsapp preserva mock e normaliza payload Meta", async () => {
  const { server, base, cleanup } = await createTestServer();
  try {
    const mockResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: "mock-1", from: "51999999999", message: "quero falar com Kazuko" })
    });
    const mockBody = await mockResponse.json();
    assert.equal(mockResponse.status, 202);
    assert.equal(mockBody.ok, true);
    assert.equal(mockBody.intent, "human_request");
    assert.match(mockBody.responseText, /5551997920292/);

    const metaResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-meta-normaliza",
        type: "text",
        text: { body: "quero o cardapio" }
      }))
    });
    const metaBody = await metaResponse.json();
    assert.equal(metaResponse.status, 200);
    assert.equal(metaBody.ok, true);
    assert.equal(metaBody.normalized.provider, "meta");
    assert.equal(metaBody.normalized.from, "5551999999999");
    assert.equal(metaBody.autoIntent, "menu_request");

    const interactiveResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-meta-interactive",
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "cardapio", title: "Quero cardapio" }
        }
      }))
    });
    const interactiveBody = await interactiveResponse.json();
    assert.equal(interactiveResponse.status, 200);
    assert.equal(interactiveBody.ok, true);
    assert.equal(interactiveBody.normalized.message, "Quero cardapio");
    assert.equal(interactiveBody.conversa.ultimaMensagem, "Quero cardapio");
    assert.equal(interactiveBody.autoIntent, "menu_request");
  } finally {
    await close(server);
    await cleanup();
  }
});

test("POST /webhook/site continua respondendo 202", async () => {
  const { server, base, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/webhook/site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "site-preservado-1",
        source: "site",
        name: "Cliente Site",
        phone: "51999990000",
        message: "quero falar com pessoa"
      })
    });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.ok, true);
  } finally {
    await close(server);
    await cleanup();
  }
});

async function createTestServer({ provider = new MockWhatsAppProvider({ logger: { info: () => {} } }) } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambha-wa-meta-"));
  await writeFile(join(dir, "menu.json"), JSON.stringify({ items: menuItems(), updatedAt: "2026-06-15T00:00:00.000Z" }), "utf8");
  await writeFile(join(dir, "rules.json"), JSON.stringify(menuRules()), "utf8");
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json"), fetchImpl: async () => new Response("{}", { status: 202 }) });
  const eventService = new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "services.json") });
  const whatsappConversationService = new WhatsAppConversationService({ filePath: join(dir, "conversas.json") });
  const whatsappMessageService = new WhatsAppMessageService({
    provider,
    sessionsFile: join(dir, "sessions.json"),
    messagesFile: join(dir, "messages.json")
  });
  const crmService = new CrmService({
    files: {
      clientes: join(dir, "clientes.json"),
      leads: join(dir, "leads.json"),
      atendimentos: join(dir, "atendimentos.json"),
      eventos: join(dir, "eventos.json"),
      precomandas: join(dir, "precomandas.json")
    }
  });
  const server = createApp({
    auditService,
    menuService,
    draftService,
    mesaService,
    eventService,
    crmService,
    conversationService: new SambahConversationService({ scriptsFile: join(dir, "scripts.json") }),
    whatsappConversationService,
    whatsappMessageService
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    auditFile: join(dir, "audit.json"),
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

function metaPayload(message) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: "Cliente Meta" }, wa_id: message.from }],
          messages: [message]
        }
      }]
    }]
  };
}

function menuItems() {
  return [{ productId: "kachurrasco", name: "Kachurrasco", price: 24, available: true, addons: [] }];
}

function menuRules() {
  return { version: 1, globalSynonyms: {}, products: { kachurrasco: { aliases: ["kachurrasco"], keywords: [] } }, addons: {} };
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
