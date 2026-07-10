import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSambahAutoReply,
  buildSambahContinueMessage,
  buildSambahEventMessage,
  buildSambahFallbackMessage,
  buildSambahFinanceMessage,
  buildSambahGranjaMessage,
  buildSambahHumanSupportMessage,
  buildSambahInitialMessage,
  buildSambahMenuMessage,
  buildSambahOrderItemsReceivedMessage,
  buildSambahOrderMessage,
  buildSambahOrderNameReceivedMessage,
  buildSambahWaitingAttendantMessage,
  detectSambahHumanSupportIntent
} from "../src/sambahPersonality.js";

test("personalidade SamBah contem abertura curta e opcao de atendimento humano", () => {
  const opening = buildSambahInitialMessage();
  assert.match(opening, /Buenas! Aqui é o SamBah, atendimento do Portal Insano\./);
  assert.match(opening, /Me diz o que tu precisa/);
  assert.match(opening, /1 - Fazer pedido/);
  assert.match(opening, /2 - Ver cardápio/);
  assert.match(opening, /6 - Falar com atendente/);
  assert.doesNotMatch(opening, /Que bom te ver por aqui/);
  assert.doesNotMatch(opening, /Prezado usuário|Digite sua solicitação|Informe/);
});

test("personalidade SamBah descreve fluxo humano sem exigir repeticao", () => {
  const humanMessage = buildSambahHumanSupportMessage();
  assert.match(humanMessage, /Sem problema, vivente!/);
  assert.match(humanMessage, /tu não precisa repetir tudo de novo/);
  assert.match(humanMessage, /Continuar com o SamBah/);
  assert.match(humanMessage, /Aguardar um atendente/);
});

test("personalidade SamBah detecta pedido de atendimento humano", () => {
  assert.equal(detectSambahHumanSupportIntent("quero falar com alguém"), true);
  assert.equal(detectSambahHumanSupportIntent("6"), true);
  assert.equal(buildSambahAutoReply("preciso de suporte"), buildSambahHumanSupportMessage());
  assert.equal(buildSambahAutoReply("oi"), buildSambahInitialMessage());
  assert.equal(buildSambahAutoReply("Neno"), buildSambahInitialMessage());
  assert.equal(buildSambahFallbackMessage(), buildSambahInitialMessage());
});

test("personalidade SamBah responde opcoes do menu e proximos passos", () => {
  assert.equal(buildSambahAutoReply("1"), buildSambahOrderMessage());
  assert.equal(buildSambahAutoReply("2"), buildSambahMenuMessage());
  assert.equal(buildSambahAutoReply("3"), buildSambahEventMessage());
  assert.equal(buildSambahAutoReply("4"), buildSambahGranjaMessage());
  assert.equal(buildSambahAutoReply("5"), buildSambahFinanceMessage());
  assert.notEqual(buildSambahAutoReply("1"), buildSambahInitialMessage());
  assert.match(buildSambahAutoReply("quero ver o cardapio"), /cardápio/);
  assert.equal(buildSambahAutoReply("quero continuar com o SamBah"), buildSambahContinueMessage());
  assert.equal(buildSambahAutoReply("prefiro aguardar um atendente"), buildSambahWaitingAttendantMessage());
  assert.equal(buildSambahAutoReply("vou esperar um atendente"), buildSambahWaitingAttendantMessage());
  assert.equal(buildSambahAutoReply("assunto aleatorio"), buildSambahInitialMessage());
  assert.match(buildSambahWaitingAttendantMessage(), /Tua conversa ficou na fila da equipe/);
});

test("personalidade SamBah mantem contexto do pedido apos cliente informar nome", () => {
  const conversation = {
    mensagens: [
      { direction: "in", text: "Bom dia" },
      { direction: "out", text: buildSambahInitialMessage() },
      { direction: "in", text: "1" },
      { direction: "out", text: buildSambahOrderMessage() },
      { direction: "in", text: "Kazuko" }
    ]
  };
  assert.equal(buildSambahAutoReply("Kazuko", { conversation }), buildSambahOrderNameReceivedMessage());
  assert.notEqual(buildSambahAutoReply("Kazuko", { conversation }), buildSambahInitialMessage());
});

test("personalidade SamBah avanca pedido apos cliente informar item", () => {
  const conversation = {
    mensagens: [
      { direction: "out", text: buildSambahOrderMessage() },
      { direction: "in", text: "Kazuko" },
      { direction: "out", text: buildSambahOrderNameReceivedMessage() },
      { direction: "in", text: "dois espetinhos e uma coca" }
    ]
  };
  assert.equal(buildSambahAutoReply("dois espetinhos e uma coca", { conversation }), buildSambahOrderItemsReceivedMessage());
});
