import test from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSATION_STATES,
  normalizeConversationState,
  resolveIncomingConversationState,
  resolveOutgoingConversationState
} from "../src/conversationStateEngine.js";

test("Conversation State Engine controla handoff humano, cancelamento e retomada", () => {
  const human = resolveIncomingConversationState({
    conversation: {},
    text: "humano",
    intent: "humano",
    aiDecision: { allowedAction: "HANDOFF_HUMAN" }
  });
  assert.equal(human.state, CONVERSATION_STATES.AGUARDANDO_HUMANO);
  assert.equal(human.atendimentoEstado, "HUMANO");
  assert.equal(human.status, "aguardando_humano");

  const cancelled = resolveIncomingConversationState({
    conversation: { conversationState: human.state, atendimentoEstado: "HUMANO" },
    text: "cancelar",
    intent: "humano",
    aiDecision: { allowedAction: "NO_ACTION" }
  });
  assert.equal(cancelled.state, CONVERSATION_STATES.NORMAL);
  assert.equal(cancelled.atendimentoEstado, "");
  assert.equal(cancelled.status, "aguardando_equipe");

  const reopened = resolveIncomingConversationState({
    conversation: { conversationState: cancelled.state, status: "resolvido" },
    text: "oi",
    intent: "saudacao",
    aiDecision: { allowedAction: "REPLY" }
  });
  assert.equal(reopened.state, CONVERSATION_STATES.NORMAL);
  assert.equal(reopened.atendimentoEstado, "");
});

test("Conversation State Engine diferencia humano assumido de pedido iniciado", () => {
  const manual = resolveOutgoingConversationState({
    conversationState: CONVERSATION_STATES.AGUARDANDO_HUMANO,
    atendimentoEstado: "HUMANO"
  }, { manual: true, sent: true });
  assert.equal(manual.state, CONVERSATION_STATES.HUMANO_ASSUMIU);
  assert.equal(manual.atendimentoEstado, "HUMANO");

  const order = resolveIncomingConversationState({
    conversation: {},
    text: "quero pedir",
    intent: "pedido",
    orderState: "COMANDA_EM_ANDAMENTO",
    aiDecision: { allowedAction: "CREATE_ORDER_DRAFT" }
  });
  assert.equal(order.state, CONVERSATION_STATES.PEDIDO_INICIADO);
  assert.equal(order.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
});

test("Conversation State Engine reconhece estados legados sem quebrar compatibilidade", () => {
  assert.equal(normalizeConversationState({ atendimentoEstado: "HUMANO" }), CONVERSATION_STATES.AGUARDANDO_HUMANO);
  assert.equal(normalizeConversationState({ humanHandoff: { status: "em_atendimento" } }), CONVERSATION_STATES.HUMANO_ASSUMIU);
  assert.equal(normalizeConversationState({ atendimentoEstado: "COMANDA_EM_ANDAMENTO" }), CONVERSATION_STATES.PEDIDO_INICIADO);
});
