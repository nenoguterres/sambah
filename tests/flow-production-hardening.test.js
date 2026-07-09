import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("/health retorna versao e commit do build", async () => {
  const previousAppVersion = process.env.APP_VERSION;
  const previousCommit = process.env.RENDER_GIT_COMMIT;
  process.env.APP_VERSION = "guided-event-flow-state";
  process.env.RENDER_GIT_COMMIT = "commit-health-test";
  const { server, base, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "sambah");
    assert.equal(body.commit, "commit-health-test");
    assert.equal(body.version, "guided-event-flow-state");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("APP_VERSION", previousAppVersion);
    restoreEnv("RENDER_GIT_COMMIT", previousCommit);
  }
});

test("webhook Meta passa pelo Flow Manager antes da resposta padrao", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const logs = [];
  const previousConsoleInfo = console.info;
  console.info = (...args) => logs.push(args);
  const { server, base, conversationsFile, cleanup } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response(JSON.stringify({ messages: [{ id: "wamid-flow-manager" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  try {
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_5551999999999",
        nome: "Cliente Evento",
        telefone: "5551999999999",
        origem: "whatsapp",
        status: "aguardando_equipe",
        activeFlow: "event",
        activeStep: "askDate",
        flowData: { city: "Porto Alegre", time: "20h", people: 2026 },
        flowUpdatedAt: "2026-07-09T12:00:00.000Z",
        mensagens: [],
        createdAt: "2026-07-09T12:00:00.000Z",
        updatedAt: "2026-07-09T12:00:00.000Z"
      }]
    }), "utf8");

    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-flow-oi",
        type: "text",
        text: { body: "oi" }
      }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(graphCalls.length, 1);
    const sentBody = JSON.parse(graphCalls[0].options.body);
    assert.match(sentBody.text.body, /Tu quer continuar o orçamento em andamento ou voltar ao início/);
    assert.doesNotMatch(sentBody.text.body, /Pessoas: 2026/);
    assert.equal(body.conversa.activeFlow, "event");
    assert.equal(body.conversa.activeStep, "askDate");
    assert.deepEqual(body.conversa.flowData, { city: "Porto Alegre", time: "20h" });
    const flowLog = logs.find(([event]) => event === "whatsapp.flow_manager.received");
    assert.ok(flowLog);
    assert.equal(flowLog[1].text, "oi");
    assert.equal(flowLog[1].activeFlowBefore, "event");
    assert.equal(flowLog[1].activeStepBefore, "askDate");
    assert.equal(flowLog[1].globalCommand, "greeting");
    assert.equal(flowLog[1].activeFlowAfter, "event");
    assert.deepEqual(flowLog[1].flowDataAfter, { city: "Porto Alegre", time: "20h" });
  } finally {
    console.info = previousConsoleInfo;
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSendEnabled);
    restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previousPhoneNumberId);
  }
});

async function createTestServer({ whatsappSendFetch = globalThis.fetch } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambha-flow-prod-"));
  await writeFile(join(dir, "menu.json"), JSON.stringify({ items: [], updatedAt: "2026-07-09T00:00:00.000Z" }), "utf8");
  await writeFile(join(dir, "rules.json"), JSON.stringify({ version: 1, globalSynonyms: {}, products: {}, addons: {} }), "utf8");
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json"), fetchImpl: async () => new Response("{}", { status: 202 }) });
  const eventService = new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "services.json") });
  const conversationsFile = join(dir, "conversas.json");
  const whatsappConversationService = new WhatsAppConversationService({ filePath: conversationsFile });
  const whatsappMessageService = new WhatsAppMessageService({
    provider: new MockWhatsAppProvider({ logger: { info: () => {} } }),
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
    conversationsFile,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

function metaPayload(message) {
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
          contacts: [{ profile: { name: "Cliente Meta" }, wa_id: message.from }],
          messages: [message]
        }
      }]
    }]
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
