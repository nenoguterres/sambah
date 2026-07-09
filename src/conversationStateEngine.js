export const CONVERSATION_STATES = Object.freeze({
  NORMAL: "NORMAL",
  AGUARDANDO_HUMANO: "AGUARDANDO_HUMANO",
  HUMANO_ASSUMIU: "HUMANO_ASSUMIU",
  PEDIDO_INICIADO: "PEDIDO_INICIADO",
  FINALIZADO: "FINALIZADO"
});

const KNOWN_STATES = new Set(Object.values(CONVERSATION_STATES));
const HUMAN_STATES = new Set([
  CONVERSATION_STATES.AGUARDANDO_HUMANO,
  CONVERSATION_STATES.HUMANO_ASSUMIU
]);
const ORDER_STATES = new Set([
  "AGUARDANDO_NOME",
  "COMANDA_EM_ANDAMENTO",
  "COMANDA_PRONTA",
  "ENVIADO_PARA_MESA_COMANDA",
  "AGUARDANDO_PEDIDO_MESA",
  "PEDIDO_MESA_RECEBIDO",
  "AGUARDANDO_FORMA_PAGAMENTO",
  "COBRANCA_ENVIADA",
  "PAGAMENTO_CONFIRMADO",
  "A_COBRAR"
]);

export function normalizeConversationState(conversation = {}) {
  const explicit = String(conversation.conversationState || "").toUpperCase();
  if (KNOWN_STATES.has(explicit)) return explicit;

  const legacyState = String(conversation.atendimentoEstado || conversation.estadoAtendimento || "").toUpperCase();
  const status = String(conversation.status || "").toLowerCase();
  const humanStatus = String(conversation.humanHandoff?.status || "").toLowerCase();

  if (humanStatus === "em_atendimento") return CONVERSATION_STATES.HUMANO_ASSUMIU;
  if (legacyState === "HUMANO" || status === "humano" || status === "aguardando_humano") {
    return CONVERSATION_STATES.AGUARDANDO_HUMANO;
  }
  if (ORDER_STATES.has(legacyState)) return CONVERSATION_STATES.PEDIDO_INICIADO;
  if (legacyState === "CANCELADO" || status === "resolvido") return CONVERSATION_STATES.FINALIZADO;
  return CONVERSATION_STATES.NORMAL;
}

export function resolveIncomingConversationState({
  conversation = {},
  text = "",
  intent = "",
  aiDecision = {},
  orderState = ""
} = {}) {
  const current = normalizeConversationState(conversation);
  const normalizedText = normalizeStateText(text);
  const isHuman = isHumanState(current);
  const cancel = isCancelText(normalizedText);
  const humanRequested = intent === "humano"
    || intent === "reclamacao"
    || aiDecision?.allowedAction === "HANDOFF_HUMAN";
  const orderStarted = isActiveOrderState(orderState)
    || (intent === "pedido" && !isReservedNonOrderText(normalizedText));

  if (cancel && isHuman) {
    return buildDecision({
      state: CONVERSATION_STATES.NORMAL,
      status: "aguardando_equipe",
      atendimentoEstado: "",
      auditReason: "human_handoff_cancelled_to_normal",
      shouldBlockAutomation: true,
      humanHandoffStatus: "cancelado"
    });
  }

  if (cancel && current === CONVERSATION_STATES.PEDIDO_INICIADO) {
    return buildDecision({
      state: CONVERSATION_STATES.FINALIZADO,
      status: "resolvido",
      atendimentoEstado: "CANCELADO",
      auditReason: "order_flow_cancelled",
      shouldBlockAutomation: true
    });
  }

  if (current === CONVERSATION_STATES.FINALIZADO && isGreetingText(normalizedText)) {
    return buildDecision({
      state: CONVERSATION_STATES.NORMAL,
      status: "aguardando_equipe",
      atendimentoEstado: "",
      auditReason: "finalized_conversation_reopened"
    });
  }

  if (humanRequested) {
    return buildDecision({
      state: CONVERSATION_STATES.AGUARDANDO_HUMANO,
      status: "aguardando_humano",
      atendimentoEstado: "HUMANO",
      auditReason: "human_requested",
      shouldBlockAutomation: true,
      shouldUseHumanWait: true,
      humanHandoffStatus: "pendente"
    });
  }

  if (current === CONVERSATION_STATES.HUMANO_ASSUMIU) {
    return buildDecision({
      state: CONVERSATION_STATES.HUMANO_ASSUMIU,
      status: "aguardando_humano",
      atendimentoEstado: "HUMANO",
      auditReason: "human_already_assumed",
      shouldBlockAutomation: true,
      humanHandoffStatus: "em_atendimento"
    });
  }

  if (current === CONVERSATION_STATES.AGUARDANDO_HUMANO) {
    return buildDecision({
      state: CONVERSATION_STATES.AGUARDANDO_HUMANO,
      status: "aguardando_humano",
      atendimentoEstado: "HUMANO",
      auditReason: "waiting_human",
      shouldBlockAutomation: true,
      shouldUseHumanWait: !conversation.humanHandoff?.waitMessageSentAt,
      humanHandoffStatus: "pendente"
    });
  }

  if (orderStarted) {
    return buildDecision({
      state: CONVERSATION_STATES.PEDIDO_INICIADO,
      status: "aguardando_equipe",
      atendimentoEstado: orderState || conversation.atendimentoEstado || "",
      auditReason: "order_flow_active"
    });
  }

  return buildDecision({
    state: CONVERSATION_STATES.NORMAL,
    status: "",
    atendimentoEstado: "",
    auditReason: "normal_flow"
  });
}

