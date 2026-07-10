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
import { createApp } from "../src/server.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";
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
    restoreEnv("WHATSAPP_META_VERIFY_TOKEN", previous);
  }
});

test("POST /webhook/whatsapp registra entrada Meta sem auto-resposta ou provider", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const providerCalls = [];
  const { server, base, messagesFile, conversationsFile, auditFile, cleanup } = await createTestServer({
    provider: {
      name: "meta-test-provider",
      status: () => ({ provider: "meta-test-provider", configured: true }),
      sendText: async (input) => {
        providerCalls.push(input);
        return { ok: true, sent: true, status: "sent_by_provider" };
      }
    },
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response("{}", { status: 200 });
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-disabled-text",
        type: "text",
        text: { body: "quero o cardapio" }
      }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.engine, "disabled");
    assert.equal(body.reason, "whatsapp_v2_disabled");
    assert.equal(body.automaticReplyCreated, false);
    assert.equal(body.sent, false);
    assert.equal(body.handled, false);
    assert.equal(body.conversa.whatsappEngine, "disabled");
    assert.equal(body.conversa.respostaSugerida, "");
    assert.equal(body.conversa.automaticReplyCreated, false);
    assert.equal(body.normalized.message, "quero o cardapio");
    assert.equal(graphCalls.length, 0);
    assert.equal(providerCalls.length, 0);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].direction, "in");
    assert.equal(messages[0].text, "quero o cardapio");
    assert.equal(messages[0].status, "received");

    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 1);
    assert.equal(conversations.conversas[0].mensagens.length, 1);
    assert.equal(conversations.conversas[0].mensagens[0].direction, "in");
    assert.equal(conversations.conversas[0].whatsappEngine, "disabled");

    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.ok(audit.some((event) => event.type === "whatsapp_v2_disabled"));
    assert.equal(audit.some((event) => event.type === "intent_detected"), false);
    assert.equal(audit.some((event) => event.type === "operation_router"), false);
    assert.equal(audit.some((event) => event.type === "whatsapp_cloud_auto_reply"), false);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSendEnabled);
    restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previousPhoneNumberId);
  }
});

test("POST /webhook/whatsapp preserva callback de status Meta sem envio", async () => {
  const graphCalls = [];
  const { server, base, messagesFile, conversationsFile, auditFile, cleanup } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response("{}", { status: 200 });
    }
  });
  try {
    await writeFile(messagesFile, JSON.stringify([{
      id: "out_1",
      direction: "out",
      provider: "meta",
      phone: "5551999999999",
      providerMessageId: "wamid-status-only",
      text: "Resposta manual",
      status: "sent",
      response: { messages: [{ id: "wamid-status-only" }] },
      createdAt: "2026-07-03T10:00:00.000Z"
    }]), "utf8");
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_5551999999999",
        nome: "Cliente Meta",
        telefone: "5551999999999",
        mensagens: [{
          id: "msg_out_1",
          direction: "out",
          type: "text",
          text: "Resposta manual",
          status: "sent",
          providerMessageId: "wamid-status-only",
          response: { messages: [{ id: "wamid-status-only" }] },
          createdAt: "2026-07-03T10:00:00.000Z"
        }],
        createdAt: "2026-07-03T10:00:00.000Z",
        updatedAt: "2026-07-03T10:00:00.000Z"
      }]
    }), "utf8");

    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(statusPayload())
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.reason, "meta_status_callback");
    assert.equal(body.statuses, 1);
    assert.equal(body.updated, 1);
    assert.equal(graphCalls.length, 0);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages[0].status, "delivered");
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas[0].mensagens[0].status, "delivered");
    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.ok(audit.some((event) => event.type === "whatsapp_meta_status_callback"));
  } finally {
    await close(server);
    await cleanup();
  }
});

