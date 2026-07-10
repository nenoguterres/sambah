import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractEventSlots, resolveConversationFlow } from "../src/flowManager.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

test("intent evento inicia activeFlow", () => {
  const result = resolveConversationFlow({
    conversation: {},
    text: "evento",
    intent: "evento",
    mode: "AUTO",
    now: "2026-07-09T12:00:00.000Z"
  });

  assert.equal(result.handled, true);
  assert.equal(result.activeFlow.type, "evento");
  assert.equal(result.activeFlow.status, "collecting");
  assert.match(result.reply, /data/);
  assert.match(result.reply, /cidade/);
  assert.match(result.reply, /horario/);
  assert.match(result.reply, /quantidade de pessoas/);
});

test("mensagem completa preenche slots de evento", () => {
  const slots = extractEventSlots("01/08/26, Porto Alegre, 20h, 1000");

  assert.equal(slots.date, "01/08/26");
  assert.equal(slots.city, "Porto Alegre");
  assert.equal(slots.time, "20h");
  assert.equal(slots.people, "1000");
});

test("activeFlow de evento pergunta apenas campo faltante", () => {
  const result = resolveConversationFlow({
    conversation: {
      activeFlow: {
        type: "evento",
        status: "collecting",
        slots: { date: "01/08/26", city: null, time: "20h", people: "1000", eventType: null }
      }
    },
    text: "Porto Alegre",
    intent: "unknown",
    mode: "AUTO",
    now: "2026-07-09T12:01:00.000Z"
  });

  assert.equal(result.handled, true);
  assert.equal(result.activeFlow.slots.city, "Porto Alegre");
  assert.equal(result.activeFlow.status, "ready");
  assert.doesNotMatch(result.reply, /me passa data, cidade, horario aproximado e quantidade de pessoas/i);
});

test("dados minimos deixam evento ready e nextAction preparado", () => {
  const result = resolveConversationFlow({
    conversation: {
      activeFlow: {
        type: "evento",
        status: "collecting",
        slots: { date: null, city: null, time: null, people: null, eventType: null }
      }
    },
    text: "01/08/26, Porto Alegre, 20h, 1000 pessoas",
    intent: "unknown",
    mode: "AUTO",
    now: "2026-07-09T12:02:00.000Z"
  });

  assert.equal(result.activeFlow.status, "ready");
  assert.equal(result.nextAction, "create_event_lead");
  assert.match(result.reply, /Recebi os dados iniciais|recebi os dados iniciais/i);
  assert.match(result.reply, /Porto Alegre/);
});

test("cancelar limpa activeFlow de evento", () => {
  const result = resolveConversationFlow({
    conversation: {
      activeFlow: {
        type: "evento",
        status: "collecting",
        slots: { date: "01/08/26", city: null, time: null, people: null, eventType: null }
      }
    },
    text: "cancelar",
    intent: "cancelar",
    mode: "AUTO"
  });

  assert.equal(result.handled, true);
  assert.equal(result.activeFlow, null);
  assert.match(result.reply, /Cancelei esse atendimento de evento/);
});

test("people com ano em activeFlow e removido antes da resposta", () => {
  const result = resolveConversationFlow({
    conversation: {
      activeFlow: {
        type: "evento",
        status: "collecting",
        slots: { date: null, city: "Porto Alegre", time: "20h", people: "2026", eventType: null },
        updatedAt: "2026-07-09T12:00:00.000Z"
      }
    },
    text: "oi",
    intent: "saudacao",
    mode: "AUTO",
    now: "2026-07-09T12:01:00.000Z"
  });

  assert.equal(result.handled, true);
  assert.equal(result.activeFlow.slots.people, null);
  assert.doesNotMatch(result.reply, /Pessoas: 2026/);
  assert.match(result.reply, /quantidade de pessoas/);
});

test("activeFlow antigo por TTL pergunta antes de continuar", () => {
  const result = resolveConversationFlow({
    conversation: {
      activeFlow: {
        type: "evento",
        status: "collecting",
        slots: { date: "20 de agosto", city: "Porto Alegre", time: "20h", people: null, eventType: null },
        updatedAt: "2026-07-09T12:00:00.000Z"
      }
    },
    text: "1 pessoa",
    intent: "desconhecido",
    mode: "AUTO",
    now: "2026-07-09T12:31:00.000Z"
  });

  assert.equal(result.handled, true);
  assert.match(result.reply, /continuar o orcamento anterior|continuar o orçamento anterior/i);
  assert.match(result.reply, /Começar novo atendimento|Comecar novo atendimento/i);
});

