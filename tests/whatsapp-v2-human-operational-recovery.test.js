import test from "node:test";
import assert from "node:assert/strict";
import { createWhatsAppV2State } from "../src/whatsapp/v2/conversationState.js";
import { InMemoryWhatsAppV2ConversationRepository } from "../src/whatsapp/v2/inMemoryRepositories.js";
import { createWhatsAppV2OperationalEngine } from "../src/whatsapp/v2/whatsappV2LabEngine.js";

const PHONE = "5551980413745";

function humanState(updatedAt) {
  return {
    ...createWhatsAppV2State(PHONE, updatedAt),
    mode: "human",
    serviceState: "HUMANO",
    updatedAt
  };
}

test("mensagem dentro de 30 minutos preserva HUMANO e recebe confirmacao eficaz", async () => {
  const repository = new InMemoryWhatsAppV2ConversationRepository();
  await repository.save(humanState("2026-07-24T11:01:00.000Z"));
  const engine = createWhatsAppV2OperationalEngine({ conversationRepository: repository });

  const result = await engine.processor.handleIncoming({
    messageId: "wamid-human-active-1",
    from: PHONE,
    text: "oi",
    receivedAt: "2026-07-24T11:30:00.000Z"
  });

  assert.equal(result.mode, "operational");
  assert.equal(result.repliesObserved, 1);
  assert.equal(result.humanStateExpired, false);
  assert.equal(result.source, "humanState");
  assert.equal(result.state.mode, "human");
  assert.equal(result.state.serviceState, "HUMANO");
  assert.equal(result.replies.length, 1);
  assert.equal(result.replies[0].type, "text");
  assert.match(result.replies[0].text, /já avisei a equipe/i);
  assert.equal(result.actions.some((action) => action.type === "notify_operator"), true);
  assert.equal(result.actions.some((action) => action.type === "human_acknowledgement"), true);
});

test("HUMANO expira depois de 30 minutos e oi reabre o Portal Insano", async () => {
  const repository = new InMemoryWhatsAppV2ConversationRepository();
  await repository.save(humanState("2026-07-24T10:59:00.000Z"));
  const engine = createWhatsAppV2OperationalEngine({ conversationRepository: repository });

  const result = await engine.processor.handleIncoming({
    messageId: "wamid-human-expired-1",
    from: PHONE,
    text: "oi",
    receivedAt: "2026-07-24T11:30:00.000Z"
  });

  assert.equal(result.mode, "operational");
  assert.equal(result.repliesObserved, 1);
  assert.equal(result.humanStateExpired, true);
  assert.equal(result.state.mode, "bot");
  assert.equal(result.state.serviceState, "AUTOMATICO");
  assert.equal(result.state.activeMenu, "portal_main_menu");
  assert.deepEqual(result.state.navigationStack, ["PORTAL_INSANO"]);
  assert.equal(result.replies.length, 1);
  assert.equal(result.replies[0].type, "menu");
  assert.equal(result.replies[0].menu.id, "portal_main_menu");
});

test("nova mensagem depois da expiracao recebe atendimento automatico mesmo sem escrever inicio", async () => {
  const repository = new InMemoryWhatsAppV2ConversationRepository();
  await repository.save(humanState("2026-07-24T10:00:00.000Z"));
  const engine = createWhatsAppV2OperationalEngine({ conversationRepository: repository });

  const result = await engine.processor.handleIncoming({
    messageId: "wamid-human-expired-2",
    from: PHONE,
    text: "quero ver as opções",
    receivedAt: "2026-07-24T11:30:00.000Z"
  });

  assert.equal(result.mode, "operational");
  assert.equal(result.repliesObserved, 1);
  assert.equal(result.humanStateExpired, true);
  assert.equal(result.state.mode, "bot");
  assert.equal(result.state.serviceState, "AUTOMATICO");
  assert.equal(result.replies.length, 1);
  assert.equal(result.replies[0].type, "menu");
  assert.equal(result.replies[0].menu.id, "portal_main_menu");
});

test("qualquer contexto automatico expira apos 30 minutos e a nova frase inicia outro atendimento", async () => {
  const repository = new InMemoryWhatsAppV2ConversationRepository();
  const state = createWhatsAppV2State(PHONE, "2026-07-24T10:00:00.000Z");
  state.areaId = "comunicacao_visual";
  state.activeMenu = "visual_communication_menu";
  state.activeFlow = "assisted_intake";
  state.activeStep = "objective";
  state.awaitingInput = true;
  state.flowData = { preAttendance: { intent: "geral", answers: { old: "contexto" } } };
  await repository.save(state);
  const engine = createWhatsAppV2OperationalEngine({ conversationRepository: repository });

  const result = await engine.processor.handleIncoming({
    messageId: "wamid-automatic-expired-1",
    from: PHONE,
    text: "quero saber o valor de um evento",
    receivedAt: "2026-07-24T11:30:00.000Z"
  });

  assert.equal(result.conversationStateExpired, true);
  assert.equal(result.state.mode, "bot");
  assert.equal(result.state.serviceState, "AUTOMATICO");
  assert.equal(result.state.areaId, null);
  assert.equal(result.state.activeFlow, "assisted_intake");
  assert.equal(result.state.flowData.preAttendance.intent, "evento");
  assert.equal(result.state.flowData.preAttendance.answers.old, undefined);
  assert.match(result.replies[0].text, /data prevista do evento/i);
});
