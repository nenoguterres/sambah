import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { adaptMetaWebhookV2 } from "../src/whatsapp/v2/metaWebhookAdapter.js";
import { createWhatsAppV2LabEngine } from "../src/whatsapp/v2/whatsappV2LabEngine.js";
import { FileWhatsAppV2ConversationRepository } from "../src/whatsapp/v2/inMemoryRepositories.js";
import { createWhatsAppV2State } from "../src/whatsapp/v2/conversationState.js";

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
  const engine = createLabEngine();
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
  const engine = createLabEngine();
  const handoff = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-1", from: "5551000000003", text: "humano" });
  const reason = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-2", from: "5551000000003", text: "quero falar sobre evento" });
  const afterHuman = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-3", from: "5551000000003", text: "oi" });

  assert.equal(handoff.state.activeFlow, null);
  assert.equal(handoff.state.mode, "human");
  assert.equal(handoff.state.serviceState, "HUMANO");
  assert.equal(reason.state.mode, "human");
  assert.equal(reason.state.serviceState, "HUMANO");
  assert.equal(afterHuman.state.mode, "human");
  assert.equal(afterHuman.repliesSent, 0);
  assert.equal(engine.sender.sent.length, 1);
});

test("WhatsApp V2 lab sender fake falha sem chamar servico real e deixa outbox failed", async () => {
  const sender = new FakeWhatsAppV2MetaSender({ failNext: true });
  const engine = createLabEngine({ sender });
  const result = await engine.processor.handleIncoming({ messageId: "wamid-v2-fail-1", from: "5551000000004", text: "oi" });
  const outbox = engine.outboxRepository.list()[0];

  assert.equal(result.repliesSent, 0);
  assert.equal(sender.sent.length, 0);
  assert.equal(outbox.status, "failed");
  assert.equal(outbox.lastError, "FAKE_WHATSAPP_V2_SENDER_FAILURE");
});

test("WhatsApp V2 lab observeOnly observa resposta sem criar outbox ou chamar sender", async () => {
  const sender = new FakeWhatsAppV2MetaSender();
  const engine = createLabEngine({ sender, observeOnly: true });
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
  const engine = createLabEngine({ observeOnly: true });
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
    assert.equal(result.state.activeFlow, null);
    if (text === "5") assert.equal(result.state.serviceState, "HUMANO");
  }
  assert.equal(engine.operationLog.includes("ai"), false);
});

test("Portal Insano Food Truck exibe submenu oficial e catalogo por botao URL", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const from = "5551000000188";
  await engine.processor.handleIncoming({ messageId: "wamid-foodtruck-menu-1", from, text: "oi" });
  const submenu = await engine.processor.handleIncoming({ messageId: "wamid-foodtruck-menu-2", from, text: "1" });
  const menu = submenu.replies[0].menu;

  assert.equal(submenu.state.activeMenu, "foodtruck_main_menu");
  assert.equal(menu.title, "Insano Food Truck");
  assert.equal(menu.body, "Insano Food Truck\n\nO que tu precisa?");
  assert.equal(menu.buttonText, "ESCOLHER UMA AÇÃO");
  assert.deepEqual(menu.options.map((option) => option.id), [
    "INSANO_EVENTO",
    "INSANO_ORCAMENTO",
    "INSANO_CATALOGO",
    "INSANO_HUMANO",
    "PORTAL_VOLTAR"
  ]);

  const catalog = await engine.processor.handleIncoming({ messageId: "wamid-foodtruck-menu-3", from, text: "INSANO_CATALOGO" });
  assert.equal(catalog.replies[0].type, "url_button");
  assert.equal(catalog.replies[0].buttonText, "ABRIR CATÁLOGO");
  assert.equal(catalog.replies[0].url, "https://www.insanofoodtruck.com.br/catalogo");
  assert.equal(catalog.state.foodtruckSubstate.selectedAction, "INSANO_CATALOGO");
});

test("Portal Insano Food Truck nao renderiza textos nem rotas legadas", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const from = "5551000000189";
  await engine.processor.handleIncoming({ messageId: "wamid-foodtruck-legacy-1", from, text: "oi" });
  const submenu = await engine.processor.handleIncoming({ messageId: "wamid-foodtruck-legacy-2", from, text: "1" });
  const rendered = submenu.replies[0].text;

  for (const forbidden of ["Agendar evento", "Conhecer serviços", "Conhecer servicos", "Cardápio para eventos", "Cardapio para eventos", "Consultar solicitação", "Consultar solicitacao"]) {
    assert.doesNotMatch(rendered, new RegExp(forbidden));
  }

  const numeric = await engine.processor.handleIncoming({ messageId: "wamid-foodtruck-legacy-3", from, text: "1" });
  assert.equal(numeric.state.activeMenu, "foodtruck_main_menu");
  assert.equal(numeric.state.activeFlow, null);
  assert.doesNotMatch(numeric.replies[0].text, /Qual data tu tem em mente/);
});

