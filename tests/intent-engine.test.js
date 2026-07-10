import test from "node:test";
import assert from "node:assert/strict";
import { detectIntent } from "../src/intentEngine.js";

test("Intent Engine detecta pedido com prioridade sobre termos genericos", () => {
  const result = detectIntent("Quero pedir uma pizza");
  assert.equal(result.intent, "pedido");
  assert.equal(result.destination, "mesa");
  assert.ok(result.confidence >= 0.9);
  assert.equal(detectIntent("quero um hamburguer e uma batata").intent, "pedido");
});

test("Intent Engine detecta cardapio sem cair em pedido por causa de quero", () => {
  const result = detectIntent("quero ver o cardápio");
  assert.equal(result.intent, "cardapio");
  assert.equal(result.destination, "mesa");
  assert.ok(result.confidence >= 0.86);
});

test("Intent Engine detecta evento", () => {
  assert.equal(detectIntent("Preciso de orçamento para food truck corporativo").intent, "evento");
  assert.equal(detectIntent("casamento com 120 pessoas").destination, "crm_comercial");
});

test("Intent Engine detecta granja", () => {
  const result = detectIntent("Tem ovos da granja?");
  assert.equal(result.intent, "granja");
  assert.equal(result.destination, "granja_aguas_da_lagoa");
});

test("Intent Engine detecta financeiro", () => {
  const result = detectIntent("posso pagar no pix ou cartão?");
  assert.equal(result.intent, "financeiro");
  assert.equal(result.destination, "sambah_pay");
});

test("Intent Engine detecta humano", () => {
  const result = detectIntent("quero falar com alguém do suporte");
  assert.equal(result.intent, "humano");
  assert.equal(result.destination, "human_support");
});

test("Intent Engine retorna unknown quando nao encontra intencao", () => {
  assert.deepEqual(detectIntent("buenas, tudo certo contigo?"), {
    intent: "unknown",
    confidence: 0,
    destination: "personality"
  });
});
