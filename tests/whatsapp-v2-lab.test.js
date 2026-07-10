import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { adaptMetaWebhookV2 } from "../src/whatsapp/v2/metaWebhookAdapter.js";
import { createWhatsAppV2LabEngine } from "../src/whatsapp/v2/whatsappV2LabEngine.js";
import { FakeWhatsAppV2MetaSender } from "../src/whatsapp/v2/fakeMetaSender.js";
import { FileWhatsAppV2ConversationRepository } from "../src/whatsapp/v2/inMemoryRepositories.js";

test("WhatsApp V2 lab adapta payload Meta fake sem usar token ou webhook real", () => {
  const adapted = adaptMetaWebhookV2(metaPayload({ id: "wamid-v2-1", from: "5551000000001", text: { body: "oi" } }));
  assert.equal(adapted.type, "message");
  assert.equal(adapted.message.messageId, "wamid-v2-1");
  assert.equal(adapted.message.from, "5551000000001");
  assert.equal(adapted.message.text, "oi");
});

test("WhatsApp V2 lab trata status Meta como callback tecnico sem roteador", () => {
  const adapted = adaptMetaWebhookV2({
    entry: [{ changes: [{ value: { statuses: [{ id: "wamid-status-v2", status: "delivered", timestamp: "1783703000" }] } }] }]
  });
  assert.equal(adapted.type, "status");
  assert.equal(adapted.statuses.length, 1);
});

test("WhatsApp V2 lab deduplica messageId e envia no maximo uma resposta fake", async () => {
  const engine = createWhatsAppV2LabEngine();
  const message = { messageId: "wamid-v2-dedupe", from: "5551000000002", text: "oi", receivedAt: "2026-07-10T16:00:00.000Z" };
  const first = await engine.processor.handleIncoming(message);
  const second = await engine.processor.handleIncoming(message);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.repliesSent, 1);
  assert.equal(second.repliesSent, 0);
  assert.equal(engine.sender.sent.length, 1);
  assert.equal(engine.outboxRepository.list().length, 1);
});

test("WhatsApp V2 lab modo humano preserva contexto e bloqueia automacao apos motivo", async () => {
  const engine = createWhatsAppV2LabEngine();
  const handoff = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-1", from: "5551000000003", text: "humano" });
  const reason = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-2", from: "5551000000003", text: "quero falar sobre evento" });
  const afterHuman = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-3", from: "5551000000003", text: "oi" });

  assert.equal(handoff.state.activeFlow, "human_handoff");
  assert.equal(reason.state.mode, "human");
  assert.equal(reason.state.serviceState, "HUMANO");
  assert.equal(afterHuman.state.mode, "human");
  assert.equal(afterHuman.repliesSent, 0);
  assert.equal(engine.sender.sent.length, 2);
});

test("WhatsApp V2 lab sender fake falha sem chamar servico real e deixa outbox failed", async () => {
  const sender = new FakeWhatsAppV2MetaSender({ failNext: true });
  const engine = createWhatsAppV2LabEngine({ sender });
  const result = await engine.processor.handleIncoming({ messageId: "wamid-v2-fail-1", from: "5551000000004", text: "oi" });
  const outbox = engine.outboxRepository.list()[0];

  assert.equal(result.repliesSent, 0);
  assert.equal(sender.sent.length, 0);
  assert.equal(outbox.status, "failed");
  assert.equal(outbox.lastError, "FAKE_WHATSAPP_V2_SENDER_FAILURE");
});

test("WhatsApp V2 lab observeOnly observa resposta sem criar outbox ou chamar sender", async () => {
  const sender = new FakeWhatsAppV2MetaSender();
  const engine = createWhatsAppV2LabEngine({ sender, observeOnly: true });
  const result = await engine.processor.handleIncoming({ messageId: "wamid-v2-observe-1", from: "5551000000005", text: "oi" });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "observe_only");
  assert.equal(result.repliesObserved, 1);
  assert.equal(result.repliesSent, 0);
  assert.equal(result.outboxId, null);
  assert.equal(sender.sent.length, 0);
  assert.equal(engine.outboxRepository.list().length, 0);
});

test("Portal Insano menu principal roteia cada botao sem chamar IA", async () => {
  const engine = createWhatsAppV2LabEngine({ observeOnly: true });
  const cases = [
    ["1", "foodtruck_main_menu", "insano_food_truck"],
    ["2", "xeriffe_main_menu", "xeriffe_obirici"],
    ["3", "granja_main_menu", "granja_aguas_da_lagoa"],
    ["4", "technology_main_menu", "desenvolvimento_tecnologias"],
    ["5", null, null]
  ];

  for (const [text, menu, area] of cases) {
    const from = `55510000001${text}`;
    await engine.processor.handleIncoming({ messageId: `wamid-main-${text}-welcome`, from, text: "oi" });
    const result = await engine.processor.handleIncoming({ messageId: `wamid-main-${text}-select`, from, text });
    assert.equal(result.state.activeMenu, menu || "portal_main_menu");
    assert.equal(result.state.areaId, area);
    assert.equal(result.state.activeFlow, text === "5" ? "human_handoff" : null);
  }
  assert.equal(engine.operationLog.includes("ai"), false);
});

