import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSambahAutoReply,
  buildSambahEventMessage,
  buildSambahFinanceMessage,
  buildSambahGranjaMessage,
  buildSambahHumanSupportMessage,
  buildSambahInitialMessage,
  buildSambahMenuMessage,
  buildSambahOrderMessage,
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