test("POST /webhook/whatsapp ignora duplicata por messageId sem auto-resposta", async () => {
  const graphCalls = [];
  const providerCalls = [];
  const { server, base, messagesFile, conversationsFile, cleanup } = await createTestServer({
    provider: {
      name: "meta-test-provider",
      status: () => ({ provider: "meta-test-provider", configured: true }),
      sendText: async (input) => {
        providerCalls.push(input);
        return { ok: true, sent: true, status: "sent_by_provider" };
      }
    },
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response("{}", { status: 200 });
    }
  });
  try {
    const payload = metaPayload({
      from: "5551888888888",
      id: "wamid-duplicate-neutral",
      type: "text",
      text: { body: "oi" }
    });

    const first = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const second = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const firstBody = await first.json();
    const secondBody = await second.json();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(firstBody.automaticReplyCreated, false);
    assert.equal(secondBody.automaticReplyCreated, false);
    assert.equal(secondBody.handled, false);
    assert.equal(secondBody.engine, "disabled");
    assert.equal(secondBody.conversa.mensagens.length, 1);
    assert.equal(secondBody.message.id, "wamid-duplicate-neutral");
    assert.equal(graphCalls.length, 0);
    assert.equal(providerCalls.length, 0);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "wamid-duplicate-neutral");

    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 1);
    assert.equal(conversations.conversas[0].mensagens.length, 1);
    assert.equal(conversations.conversas[0].mensagens[0].id, "wamid-duplicate-neutral");
    assert.equal(conversations.conversas[0].automaticReplyCreated, false);
    assert.equal(conversations.conversas[0].whatsappEngine, "disabled");

    const inbox = await fetch(`${base}/api/conversas`);
    const inboxBody = await inbox.json();
    assert.equal(inbox.status, 200);
    assert.equal(inboxBody.count, 1);
    assert.equal(inboxBody.items[0].mensagens.length, 1);
    assert.equal(inboxBody.items[0].mensagens[0].id, "wamid-duplicate-neutral");
  } finally {
    await close(server);
    await cleanup();
  }
});

test("POST /webhook/whatsapp integra V2 em observe_only sem sender, IA ou auto-reply", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  const previousSend = process.env.WHATSAPP_SEND_ENABLED;
  const previousAi = process.env.WHATSAPP_AI_ENABLED;
  const previousAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  process.env.WHATSAPP_V2_ENABLED = "true";
  process.env.WHATSAPP_SEND_ENABLED = "false";
  process.env.WHATSAPP_AI_ENABLED = "false";
  process.env.WHATSAPP_AUTO_REPLY_ENABLED = "false";

  const providerCalls = [];
  const { server, base, messagesFile, conversationsFile, auditFile, cleanup } = await createTestServer({
    provider: {
      name: "meta-test-provider",
      status: () => ({ provider: "meta-test-provider", configured: true }),
      sendText: async (input) => {
        providerCalls.push(input);
        return { ok: true, sent: true, status: "sent_by_provider" };
      }
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551777777777",
        id: "wamid-v2-observe-only",
        type: "text",
        text: { body: "oi" }
      }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.handled, true);
    assert.equal(body.engine, "v2");
    assert.equal(body.mode, "observe_only");
    assert.equal(body.automaticReplyCreated, false);
    assert.equal(body.sent, false);
    assert.equal(body.aiCalled, false);
    assert.equal(body.senderCalled, false);
    assert.equal(body.outboxCreated, false);
    assert.equal(providerCalls.length, 0);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 1);
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 1);
    assert.equal(conversations.conversas[0].mensagens.length, 1);

    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.equal(audit.filter((event) => event.type === "whatsapp_v2_observe_only").length, 1);
    assert.equal(audit.some((event) => event.type === "intent_detected"), false);
    assert.equal(audit.some((event) => event.type === "operation_router"), false);
    assert.equal(audit.some((event) => event.type === "whatsapp_cloud_auto_reply"), false);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSend);
    restoreEnv("WHATSAPP_AI_ENABLED", previousAi);
    restoreEnv("WHATSAPP_AUTO_REPLY_ENABLED", previousAutoReply);
  }
});

