import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSambahAutoReply,
  buildSambahEventMessage,
  buildSambahFallbackMessage,
  buildSambahFinanceMessage,
  buildSambahGranjaMessage,
  buildSambahHumanSupportMessage,
  buildSambahInitialMessage,
  buildSambahMenuMessage,
  buildSambahOrderItemsReceivedMessage,
  buildSambahOrderDeliveryReceivedMessage,
  buildSambahOrderMessage,
  buildSambahOrderNameReceivedMessage,
  detectSambahHumanSupportIntent
} from "../src/sambahPersonality.js";

test("personalidade SamBah contem abertura oficial e opcao de atendimento humano", () => {
  const opening = buildSambahInitialMessage();
  assert.match(opening, /Buenas! Aqui é o SamBah, atendimento do Portal Insano\./);
  assert.match(opening, /Me diz o que tu precisa/);
  assert.match(opening, /1 - Fazer pedido/);
  assert.match(opening, /2 - Ver cardápio/);
  assert.match(opening, /6 - Falar com atendente/);
  assert.doesNotMatch(opening, /Que bom te ver por aqui/);
  assert.doesNotMatch(opening, /1️⃣/);
});

test("personalidade SamBah descreve fluxo humano sem exigir repeticao", () => {
  const humanMessage = buildSambahHumanSupportMessage();
  assert.match(humanMessage, /tu não precisa repetir tudo de novo/);
});

test("personalidade SamBah detecta pedido de atendimento humano", () => {
  assert.equal(detectSambahHumanSupportIntent("quero falar com alguém"), true);
  assert.equal(detectSambahHumanSupportIntent("6"), true);
  assert.equal(buildSambahAutoReply("preciso de suporte"), buildSambahHumanSupportMessage());
  assert.equal(buildSambahAutoReply("oi"), buildSambahInitialMessage());
  assert.equal(buildSambahAutoReply("Neno"), buildSambahFallbackMessage());
});

test("personalidade SamBah responde opcoes do menu sem repetir abertura", () => {
  assert.equal(buildSambahAutoReply("1"), buildSambahOrderMessage());
  assert.equal(buildSambahAutoReply("2"), buildSambahMenuMessage());
  assert.equal(buildSambahAutoReply("3"), buildSambahEventMessage());
  assert.equal(buildSambahAutoReply("4"), buildSambahGranjaMessage());
  assert.equal(buildSambahAutoReply("5"), buildSambahFinanceMessage());
  assert.notEqual(buildSambahAutoReply("1"), buildSambahInitialMessage());
  assert.match(buildSambahAutoReply("quero ver o cardapio"), /cardápio/);
});

test("personalidade SamBah nao confunde menu principal com fluxo da Granja", () => {
  const conversation = {
    mensagens: [
      { direction: "in", text: "Boa noite" },
      { direction: "out", text: buildSambahInitialMessage() },
      { direction: "in", text: "1" }
    ]
  };
  assert.equal(buildSambahAutoReply("1", { conversation }), buildSambahOrderMessage());
});

test("personalidade SamBah reinicia menu quando cliente manda saudacao apos fluxo travado", () => {
  const conversation = {
    mensagens: [
      { direction: "in", text: "1" },
      { direction: "out", text: "Certo. Vou seguir pela Granja Águas da Lagoa.\n\nMe diz se tu quer saber sobre ovos, produtos, valores ou entrega." },
      { direction: "in", text: "Ola" }
    ]
  };
  assert.equal(buildSambahAutoReply("Ola", { conversation }), buildSambahInitialMessage());
});

test("personalidade SamBah nao exibe menu principal durante pedido Mesa ativo", () => {
  const conversation = {
    atendimentoEstado: "AGUARDANDO_PEDIDO_MESA",
    mensagens: []
  };
  const reply = buildSambahAutoReply("oi", {
    conversation,
    mesaComandaUrl: "https://mesa.example/pedir"
  });
  assert.equal(reply, "Para montar teu pedido, usa a comanda do Mesa aqui: https://mesa.example/pedir");
  assert.doesNotMatch(reply, /1 - Fazer pedido/);
  assert.doesNotMatch(reply, /6 - Falar com atendente/);
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

test("personalidade SamBah envia cliente para Mesa Comanda apos informar nome", () => {
  const conversation = {
    mensagens: [
      { direction: "out", text: buildSambahOrderMessage() },
      { direction: "in", text: "Kazuko" }
    ],
    atendimentoEstado: "AGUARDANDO_NOME"
  };
  const reply = buildSambahAutoReply("Kazuko", { conversation, mesaComandaUrl: "https://mesa.example/pedir" });
  assert.match(reply, /comanda do Mesa/);
  assert.match(reply, /https:\/\/mesa\.example\/pedir/);
});

test("personalidade SamBah nao interpreta item livre durante pedido Mesa", () => {
  const conversation = {
    mensagens: [
      { direction: "out", text: buildSambahOrderMessage() },
      { direction: "in", text: "Kazuko" },
      { direction: "out", text: buildSambahOrderNameReceivedMessage() },
      { direction: "in", text: "farofa" }
    ],
    atendimentoEstado: "AGUARDANDO_PEDIDO_MESA"
  };
  const reply = buildSambahAutoReply("farofa", { conversation, mesaComandaUrl: "https://mesa.example/pedir" });
  assert.equal(reply, "Para montar teu pedido, usa a comanda do Mesa aqui: https://mesa.example/pedir");
  assert.notEqual(reply, buildSambahOrderMessage());
});

test("personalidade SamBah pergunta pagamento depois que pedido Mesa foi recebido", () => {
  const conversation = { atendimentoEstado: "AGUARDANDO_FORMA_PAGAMENTO", mensagens: [] };
  assert.equal(buildSambahAutoReply("ok", { conversation }), buildSambahOrderDeliveryReceivedMessage());
  assert.match(buildSambahAutoReply("pix", { conversation }), /SamBah Pay/);
  assert.match(buildSambahAutoReply("dinheiro", { conversation }), /A COBRAR/);
});