test("Portal Insano preserva area nos menus Foodtruck, Xeriffe, Granja e Tecnologia", async () => {
  const engine = createWhatsAppV2LabEngine({ observeOnly: true });
  const flows = [
    ["1", "3", "foodtruck_services_menu", "insano_food_truck"],
    ["2", "1", "xeriffe_catalog_menu", "xeriffe_obirici"],
    ["3", "1", "granja_main_menu", "granja_aguas_da_lagoa"],
    ["4", "11", "technology_main_menu", "desenvolvimento_tecnologias"]
  ];

  for (const [areaOption, secondOption, expectedMenu, expectedArea] of flows) {
    const from = `55510000002${areaOption}`;
    await engine.processor.handleIncoming({ messageId: `wamid-area-${areaOption}-welcome`, from, text: "oi" });
    await engine.processor.handleIncoming({ messageId: `wamid-area-${areaOption}-select`, from, text: areaOption });
    const result = await engine.processor.handleIncoming({ messageId: `wamid-area-${areaOption}-second`, from, text: secondOption });
    assert.equal(result.state.areaId, expectedArea);
    assert.equal(result.state.activeMenu, expectedMenu);
  }
});

test("Portal Insano opcao invalida repete menu atual e comandos voltar/inicio navegam corretamente", async () => {
  const engine = createWhatsAppV2LabEngine({ observeOnly: true });
  const from = "5551000000300";
  await engine.processor.handleIncoming({ messageId: "wamid-nav-1", from, text: "oi" });
  await engine.processor.handleIncoming({ messageId: "wamid-nav-2", from, text: "1" });
  const invalid = await engine.processor.handleIncoming({ messageId: "wamid-nav-3", from, text: "99" });
  assert.equal(invalid.state.activeMenu, "foodtruck_main_menu");
  assert.match(invalid.state.history.at(-1).text, /99/);
  assert.match(invalid.outboxId ? engine.outboxRepository.list().at(-1).reply.text : "Insano Food Truck", /Insano Food Truck/);

  await engine.processor.handleIncoming({ messageId: "wamid-nav-4", from, text: "3" });
  const back = await engine.processor.handleIncoming({ messageId: "wamid-nav-5", from, text: "voltar" });
  assert.equal(back.state.activeMenu, "foodtruck_main_menu");
  const home = await engine.processor.handleIncoming({ messageId: "wamid-nav-6", from, text: "inicio" });
  assert.equal(home.state.activeMenu, "portal_main_menu");
  assert.equal(home.state.areaId, null);
});

test("Portal Insano resposta curta usa etapa ativa sem trocar area por texto livre", async () => {
  const engine = createWhatsAppV2LabEngine({ observeOnly: true });
  const from = "5551000000400";
  await engine.processor.handleIncoming({ messageId: "wamid-flow-1", from, text: "oi" });
  await engine.processor.handleIncoming({ messageId: "wamid-flow-2", from, text: "1" });
  const start = await engine.processor.handleIncoming({ messageId: "wamid-flow-3", from, text: "2" });
  assert.equal(start.state.activeFlow, "foodtruck_quote_request");
  const answer = await engine.processor.handleIncoming({ messageId: "wamid-flow-4", from, text: "80" });
  assert.equal(answer.state.areaId, "insano_food_truck");
  assert.equal(answer.state.flowData.quote.people, "80");
});

test("Portal Insano texto de pagamento nunca confirma pagamento", async () => {
  const engine = createWhatsAppV2LabEngine({ observeOnly: true });
  const first = await engine.processor.handleIncoming({ messageId: "wamid-pay-1", from: "5551000000500", text: "paguei" });
  const second = await engine.processor.handleIncoming({ messageId: "wamid-pay-2", from: "5551000000500", text: "pedido 123" });

  assert.equal(first.state.activeFlow, "payment_receipt_review");
  assert.equal(second.state.activeFlow, null);
  assert.equal(second.state.flowData.payment.reference, "pedido 123");
  assert.equal(second.state.mode, "bot");
});

test("Portal Insano integracao desabilitada nao e chamada", async () => {
  const engine = createWhatsAppV2LabEngine({ observeOnly: true });
  const from = "5551000000600";
  await engine.processor.handleIncoming({ messageId: "wamid-int-1", from, text: "oi" });
  await engine.processor.handleIncoming({ messageId: "wamid-int-2", from, text: "2" });
  const result = await engine.processor.handleIncoming({ messageId: "wamid-int-3", from, text: "3" });

  assert.equal(result.source, "integrationGuard");
  assert.equal(result.state.areaId, "xeriffe_obirici");
  assert.equal(engine.operationLog.includes("mesa_do_xeriffe"), false);
});

test("Portal Insano estado de fluxo persiste entre reinicios do repositorio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-state-"));
  try {
    const filePath = join(dir, "state.json");
    const firstRepo = new FileWhatsAppV2ConversationRepository({ filePath });
    const first = createWhatsAppV2LabEngine({ conversationRepository: firstRepo, observeOnly: true });
    await first.processor.handleIncoming({ messageId: "wamid-persist-1", from: "5551000000700", text: "oi" });
    await first.processor.handleIncoming({ messageId: "wamid-persist-2", from: "5551000000700", text: "1" });
    await first.processor.handleIncoming({ messageId: "wamid-persist-3", from: "5551000000700", text: "2" });

    const secondRepo = new FileWhatsAppV2ConversationRepository({ filePath });
    const second = createWhatsAppV2LabEngine({ conversationRepository: secondRepo, observeOnly: true });
    const answer = await second.processor.handleIncoming({ messageId: "wamid-persist-4", from: "5551000000700", text: "120 pessoas" });

    assert.equal(answer.state.areaId, "insano_food_truck");
    assert.equal(answer.state.flowData.quote.people, "120 pessoas");
    assert.equal(answer.state.activeFlow, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function metaPayload(message = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5500000000000", phone_number_id: "1234567890" },
          contacts: [{ profile: { name: "Cliente V2 Lab" }, wa_id: message.from }],
          messages: [{ timestamp: "1783703000", type: "text", ...message }]
        }
      }]
    }]
  };
}
