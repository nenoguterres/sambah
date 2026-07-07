import test from "node:test";
import assert from "node:assert/strict";
import { buildSambahAiAudit, classifySambahIntent } from "../src/intentEngine.js";

test("AI Core classifica pedido em IDLE criando comanda controlada", () => {
  const result = classifySambahIntent({ message: "quero pedir", conversationState: "IDLE" });
  assert.equal(result.intent, "pedido");
  assert.equal(result.allowedAction, "CREATE_ORDER_DRAFT");
  assert.equal(result.state, "IDLE");
  assert.equal(result.replyKey, "start_order_draft");
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
  assert.equal(audit.allowedAction, "CREATE_ORDER_DRAFT");
  assert.equal(audit.previousState, "IDLE");
  assert.equal(audit.nextState, "COMANDA_EM_ANDAMENTO");
  assert.match(audit.messageReceived, /quero pedir/);
});

test("Atendimento Natural Controlado responde saudacao sem menu longo", () => {
  for (const message of ["oi", "bom dia"]) {
    const result = classifySambahIntent({ message, conversationState: "IDLE" });
    assert.equal(result.intent, "saudacao");
    assert.equal(result.allowedAction, "ANSWER_INFO");
    assert.equal(result.responseStyle, "natural_short");
    assert.match(result.safeReply, /SamBah/);
    assert.doesNotMatch(result.safeReply, /1 - Fazer pedido|6 - Falar com atendente/);
  }
});

test("Atendimento Natural Controlado cobre frases reais sem acao operacional proibida", () => {
  const samples = [
    ["tem cardapio?", "cardapio", "ANSWER_INFO"],
    ["quanto ta o xis?", "preco", "ANSWER_INFO"],
    ["faz entrega?", "pedido", "CREATE_ORDER_DRAFT"],
    ["posso retirar ai?", "pedido", "CREATE_ORDER_DRAFT"],
    ["quero orcamento para evento", "evento", "ANSWER_INFO"],
    ["voces atendem empresa?", "evento", "ANSWER_INFO"],
    ["onde fica?", "localizacao", "ANSWER_INFO"],
    ["que horas abre?", "horario", "ANSWER_INFO"],
    ["manda o link", "unknown", "ANSWER_INFO"],
    ["asdf ???", "unknown", "ANSWER_INFO"]
  ];
  for (const [message, intent, allowedAction] of samples) {
    const result = classifySambahIntent({ message, conversationState: "IDLE" });
    assert.equal(result.intent, intent, message);
    assert.equal(result.allowedAction, allowedAction, message);
    assert.equal(typeof result.safeReply, "string");
    assert.notEqual(result.safeReply, "");
  }
});

test("Atendimento Natural Controlado nao inventa preco nem confirma pagamento", () => {
  const price = classifySambahIntent({ message: "quanto custa o xis?", conversationState: "IDLE" });
  assert.equal(price.intent, "preco");
  assert.equal(price.allowedAction, "ANSWER_INFO");
  assert.match(price.safeReply, /nao invento preco|valor errado/i);

  const paid = classifySambahIntent({ message: "paguei no pix", conversationState: "AGUARDANDO_FORMA_PAGAMENTO" });
  assert.equal(paid.intent, "pagamento");
  assert.equal(paid.allowedAction, "HANDOFF_HUMAN");
  assert.equal(paid.requiresHuman, true);
  assert.match(paid.safeReply, /nao confirmo pagamento/i);
});

test("Atendimento Natural Controlado preserva Mesa e humano", () => {
  const mesa = classifySambahIntent({ message: "ja fiz o pedido", conversationState: "AGUARDANDO_PEDIDO_MESA" });
  assert.equal(mesa.allowedAction, "SEND_MESA_LINK");
  assert.notEqual(mesa.replyKey, "initial_menu");
  assert.match(mesa.safeReply, /Comanda Mesa/);

  const human = classifySambahIntent({ message: "quero falar com alguem", conversationState: "IDLE" });
  assert.equal(human.allowedAction, "HANDOFF_HUMAN");
  assert.equal(human.requiresHuman, true);
});

test("AI Core nao transforma saudacao em item durante comanda ativa", () => {
  for (const message of ["Oi", "bom dia", "1"]) {
    const result = classifySambahIntent({ message, conversationState: "COMANDA_EM_ANDAMENTO" });
    assert.equal(result.allowedAction, "ANSWER_INFO", message);
    assert.equal(result.replyKey, "ask_order_item", message);
    assert.doesNotMatch(result.safeReply, /Anotei esse item/i);
  }
});
