import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

test("evento inicia fluxo guiado", async () => {
  const harness = await createHarness();
  try {
    const result = await harness.incoming("quero orcamento para evento");
    assert.equal(result.conversa.activeFlow, "event");
    assert.equal(result.conversa.activeStep, "askEventType");
    assert.match(result.respostaSugerida, /Que tipo de evento/);
  } finally {
    await harness.cleanup();
  }
});

test("cidade parcial nao reinicia fluxo de evento", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "askCity",
    flowData: { type: "Aniversario" }
  });
  try {
    const result = await harness.incoming("porto alegre");
    assert.equal(result.conversa.activeStep, "askDate");
    assert.equal(result.conversa.flowData.type, "Aniversario");
    assert.equal(result.conversa.flowData.city, "Porto Alegre");
    assert.doesNotMatch(result.respostaSugerida, /data, cidade, horario/i);
  } finally {
    await harness.cleanup();
  }
});

test("data com ano nao vira quantidade de pessoas quando etapa pede data", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "askDate",
    flowData: { type: "Aniversario", city: "Porto Alegre", people: 1 }
  });
  try {
    const result = await harness.incoming("20 de agosto de 2026");
    assert.equal(result.conversa.activeStep, "askTime");
    assert.equal(result.conversa.flowData.date, "20 de agosto de 2026");
    assert.equal(result.conversa.flowData.people, 1);
  } finally {
    await harness.cleanup();
  }
});

test("cidade e pessoas na mesma mensagem preenchem os dois campos", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "askCity",
    flowData: { type: "Aniversario" }
  });
  try {
    const result = await harness.incoming("porto alegre, 1 pessoa");
    assert.equal(result.conversa.activeStep, "askDate");
    assert.equal(result.conversa.flowData.city, "Porto Alegre");
    assert.equal(result.conversa.flowData.people, 1);
  } finally {
    await harness.cleanup();
  }
});

test("data e horario em askDate salva somente data", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "askDate",
    flowData: { type: "Aniversario", city: "Porto Alegre" }
  });
  try {
    const result = await harness.incoming("20 de agosto, 20h");
    assert.equal(result.conversa.activeStep, "askTime");
    assert.equal(result.conversa.flowData.date, "20 de agosto");
    assert.equal(result.conversa.flowData.time, undefined);
  } finally {
    await harness.cleanup();
  }
});

test("oi dentro de activeFlow oferece escolha sem avancar fluxo cegamente", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "askDate",
    flowData: { type: "Aniversario", city: "Porto Alegre", people: 1 }
  });
  try {
    const result = await harness.incoming("oi");
    assert.equal(result.conversa.activeFlow, "event");
    assert.equal(result.conversa.activeStep, "askDate");
    assert.deepEqual(result.conversa.flowData, { type: "Aniversario", city: "Porto Alegre", people: 1 });
    assert.match(result.respostaSugerida, /Tu quer continuar o orçamento em andamento ou voltar ao início/);
    assert.match(result.respostaSugerida, /Continuar orçamento/);
    assert.match(result.respostaSugerida, /Voltar ao início/);
    assert.match(result.respostaSugerida, /Atendimento humano/);
  } finally {
    await harness.cleanup();
  }
});

test("menu dentro de activeFlow limpa fluxo e mostra menu principal", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "askDate",
    flowData: { type: "Aniversario", city: "Porto Alegre", people: 1 }
  });
  try {
    const result = await harness.incoming("menu");
    assert.equal(result.conversa.activeFlow, "");
    assert.equal(result.conversa.activeStep, "");
    assert.deepEqual(result.conversa.flowData, {});
    assert.match(result.respostaSugerida, /Fazer pedido/);
    assert.match(result.respostaSugerida, /Orçamento para evento/);
  } finally {
    await harness.cleanup();
  }
});