export function resolveOutgoingConversationState(conversation = {}, { manual = false, sent = false } = {}) {
  const current = normalizeConversationState(conversation);
  if (manual && sent && isHumanState(current)) {
    return {
      state: CONVERSATION_STATES.HUMANO_ASSUMIU,
      atendimentoEstado: "HUMANO",
      status: "aguardando_cliente",
      auditReason: "human_operator_replied"
    };
  }
  return {
    state: current,
    atendimentoEstado: conversation.atendimentoEstado || "",
    status: conversation.status || "",
    auditReason: "outgoing_state_preserved"
  };
}

export function stateForManualMark(status = "", conversation = {}) {
  if (status === "humano") {
    return {
      state: CONVERSATION_STATES.AGUARDANDO_HUMANO,
      atendimentoEstado: "HUMANO",
      status: "aguardando_humano"
    };
  }
  if (status === "resolvido") {
    return {
      state: CONVERSATION_STATES.FINALIZADO,
      atendimentoEstado: "",
      status: "resolvido"
    };
  }
  return {
    state: normalizeConversationState(conversation),
    atendimentoEstado: conversation.atendimentoEstado || "",
    status: conversation.status || ""
  };
}

export function isHumanState(state = "") {
  return HUMAN_STATES.has(String(state || "").toUpperCase());
}

export function isCancelText(text = "") {
  const normalized = normalizeStateText(text);
  return ["cancelar", "cancela", "cancelado", "desistir", "deixa pra depois"].some((term) => normalized.includes(term));
}

export function normalizeStateText(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildDecision({
  state,
  status = "",
  atendimentoEstado = "",
  auditReason = "",
  shouldBlockAutomation = false,
  shouldUseHumanWait = false,
  humanHandoffStatus = ""
}) {
  return {
    state,
    conversationState: state,
    status,
    atendimentoEstado,
    auditReason,
    shouldBlockAutomation,
    shouldUseHumanWait,
    humanHandoffStatus,
    requiresHuman: isHumanState(state)
  };
}

function isActiveOrderState(state = "") {
  const value = String(state || "").toUpperCase();
  return ORDER_STATES.has(value) || value === "CANCELADO";
}

function isGreetingText(text = "") {
  return ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "buenas"].includes(normalizeStateText(text));
}

function isReservedNonOrderText(text = "") {
  const normalized = normalizeStateText(text);
  if (!normalized) return true;
  return [
    "oi",
    "ola",
    "olá",
    "cardapio",
    "cardápio",
    "humano",
    "atendente",
    "cancelar",
    "cancela",
    "horario",
    "horário",
    "localizacao",
    "localização",
    "pagamento",
    "ajuda"
  ].includes(normalized);
}