test("Portal Insano Food Truck limpa estado legado antes de roteamento", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const from = "5551000000190";
  const legacyState = createWhatsAppV2State(from);
  legacyState.areaId = "insano_food_truck";
  legacyState.activeMenu = "foodtruck_services_menu";
  legacyState.activeFlow = "foodtruck_event_request";
  legacyState.activeStep = "event_date";
  legacyState.awaitingInput = true;
  await engine.conversationRepository.save(legacyState);

  const result = await engine.processor.handleIncoming({ messageId: "wamid-foodtruck-legacy-state", from, text: "17/07" });

  assert.equal(result.state.areaId, "insano_food_truck");
  assert.equal(result.state.activeMenu, "foodtruck_main_menu");
  assert.equal(result.state.activeFlow, null);
  assert.equal(result.state.activeStep, null);
  assert.equal(result.state.awaitingInput, false);
  assert.equal(result.state.foodtruckSubstate, null);
  assert.doesNotMatch(result.replies[0].text, /Registrado/);
  assert.doesNotMatch(result.replies[0].text, /Agendar evento|Conhecer servicos|Cardapio para eventos|Consultar solicitacao/);
});

test("Portal Insano preserva area nos menus Foodtruck, Xeriffe, Granja e Tecnologia", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const flows = [
    ["1", "INSANO_EVENTO", "foodtruck_followup_menu", "insano_food_truck"],
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
  const engine = createLabEngine({ observeOnly: true });
  const from = "5551000000300";
  await engine.processor.handleIncoming({ messageId: "wamid-nav-1", from, text: "oi" });
  await engine.processor.handleIncoming({ messageId: "wamid-nav-2", from, text: "1" });
  const invalid = await engine.processor.handleIncoming({ messageId: "wamid-nav-3", from, text: "Catalogo de produtos" });
  assert.equal(invalid.state.activeMenu, "foodtruck_main_menu");
  assert.match(invalid.state.history.at(-1).text, /Catalogo/);
  assert.match(invalid.outboxId ? engine.outboxRepository.list().at(-1).reply.text : "Insano Food Truck", /Insano Food Truck/);

  await engine.processor.handleIncoming({ messageId: "wamid-nav-4", from, text: "INSANO_EVENTO" });
  const back = await engine.processor.handleIncoming({ messageId: "wamid-nav-5", from, text: "INSANO_MENU_VOLTAR" });
  assert.equal(back.state.activeMenu, "foodtruck_main_menu");
  const home = await engine.processor.handleIncoming({ messageId: "wamid-nav-6", from, text: "inicio" });
  assert.equal(home.state.activeMenu, "portal_main_menu");
  assert.equal(home.state.areaId, null);
});

test("Portal Insano Food Truck usa ids interativos sem trocar area por texto livre", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const from = "5551000000400";
  await engine.processor.handleIncoming({ messageId: "wamid-flow-1", from, text: "oi" });
  await engine.processor.handleIncoming({ messageId: "wamid-flow-2", from, text: "1" });
  const textOnly = await engine.processor.handleIncoming({ messageId: "wamid-flow-3", from, text: "2" });
  assert.equal(textOnly.state.activeMenu, "foodtruck_main_menu");
  assert.equal(textOnly.state.activeFlow, null);
  assert.equal(textOnly.state.areaId, "insano_food_truck");

  const quote = await engine.processor.handleIncoming({ messageId: "wamid-flow-4", from, text: "INSANO_ORCAMENTO" });
  assert.equal(quote.state.activeMenu, "foodtruck_followup_menu");
  assert.equal(quote.state.activeFlow, null);
  assert.equal(quote.state.foodtruckSubstate.selectedAction, "INSANO_ORCAMENTO");
  assert.match(quote.replies[0].text, /Vamos preparar teu orçamento/);
});

test("Portal Insano texto de pagamento nunca confirma pagamento", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const first = await engine.processor.handleIncoming({ messageId: "wamid-pay-1", from: "5551000000500", text: "paguei" });
  const second = await engine.processor.handleIncoming({ messageId: "wamid-pay-2", from: "5551000000500", text: "pedido 123" });

  assert.equal(first.state.activeFlow, "payment_receipt_review");
  assert.equal(second.state.activeFlow, null);
  assert.equal(second.state.flowData.payment.reference, "pedido 123");
  assert.equal(second.state.mode, "bot");
});

