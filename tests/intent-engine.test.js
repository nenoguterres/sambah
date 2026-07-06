import test from "node:test";
import assert from "node:assert/strict";
import { buildSambahAiAudit, classifySambahIntent } from "../src/intentEngine.js";

test("AI Core classifica pedido em IDLE sem criar pedido", () => {
  const result = classifySambahIntent({ message: "quero pedir", conversationState: "IDLE" });
  assert.equal(result.intent, "pedido");
  assert.equal(result.allowedAction, "ASK_NAME");
  assert.equal(result.state, "IDLE");
  assert.equal(result.replyKey, "ask_name");
  assert.notEqual(result.allowedAction, "CREATE_PRECOMANDA");
});

test("AI Core reenvia Mesa em AGUARDANDO_PEDIDO_MESA para item ou delivery", () => {
  for (const message of ["farofa", "delivery"]) {
    const result = classifySambahIntent({ message, conversationState: "AGUARDANDO_PEDIDO_MESA" });
    assert.equal(result.allowedAction, "SEND_MESA_LINK");
    assert.equal(result.replyKey, "send_mesa_link");
    assert.doesNotMatch(result.reason, /criar pedido|pre.?comanda|preco|preço/i);
  }
});

test("AI Core nao mostra menu institucional em fluxo Mesa ativo", () => {
  const result = classifySambahIntent({ message: "nao entendi", conversationState: "AGUARDANDO_PEDIDO_MESA" });
  assert.equal(result.allowedAction, "SEND_MESA_LINK");
  assert.equal(result.replyKey, "send_mesa_link");
  assert.notEqual(result.replyKey, "initial_menu");
});

test("AI Core pede pagamento quando pedido Mesa foi recebido", () => {
  const result = classifySambahIntent({ message: "ok", conversationState: "PEDIDO_MESA_RECEBIDO", mesaOrderId: "mesa-1" });
  assert.equal(result.allowedAction, "ASK_PAYMENT");
  assert.equal(result.replyKey, "ask_payment");
});

test("AI Core decide pagamento controlado", () => {
  const pix = classifySambahIntent({ message: "pix", conversationState: "AGUARDANDO_FORMA_PAGAMENTO" });
  assert.equal(pix.intent, "pagamento_pix");
  assert.equal(pix.allowedAction, "SEND_PAYMENT_LINK");

  const dinheiro = classifySambahIntent({ message: "dinheiro", conversationState: "AGUARDANDO_FORMA_PAGAMENTO" });
  assert.equal(dinheiro.intent, "pagamento_dinheiro");
  assert.equal(dinheiro.allowedAction, "MARK_A_COBRAR");

  const cartao = classifySambahIntent({ message: "cartao", conversationState: "AGUARDANDO_FORMA_PAGAMENTO" });
  assert.equal(cartao.intent, "pagamento_cartao");
  assert.equal(cartao.allowedAction, "MARK_A_COBRAR");
});

test("AI Core nao responde automaticamente em HUMANO", () => {
  const result = classifySambahIntent({ message: "qualquer coisa", conversationState: { status: "humano" } });
  assert.equal(result.intent, "humano");
  assert.equal(result.allowedAction, "NO_ACTION");
  assert.equal(result.replyKey, "no_auto_reply_human");
});

test("AI Core nunca retorna acao proibida nem inventa item/cardapio/preco", () => {
  const forbidden = new Set(["CREATE_ORDER", "CREATE_PRECOMANDA", "CREATE_MESA_ORDER", "CONFIRM_PAYMENT", "CHANGE_STOCK", "SET_DISCOUNT"]);
  const samples = [
    classifySambahIntent({ message: "farofa", conversationState: "AGUARDANDO_PEDIDO_MESA" }),
    classifySambahIntent({ message: "quanto custa o xis", conversationState: "IDLE" }),
    classifySambahIntent({ message: "me da desconto", conversationState: "IDLE" })
  ];
  for (const result of samples) {
    assert.equal(forbidden.has(result.allowedAction), false);
    assert.doesNotMatch(result.reason, /inventar|preco confirmado|desconto aplicado|estoque alterado/i);
  }
});

test("AI Core gera trilha de auditoria estruturada", () => {
  const input = { message: "quero pedir", conversationState: "IDLE" };
  const decision = classifySambahIntent(input);
  const audit = buildSambahAiAudit(input, decision);
  assert.equal(audit.intent, "pedido");
  assert.equal(audit.allowedAction, "ASK_NAME");
  assert.equal(audit.previousState, "IDLE");
  assert.equal(audit.nextState, "AGUARDANDO_NOME");
  assert.match(audit.messageReceived, /quero pedir/);
});
