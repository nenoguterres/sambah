const ALLOWED_ACTIONS = new Set([
  "SEND_MESA_LINK",
  "ASK_NAME",
  "WAIT_MESA_ORDER",
  "ASK_PAYMENT",
  "SEND_PAYMENT_LINK",
  "MARK_A_COBRAR",
  "HANDOFF_HUMAN",
  "ANSWER_INFO",
  "CANCEL_FLOW",
  "NO_ACTION"
]);

const ORDER_WAITING_STATES = new Set(["ENVIADO_PARA_MESA_COMANDA", "AGUARDANDO_PEDIDO_MESA"]);
const PAYMENT_STATES = new Set(["PEDIDO_MESA_RECEBIDO", "AGUARDANDO_FORMA_PAGAMENTO"]);

export function classifySambahIntent(input = {}) {
  const message = String(input.message || "").trim();
  const normalized = normalizeText(message);
  const state = normalizeConversationState(input.conversationState);
  const detected = detectIntent(normalized, input.previousIntent);
  const decision = decideByState({ detected, normalized, state, input });
  return enforceSafeDecision({
    intent: decision.intent,
    confidence: decision.confidence,
    state,
    allowedAction: decision.allowedAction,
    replyKey: decision.replyKey,
    reason: decision.reason
  });
}

export function buildSambahAiAudit(input = {}, decision = classifySambahIntent(input)) {
  const previousState = normalizeConversationState(input.conversationState);
  return {
    messageReceived: safeMessageSnippet(input.message || ""),
    previousState,
    intent: decision.intent,
    confidence: decision.confidence,
    allowedAction: decision.allowedAction,
    reason: decision.reason,
    nextState: deriveNextState(previousState, decision.allowedAction)
  };
}

function decideByState({ detected, normalized, state, input }) {
  if (state === "HUMANO") {
    return decision("humano", 1, "NO_ACTION", "no_auto_reply_human", "Conversa em atendimento humano; IA nao responde automaticamente");
  }
  if (state === "CANCELADO") {
    return decision(detected.intent, detected.confidence, "NO_ACTION", "flow_cancelled", "Fluxo cancelado; nenhuma acao operacional automatica");
  }
  if (state === "AGUARDANDO_NOME") {
    if (detected.intent === "humano") return decision("humano", detected.confidence, "HANDOFF_HUMAN", "human_support", "Cliente pediu atendimento humano");
    if (detected.intent === "cancelar") return decision("cancelar", detected.confidence, "CANCEL_FLOW", "cancel_flow", "Cliente pediu cancelamento");
    if (normalized) return decision("pedido", 0.72, "SEND_MESA_LINK", "order_name_received", "Nome recebido; enviar link da Mesa Comanda");
    return decision("unknown", 0.2, "ASK_NAME", "ask_name_again", "Estado aguarda nome e mensagem nao trouxe nome claro");
  }
  if (ORDER_WAITING_STATES.has(state)) {
    if (detected.intent === "humano") return decision("humano", detected.confidence, "HANDOFF_HUMAN", "human_support", "Cliente pediu atendimento humano durante pedido");
    if (detected.intent === "cancelar") return decision("cancelar", detected.confidence, "CANCEL_FLOW", "cancel_flow", "Cliente pediu cancelamento durante pedido");
    return decision(detected.intent, Math.max(detected.confidence, 0.65), "SEND_MESA_LINK", "send_mesa_link", "Pedido ativo pertence a Mesa; IA apenas reenvia link");
  }
  if (state === "PEDIDO_MESA_RECEBIDO") {
    return decision(detected.intent, Math.max(detected.confidence, 0.7), "ASK_PAYMENT", "ask_payment", "Pedido Mesa ja existe; proxima acao permitida e perguntar pagamento");
  }
  if (state === "AGUARDANDO_FORMA_PAGAMENTO") {
    if (normalized === "1" || detected.intent === "pagamento_pix") return decision("pagamento_pix", 0.92, "SEND_PAYMENT_LINK", "send_payment_link", "Cliente escolheu Pix; encaminhar SamBah Pay");
    if (normalized === "2" || normalized === "3" || normalized === "4" || ["pagamento_cartao", "pagamento_dinheiro", "pagamento_a_cobrar"].includes(detected.intent)) {
      return decision(paymentIntentFromNumber(normalized, detected.intent), Math.max(detected.confidence, 0.88), "MARK_A_COBRAR", "mark_a_cobrar", "Pagamento manual fica marcado como A_COBRAR");
    }
    if (detected.intent === "humano") return decision("humano", detected.confidence, "HANDOFF_HUMAN", "human_support", "Cliente pediu atendimento humano no pagamento");
    return decision("pagamento", 0.5, "ASK_PAYMENT", "ask_payment_again", "Forma de pagamento nao reconhecida");
  }
  if (detected.intent === "humano") return decision("humano", detected.confidence, "HANDOFF_HUMAN", "human_support", "Cliente pediu atendimento humano");
  if (detected.intent === "cancelar") return decision("cancelar", detected.confidence, "CANCEL_FLOW", "cancel_flow", "Cliente pediu cancelamento");
  if (detected.intent === "pedido") return decision("pedido", detected.confidence, "ASK_NAME", "ask_name", "Intencao de pedido em estado livre");
  if (detected.intent === "cardapio") return decision("cardapio", detected.confidence, "ANSWER_INFO", "menu_info", "Cliente pediu cardapio; IA nao inventa itens nem precos");
  if (detected.intent === "evento") return decision("evento", detected.confidence, "ANSWER_INFO", "event_info", "Cliente pediu evento/orcamento");
  if (detected.intent === "localizacao") return decision("localizacao", detected.confidence, "ANSWER_INFO", "location_info", "Cliente pediu localizacao");
  if (detected.intent === "horario") return decision("horario", detected.confidence, "ANSWER_INFO", "hours_info", "Cliente pediu horario");
  if (detected.intent === "reclamar") return decision("reclamar", detected.confidence, "HANDOFF_HUMAN", "complaint_handoff", "Reclamacao deve ir para humano");
  if (PAYMENT_STATES.has(state)) return decision("pagamento", 0.45, "ASK_PAYMENT", "ask_payment_again", "Estado financeiro exige forma de pagamento");
  return decision(detected.intent, detected.confidence, "ANSWER_INFO", "initial_menu", "Estado livre; menu institucional permitido");
}