test("Portal Insano integracao desabilitada nao e chamada", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const from = "5551000000600";
  await engine.processor.handleIncoming({ messageId: "wamid-int-1", from, text: "oi" });
  await engine.processor.handleIncoming({ messageId: "wamid-int-2", from, text: "2" });
  const result = await engine.processor.handleIncoming({ messageId: "wamid-int-3", from, text: "3" });

  assert.equal(result.source, "integrationGuard");
  assert.equal(result.state.areaId, "xeriffe_obirici");
  assert.equal(engine.operationLog.includes("mesa_do_xeriffe"), false);
});

test("Portal Insano estado Food Truck persiste entre reinicios do repositorio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-state-"));
  try {
    const filePath = join(dir, "state.json");
    const firstRepo = new FileWhatsAppV2ConversationRepository({ filePath });
    const first = createLabEngine({ conversationRepository: firstRepo, observeOnly: true });
    await first.processor.handleIncoming({ messageId: "wamid-persist-1", from: "5551000000700", text: "oi" });
    await first.processor.handleIncoming({ messageId: "wamid-persist-2", from: "5551000000700", text: "1" });
    await first.processor.handleIncoming({ messageId: "wamid-persist-3", from: "5551000000700", text: "INSANO_EVENTO" });

    const secondRepo = new FileWhatsAppV2ConversationRepository({ filePath });
    const second = createLabEngine({ conversationRepository: secondRepo, observeOnly: true });
    const answer = await second.processor.handleIncoming({ messageId: "wamid-persist-4", from: "5551000000700", text: "INSANO_MENU_VOLTAR" });

    assert.equal(answer.state.areaId, "insano_food_truck");
    assert.equal(answer.state.activeMenu, "foodtruck_main_menu");
    assert.equal(answer.state.foodtruckSubstate.selectedAction, "INSANO_EVENTO");
    assert.equal(answer.state.activeFlow, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Repositorio V2 cria diretorio ausente e arquivo ausente inicia estrutura valida", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-atomic-"));
  const nested = join(dir, "missing", "state.json");
  try {
    const repo = new FileWhatsAppV2ConversationRepository({ filePath: nested });
    const state = createWhatsAppV2State("5551000000800");
    state.mode = "human";
    state.serviceState = "HUMANO";
    await repo.save(state);

    const stored = JSON.parse(await readFile(nested, "utf8"));
    assert.deepEqual(Object.keys(stored).sort(), ["messageStatuses", "states"]);
    assert.equal(stored.states["5551000000800"].serviceState, "HUMANO");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Repositorio V2 recarrega HUMANO, history, lastProcessedMessageId e messageStatuses", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-atomic-"));
  const filePath = join(dir, "state.json");
  try {
    const state = createWhatsAppV2State("5551000000801");
    state.mode = "human";
    state.serviceState = "HUMANO";
    state.history = [{ messageId: "wamid-human-persist", text: "humano", at: "2026-07-11T10:00:00.000Z" }];
    state.lastProcessedMessageId = "wamid-human-persist";
    await writeFile(filePath, JSON.stringify({
      states: { "5551000000801": state },
      messageStatuses: { "wamid-human-persist": { status: "processed", updatedAt: "2026-07-11T10:00:00.000Z" } }
    }, null, 2), "utf8");

    const repo = new FileWhatsAppV2ConversationRepository({ filePath });
    const loaded = await repo.get("5551000000801");
    assert.equal(loaded.mode, "human");
    assert.equal(loaded.serviceState, "HUMANO");
    assert.equal(loaded.history[0].messageId, "wamid-human-persist");
    assert.equal(loaded.lastProcessedMessageId, "wamid-human-persist");
    assert.equal(await repo.reserveMessage("wamid-human-persist"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Repositorio V2 serializa mutacoes concorrentes sem apagar states ou messageStatuses", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-atomic-"));
  const filePath = join(dir, "state.json");
  try {
    const repo = new FileWhatsAppV2ConversationRepository({ filePath });
    const human = createWhatsAppV2State("5551000000802");
    human.mode = "human";
    human.serviceState = "HUMANO";
    await Promise.all([
      repo.save(human),
      repo.reserveMessage("wamid-concurrent-1"),
      repo.markMessageProcessed("wamid-concurrent-2")
    ]);

    const stored = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(stored.states["5551000000802"].serviceState, "HUMANO");
    assert.equal(stored.messageStatuses["wamid-concurrent-1"].status, "reserved");
    assert.equal(stored.messageStatuses["wamid-concurrent-2"].status, "processed");

    const update = { ...stored.states["5551000000802"], activeMenu: "foodtruck_main_menu" };
    await repo.save(update);
    await repo.markMessageFailed("wamid-concurrent-3", new Error("falha fake"));
    const after = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(after.states["5551000000802"].activeMenu, "foodtruck_main_menu");
    assert.equal(after.messageStatuses["wamid-concurrent-1"].status, "reserved");
    assert.equal(after.messageStatuses["wamid-concurrent-3"].status, "failed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Repositorio V2 falha de escrita preserva arquivo e estado em memoria, fila continua", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-atomic-"));
  const filePath = join(dir, "state.json");
  let writes = 0;
  const atomicWrite = async (target, payload) => {
    writes += 1;
    if (writes === 2) {
      const error = new Error("rename failed");
      error.code = "EPERM";
      throw error;
    }
    await writeFile(target, payload, "utf8");
  };
  try {
    const repo = new FileWhatsAppV2ConversationRepository({ filePath, atomicWrite });
    const human = createWhatsAppV2State("5551000000803");
    human.mode = "human";
    human.serviceState = "HUMANO";
    await repo.save(human);
    const before = await readFile(filePath, "utf8");

    const bot = { ...human, mode: "bot", serviceState: "AUTOMATICO" };
    await assert.rejects(repo.save(bot), /whatsapp_v2_state_write_failed/);
    assert.equal(await readFile(filePath, "utf8"), before);
    assert.equal((await repo.get("5551000000803")).serviceState, "HUMANO");

    await repo.markMessageProcessed("wamid-after-failure");
    const after = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(after.states["5551000000803"].serviceState, "HUMANO");
    assert.equal(after.messageStatuses["wamid-after-failure"].status, "processed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Repositorio V2 escrita atomica nao deixa temporario apos sucesso", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-atomic-"));
  const filePath = join(dir, "state.json");
  try {
    const repo = new FileWhatsAppV2ConversationRepository({ filePath });
    await repo.markMessageProcessed("wamid-temp-success");
    const files = await readdir(dir);
    assert.equal(files.some((file) => file.includes(".v2-write-") && file.endsWith(".tmp")), false);
    const stored = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(Object.keys(stored).sort(), ["messageStatuses", "states"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Repositorio V2 remove somente temporarios proprios antigos durante load", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-atomic-"));
  const filePath = join(dir, "state.json");
  try {
    await writeFile(filePath, JSON.stringify({ states: {}, messageStatuses: {} }), "utf8");
    const oldTemp = join(dir, "state.json.v2-write-123-100-00000000-0000-4000-8000-000000000000.tmp");
    const unrelated = join(dir, "outro.tmp");
    await writeFile(oldTemp, "x", "utf8");
    await writeFile(unrelated, "x", "utf8");
    const old = new Date(Date.now() - 120000);
    await import("node:fs/promises").then(({ utimes }) => utimes(oldTemp, old, old));

    const repo = new FileWhatsAppV2ConversationRepository({ filePath });
    await repo.get("5551000000804");
    const files = await readdir(dir);
    assert.equal(files.includes("state.json.v2-write-123-100-00000000-0000-4000-8000-000000000000.tmp"), false);
    assert.equal(files.includes("outro.tmp"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Repositorio V2 JSON invalido ou estrutura invalida gera erro controlado e nao sobrescreve", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-v2-atomic-"));
  try {
    const invalidJson = join(dir, "invalid-json.json");
    await writeFile(invalidJson, "{json interrompido", "utf8");
    const invalidRepo = new FileWhatsAppV2ConversationRepository({ filePath: invalidJson });
    await assert.rejects(invalidRepo.get("5551000000805"), (error) => error.code === "whatsapp_v2_state_corrupt");
    assert.equal(await readFile(invalidJson, "utf8"), "{json interrompido");

    const missingStates = join(dir, "missing-states.json");
    await writeFile(missingStates, JSON.stringify({ messageStatuses: {} }), "utf8");
    await assert.rejects(new FileWhatsAppV2ConversationRepository({ filePath: missingStates }).get("x"), (error) => error.code === "whatsapp_v2_state_corrupt");

    const missingStatuses = join(dir, "missing-statuses.json");
    await writeFile(missingStatuses, JSON.stringify({ states: {} }), "utf8");
    await assert.rejects(new FileWhatsAppV2ConversationRepository({ filePath: missingStatuses }).get("x"), (error) => error.code === "whatsapp_v2_state_corrupt");
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

function createLabEngine(options = {}) {
  return createWhatsAppV2LabEngine({ sender: options.sender || new FakeWhatsAppV2MetaSender(), ...options });
}

class FakeWhatsAppV2MetaSender {
  constructor({ failNext = false } = {}) {
    this.failNext = failNext;
    this.sent = [];
  }

  async send(payload) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("FAKE_WHATSAPP_V2_SENDER_FAILURE");
    }
    this.sent.push(structuredClone(payload));
    return { ok: true, provider: "fake-whatsapp-v2", sent: true };
  }
}
