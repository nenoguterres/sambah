import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