test("humano durante activeFlow preserva fluxo para handoff", () => {
  const flow = {
    type: "evento",
    status: "collecting",
    slots: { date: "01/08/26", city: "Porto Alegre", time: null, people: null, eventType: null }
  };
  const result = resolveConversationFlow({
    conversation: { activeFlow: flow },
    text: "humano",
    intent: "humano",
    mode: "AGUARDANDO_HUMANO"
  });

  assert.equal(result.handled, false);
  assert.equal(result.activeFlow.type, flow.type);
  assert.equal(result.activeFlow.status, flow.status);
  assert.deepEqual(result.activeFlow.slots, flow.slots);
});

test("WhatsApp evento nao repete pergunta completa depois dos dados", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-flow-event-"));
  const filePath = join(dir, "conversas.json");
  const service = new WhatsAppConversationService({
    filePath,
    now: () => new Date("2026-07-09T12:00:00.000Z")
  });

  try {
    const start = await service.recordIncoming({ from: "5551999999999", text: "evento", messageId: "flow-event-1" });
    assert.equal(start.conversa.activeFlow.type, "evento");
    assert.match(start.respostaSugerida, /data/);

    const details = await service.recordIncoming({
      from: "5551999999999",
      text: "01/08/26, Porto Alegre, 20h, 1000",
      messageId: "flow-event-2"
    });

    assert.equal(details.conversa.activeFlow.status, "ready");
    assert.equal(details.conversa.nextAction, "create_event_lead");
    assert.equal(details.conversa.activeFlow.slots.date, "01/08/26");
    assert.equal(details.conversa.activeFlow.slots.city, "Porto Alegre");
    assert.equal(details.conversa.activeFlow.slots.time, "20h");
    assert.equal(details.conversa.activeFlow.slots.people, "1000");
    assert.doesNotMatch(details.respostaSugerida, /me passa data, cidade, horario aproximado e quantidade de pessoas/i);
    assert.match(details.respostaSugerida, /Ja tenho as informacoes principais|informacoes principais/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reset forte limpa activeFlow, campos legados e drafts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-flow-reset-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551999999999",
      nome: "Cliente",
      telefone: "5551999999999",
      activeFlow: { type: "evento", status: "collecting", slots: { people: "2026" }, updatedAt: "2026-07-09T12:00:00.000Z" },
      activeStep: "askDate",
      flowData: { people: "2026" },
      flowUpdatedAt: "2026-07-09T12:00:00.000Z",
      draftId: "draft-1",
      draft: { id: "draft-1" },
      orcamentoDraft: { id: "orc-1" },
      mensagens: []
    }]
  }), "utf8");
  const service = new WhatsAppConversationService({
    filePath,
    now: () => new Date("2026-07-09T12:05:00.000Z")
  });

  try {
    const result = await service.recordIncoming({ from: "5551999999999", text: "reset", messageId: "reset-1" });

    assert.equal(result.respostaSugerida, "Atendimento reiniciado. Me manda um oi para começarmos de novo.");
    assert.equal(result.conversa.activeFlow, null);
    assert.equal(result.conversa.activeStep, "");
    assert.equal(result.conversa.flowData, null);
    assert.equal(result.conversa.flowUpdatedAt, "");
    assert.equal(result.conversa.draftId, "");
    assert.equal(result.conversa.draft, null);
    assert.equal(result.conversa.orcamentoDraft, null);

    const saved = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(saved.conversas[0].activeFlow, null);
    assert.equal(saved.conversas[0].flowData, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fluxo vencido grava decisao pendente ao receber oi", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-flow-expired-ask-"));
  const filePath = join(dir, "conversas.json");
  await writeExpiredEventConversation(filePath);
  const service = new WhatsAppConversationService({
    filePath,
    now: () => new Date("2026-07-09T12:31:00.000Z")
  });

  try {
    const result = await service.recordIncoming({ from: "5551999999999", text: "oi", messageId: "expired-ask-1" });

    assert.match(result.respostaSugerida, /Continuar/);
    assert.equal(result.conversa.activeStep, "confirmExpiredFlow");
    assert.equal(result.conversa.flowData.pendingExpiredFlowDecision, true);
    assert.equal(result.conversa.flowData.expiredFlowSnapshot.slots.people, null);
    assert.doesNotMatch(result.respostaSugerida, /Pessoas: 2026/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("opcao 2 em decisao pendente limpa fluxo e nao repete menu de TTL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-flow-expired-new-"));
  const filePath = join(dir, "conversas.json");
  await writeExpiredEventConversation(filePath, { pending: true });
  const service = new WhatsAppConversationService({
    filePath,
    now: () => new Date("2026-07-09T12:32:00.000Z")
  });

  try {
    const result = await service.recordIncoming({ from: "5551999999999", text: "2", messageId: "expired-new-1" });

    assert.equal(result.conversa.activeFlow, null);
    assert.equal(result.conversa.activeStep, "");
    assert.equal(result.conversa.flowData, null);
    assert.equal(result.conversa.flowUpdatedAt, "");
    assert.equal(result.conversa.eventQuote, null);
    assert.equal(result.conversa.draftId, "");
    assert.doesNotMatch(result.respostaSugerida, /Continuar orcamento anterior/);
    assert.match(result.respostaSugerida, /Atendimento reiniciado/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("opcao 1 em decisao pendente retoma fluxo e atualiza horario", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-flow-expired-continue-"));
  const filePath = join(dir, "conversas.json");
  await writeExpiredEventConversation(filePath, { pending: true });
  const service = new WhatsAppConversationService({
    filePath,
    now: () => new Date("2026-07-09T12:33:00.000Z")
  });

  try {
    const result = await service.recordIncoming({ from: "5551999999999", text: "1", messageId: "expired-continue-1" });

    assert.equal(result.conversa.activeStep, "");
    assert.equal(result.conversa.flowData, null);
    assert.equal(result.conversa.activeFlow.updatedAt, "2026-07-09T12:33:00.000Z");
    assert.equal(result.conversa.flowUpdatedAt, "2026-07-09T12:33:00.000Z");
    assert.doesNotMatch(result.respostaSugerida, /Continuar orcamento anterior/);
    assert.match(result.respostaSugerida, /quantidade de pessoas/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("opcao 3 em decisao pendente encaminha humano sem repetir TTL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-flow-expired-human-"));
  const filePath = join(dir, "conversas.json");
  await writeExpiredEventConversation(filePath, { pending: true });
  const service = new WhatsAppConversationService({
    filePath,
    now: () => new Date("2026-07-09T12:34:00.000Z")
  });

  try {
    const result = await service.recordIncoming({ from: "5551999999999", text: "3", messageId: "expired-human-1" });

    assert.equal(result.conversa.activeFlow, null);
    assert.equal(result.conversa.activeStep, "");
    assert.equal(result.conversa.flowData, null);
    assert.equal(result.conversa.mode, "AGUARDANDO_HUMANO");
    assert.equal(result.conversa.atendimentoEstado, "HUMANO");
    assert.doesNotMatch(result.respostaSugerida, /Continuar orcamento anterior/);
    assert.match(result.respostaSugerida, /atendimento humano/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function writeExpiredEventConversation(filePath, { pending = false } = {}) {
  const activeFlow = {
    type: "evento",
    status: "collecting",
    slots: { date: "20 de agosto", city: "Porto Alegre", time: "20h", people: "2026", eventType: null },
    updatedAt: "2026-07-09T12:00:00.000Z"
  };
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551999999999",
      nome: "Cliente",
      telefone: "5551999999999",
      activeFlow,
      activeStep: pending ? "confirmExpiredFlow" : "",
      flowData: pending ? { pendingExpiredFlowDecision: true, expiredFlowSnapshot: activeFlow } : null,
      flowUpdatedAt: "2026-07-09T12:00:00.000Z",
      eventQuote: { status: "collecting", slots: activeFlow.slots },
      draftId: "draft-antigo",
      draft: { id: "draft-antigo" },
      orcamentoDraft: { id: "orc-antigo" },
      mensagens: [],
      createdAt: "2026-07-09T11:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z"
    }]
  }), "utf8");
}