function detectIntent(normalized = "", previousIntent = "") {
  if (!normalized) return { intent: "unknown", confidence: 0.1 };
  if (hasAny(normalized, ["cancelar", "cancela", "desistir", "deixa pra depois"])) return { intent: "cancelar", confidence: 0.92 };
  if (hasAny(normalized, ["reclamacao", "reclamar", "problema", "errado", "atrasou", "ruim"])) return { intent: "reclamar", confidence: 0.85 };
  if (hasAny(normalized, ["humano", "atendente", "falar com pessoa", "falar com alguem", "falar com alguém", "suporte"]) || normalized === "6") return { intent: "humano", confidence: 0.95 };
  if (hasAny(normalized, ["pix", "sambah pay"])) return { intent: "pagamento_pix", confidence: 0.92 };
  if (hasAny(normalized, ["cartao", "cartão", "credito", "crédito", "debito", "débito"])) return { intent: "pagamento_cartao", confidence: 0.88 };
  if (hasAny(normalized, ["dinheiro"])) return { intent: "pagamento_dinheiro", confidence: 0.88 };
  if (hasAny(normalized, ["a cobrar", "cobrar depois", "pendente"])) return { intent: "pagamento_a_cobrar", confidence: 0.88 };
  if (hasAny(normalized, ["evento", "festa", "orcamento", "orçamento", "food truck", "foodtruck", "casamento", "aniversario", "aniversário"])) return { intent: "evento", confidence: 0.82 };
  if (hasAny(normalized, ["onde fica", "endereco", "endereço", "localizacao", "localização", "mapa", "como chegar"])) return { intent: "localizacao", confidence: 0.84 };
  if (hasAny(normalized, ["horario", "horário", "abre", "fecha", "funciona", "atende hoje"])) return { intent: "horario", confidence: 0.82 };
  if (hasAny(normalized, ["cardapio", "cardápio", "menu", "preco", "preço", "valor"])) return { intent: "cardapio", confidence: 0.82 };
  if (normalized === "1" || hasAny(normalized, ["pedido", "pedir", "comprar", "lanche", "espetinho", "delivery", "retirada", "farofa", "adicional", "complemento"])) return { intent: "pedido", confidence: 0.82 };
  if (previousIntent) return { intent: normalizeIntent(previousIntent), confidence: 0.35 };
  return { intent: "unknown", confidence: 0.2 };
}

function normalizeConversationState(stateInput = "") {
  if (typeof stateInput === "object" && stateInput) {
    if (String(stateInput.status || "").toLowerCase() === "humano") return "HUMANO";
    return normalizeConversationState(stateInput.atendimentoEstado || stateInput.estadoAtendimento || stateInput.state || "");
  }
  const state = String(stateInput || "").trim().toUpperCase();
  return state || "IDLE";
}

function enforceSafeDecision(result) {
  const allowedAction = ALLOWED_ACTIONS.has(result.allowedAction) ? result.allowedAction : "NO_ACTION";
  return {
    intent: normalizeIntent(result.intent),
    confidence: clampConfidence(result.confidence),
    state: result.state || "IDLE",
    allowedAction,
    replyKey: result.replyKey || "no_reply",
    reason: safeMessageSnippet(result.reason || "Decisao controlada")
  };
}

function decision(intent, confidence, allowedAction, replyKey, reason) {
  return { intent, confidence, allowedAction, replyKey, reason };
}

function deriveNextState(previousState = "IDLE", allowedAction = "NO_ACTION") {
  if (allowedAction === "ASK_NAME") return "AGUARDANDO_NOME";
  if (allowedAction === "SEND_MESA_LINK") return "AGUARDANDO_PEDIDO_MESA";
  if (allowedAction === "ASK_PAYMENT") return "AGUARDANDO_FORMA_PAGAMENTO";
  if (allowedAction === "SEND_PAYMENT_LINK") return "COBRANCA_ENVIADA";
  if (allowedAction === "MARK_A_COBRAR") return "A_COBRAR";
  if (allowedAction === "HANDOFF_HUMAN") return "HUMANO";
  if (allowedAction === "CANCEL_FLOW") return "CANCELADO";
  return previousState || "IDLE";
}

function paymentIntentFromNumber(normalized = "", fallback = "pagamento") {
  if (normalized === "2") return "pagamento_cartao";
  if (normalized === "3") return "pagamento_dinheiro";
  if (normalized === "4") return "pagamento_a_cobrar";
  return fallback || "pagamento";
}

function normalizeIntent(intent = "") {
  const normalized = String(intent || "").trim().toLowerCase();
  if (normalized === "desconhecido") return "unknown";
  if (normalized === "reclamacao") return "reclamar";
  return normalized || "unknown";
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, Number(number.toFixed(2))));
}

function hasAny(text = "", terms = []) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safeMessageSnippet(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}