test("POST /webhook/whatsapp com V2 observe_only ignora duplicata antes do motor", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  process.env.WHATSAPP_V2_ENABLED = "true";
  const { server, base, messagesFile, conversationsFile, auditFile, cleanup } = await createTestServer();
  try {
    const payload = metaPayload({
      from: "5551666666666",
      id: "wamid-v2-duplicate-observe",
      type: "text",
      text: { body: "oi" }
    });
    const first = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const second = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const firstBody = await first.json();
    const secondBody = await second.json();

    assert.equal(firstBody.engine, "v2");
    assert.equal(firstBody.mode, "observe_only");
    assert.equal(second.status, 200);
    assert.equal(secondBody.ok, true);
    assert.equal(secondBody.handled, false);
    assert.equal(secondBody.duplicate, true);
    assert.equal(secondBody.reason, "duplicate_message");
    assert.equal(secondBody.automaticReplyCreated, false);
    assert.equal(secondBody.sent, false);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 1);
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas[0].mensagens.length, 1);
    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.equal(audit.filter((event) => event.type === "whatsapp_v2_observe_only").length, 1);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
  }
});

test("POST /webhook/whatsapp status Meta nao entra na V2 observe_only", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  process.env.WHATSAPP_V2_ENABLED = "true";
  const { server, base, messagesFile, conversationsFile, auditFile, cleanup } = await createTestServer();
  try {
    await writeFile(messagesFile, JSON.stringify([{
      id: "out_1",
      direction: "out",
      provider: "meta",
      phone: "5551999999999",
      providerMessageId: "wamid-status-only",
      text: "Resposta manual",
      status: "sent",
      response: { messages: [{ id: "wamid-status-only" }] },
      createdAt: "2026-07-03T10:00:00.000Z"
    }]), "utf8");
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_5551999999999",
        telefone: "5551999999999",
        mensagens: [{ id: "msg_out_1", direction: "out", providerMessageId: "wamid-status-only", response: { messages: [{ id: "wamid-status-only" }] }, status: "sent" }]
      }]
    }), "utf8");

    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(statusPayload())
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.reason, "meta_status_callback");
    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.equal(audit.some((event) => event.type === "whatsapp_v2_observe_only"), false);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
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

test("/health retorna versao e commit do build", async () => {
  const previousAppVersion = process.env.APP_VERSION;
  const previousCommit = process.env.RENDER_GIT_COMMIT;
  process.env.APP_VERSION = "whatsapp-v1-removed";
  process.env.RENDER_GIT_COMMIT = "commit-health-test";
  const { server, base, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "sambah");
    assert.equal(body.commit, "commit-health-test");
    assert.equal(body.version, "whatsapp-v1-removed");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("APP_VERSION", previousAppVersion);
    restoreEnv("RENDER_GIT_COMMIT", previousCommit);
  }
});

async function createTestServer({ provider = new MockWhatsAppProvider({ logger: { info: () => {} } }), whatsappSendFetch = globalThis.fetch } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambha-wa-maintenance-"));
  await writeFile(join(dir, "menu.json"), JSON.stringify({ items: menuItems(), updatedAt: "2026-06-15T00:00:00.000Z" }), "utf8");
  await writeFile(join(dir, "rules.json"), JSON.stringify(menuRules()), "utf8");
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json"), fetchImpl: async () => new Response("{}", { status: 202 }) });
  const eventService = new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "services.json") });
  const conversationsFile = join(dir, "conversas.json");
  const whatsappConversationService = new WhatsAppConversationService({ filePath: conversationsFile });
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
    whatsappMessageService,
    whatsappSendFetch
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    auditFile: join(dir, "audit.json"),
    messagesFile: join(dir, "messages.json"),
    conversationsFile,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

function metaPayload(message, { phoneNumberId = "1234567890", field = "messages" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field,
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "5551980413745",
            phone_number_id: phoneNumberId
          },
          contacts: [{ profile: { name: "Cliente Meta" }, wa_id: message.from }],
          messages: [message]
        }
      }]
    }]
  };
}

function statusPayload() {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "5551980413745",
            phone_number_id: "1234567890"
          },
          statuses: [{
            id: "wamid-status-only",
            status: "delivered",
            timestamp: "1782214373",
            recipient_id: "5551999999999"
          }]
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

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