test("humano dentro de activeFlow limpa fluxo e encaminha atendimento", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "askDate",
    flowData: { type: "Aniversario", city: "Porto Alegre", people: 1 }
  });
  try {
    const result = await harness.incoming("humano");
    assert.equal(result.conversa.activeFlow, "");
    assert.equal(result.conversa.activeStep, "");
    assert.deepEqual(result.conversa.flowData, {});
    assert.equal(result.conversa.status, "humano");
    assert.match(result.respostaSugerida, /fila da nossa equipe/);
  } finally {
    await harness.cleanup();
  }
});

test("cidade e pessoas seguidas de data com ano mantem pessoas e pede somente horario", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "askCity",
    flowData: { type: "Aniversario" }
  });
  try {
    const city = await harness.incoming("porto alegre, 1 pessoa");
    assert.equal(city.conversa.activeStep, "askDate");
    assert.equal(city.conversa.flowData.city, "Porto Alegre");
    assert.equal(city.conversa.flowData.people, 1);

    const date = await harness.incoming("20 de agosto de 2026");
    assert.equal(date.conversa.activeStep, "askTime");
    assert.equal(date.conversa.flowData.date, "20 de agosto de 2026");
    assert.equal(date.conversa.flowData.people, 1);
    assert.match(date.respostaSugerida, /Agora me passa o horario aproximado/);
    assert.doesNotMatch(date.respostaSugerida, /quantidade de pessoas/);
  } finally {
    await harness.cleanup();
  }
});

test("resumo final aparece quando todos campos existem", async () => {
  const harness = await createHarness();
  try {
    const result = await harness.incoming("aniversario em porto alegre, 20 de agosto de 2026, 20h, 100 pessoas");
    assert.equal(result.conversa.activeStep, "confirmSummary");
    assert.match(result.respostaSugerida, /Show, anotei:/);
    assert.match(result.respostaSugerida, /Tipo: Aniversario/);
    assert.match(result.respostaSugerida, /Cidade: Porto Alegre/);
    assert.match(result.respostaSugerida, /Data: 20 de agosto de 2026/);
    assert.match(result.respostaSugerida, /Horário: 20h/);
    assert.match(result.respostaSugerida, /Pessoas: 100/);
    assert.match(result.respostaSugerida, /Sim, chamar atendimento/);
    assert.match(result.respostaSugerida, /Alterar dados/);
    assert.match(result.respostaSugerida, /Cancelar/);
  } finally {
    await harness.cleanup();
  }
});

test("botao cancelar limpa activeFlow", async () => {
  const harness = await createHarness({
    activeFlow: "event",
    activeStep: "confirmSummary",
    flowData: {
      type: "Aniversario",
      city: "Porto Alegre",
      date: "20 De Agosto De 2026",
      time: "20h",
      people: 100
    }
  });
  try {
    const result = await harness.incoming("Cancelar");
    assert.equal(result.conversa.activeFlow, "");
    assert.equal(result.conversa.activeStep, "");
    assert.deepEqual(result.conversa.flowData, {});
  } finally {
    await harness.cleanup();
  }
});

async function createHarness(conversationPatch = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambha-event-flow-"));
  const filePath = join(dir, "conversas.json");
  const phone = "5551999999999";
  const baseConversation = {
    id: `wa_${phone}`,
    nome: "Cliente Evento",
    telefone: phone,
    status: "aguardando_equipe",
    mensagens: [],
    createdAt: "2026-07-09T12:00:00.000Z",
    updatedAt: "2026-07-09T12:00:00.000Z",
    ...conversationPatch
  };
  await writeFile(filePath, JSON.stringify({ conversas: [baseConversation] }), "utf8");
  const service = new WhatsAppConversationService({
    filePath,
    now: () => new Date("2026-07-09T12:01:00.000Z")
  });
  return {
    incoming: (message) => service.recordIncoming({ from: phone, message }),
    read: async () => JSON.parse(await readFile(filePath, "utf8")),
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}
