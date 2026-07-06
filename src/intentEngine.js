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

const SAFE_REPLIES = {
  greeting_short: "Buenas! Aqui e o SamBah, atendimento do Portal Insano. Me diz em poucas palavras o que tu precisa que eu te levo pelo caminho certo.",
  ask_name: "Buenas! Te ajudo com o pedido. Primeiro me manda teu nome, por favor.",
  ask_name_again: "Pra seguir com seguranca, preciso do teu nome antes de te levar para a Comanda Mesa.",
  order_name_received: "Perfeito, ja peguei teu nome. Para montar o pedido com itens, adicionais, entrega ou retirada, segue pela Comanda Mesa: {MESA_COMANDA_URL}",
  send_mesa_link: "Esse pedido segue pela Comanda Mesa, vivente. Usa este link para montar ou continuar teu pedido: {MESA_COMANDA_URL}",
  ask_payment: "Boa, teu pedido ja chegou pela Mesa. Me diz a forma de pagamento: Pix, cartao, dinheiro ou a cobrar.",
  ask_payment_again: "Nao consegui identificar a forma de pagamento. Pode me dizer se e Pix, cartao, dinheiro ou a cobrar?",
  send_payment_link: "Fechado. Vou encaminhar o Pix pelo SamBah Pay, sem confirmar pagamento por aqui.",
  mark_a_cobrar: "Combinado. Vou deixar marcado como A COBRAR para a equipe conferir na Mesa.",
  payment_review: "Recebi tua mensagem sobre pagamento. Eu nao confirmo pagamento sozinho; vou deixar para conferencia da equipe.",
  human_support: "Sem problema. Vou colocar tua conversa para atendimento humano. Enquanto isso, se quiser, posso ir adiantando as informacoes contigo.",
  complaint_handoff: "Entendi. Vou chamar alguem da equipe para olhar isso com atencao.",
  menu_info: "Te ajudo com o cardapio pelo caminho oficial, sem inventar produto nem valor. Se tu quiser pedir, eu te levo para a Comanda Mesa.",
  price_info: "Pra nao te passar valor errado, consulta o cardapio oficial ou segue pela Comanda Mesa. Eu nao invento preco por aqui.",
  stock_info: "Pra disponibilidade eu preciso seguir a fonte oficial. Posso te levar para a Comanda Mesa ou chamar a equipe.",
  delivery_info: "Temos fluxo para entrega ou retirada pela Comanda Mesa. Se quiser pedir, me manda teu nome e eu te encaminho.",
  event_info: "Show. Para orcamento de evento, me passa data, cidade, horario aproximado e quantidade de pessoas.",
  company_info: "Atendemos demandas de empresa pelo fluxo de eventos/orcamentos. Me passa data, local e quantidade de pessoas.",
  location_info: "Posso te orientar pelo canal oficial, sem inventar endereco. Se preferir, chamo a equipe para confirmar a localizacao contigo.",
  hours_info: "Pra nao te passar horario errado, eu encaminho pelo canal oficial ou chamo a equipe para confirmar contigo.",
  cancel_flow: "Certo, vou cancelar esse fluxo por aqui. Se quiser retomar depois, e so me chamar.",
  flow_cancelled: "Esse fluxo esta cancelado, entao nao vou executar nenhuma acao automatica.",
  no_auto_reply_human: "",
  initial_menu: "Certo. Me diz se tu quer pedido, cardapio, evento, granja, pagamento ou atendimento humano.",
  safe_fallback: "Nao quero te enrolar. Me diz em uma frase se e pedido, cardapio, evento, pagamento ou atendimento humano."
};

export function classifySambahIntent(input = {}) {
  const message = String(input.message || "").trim();
  const normalized = normalizeText(message);
  const state = normalizeConversationState(input.conversationState);
  const detected = detectIntent(normalized, input.previousIntent);
  const decision = decideByState({ detected, normalized, state, input });
  return enforceSafeDecision({
    intent: decision.intent,
    confidence: decision.confidence,
    conversationState: state,
    state,
    allowedAction: decision.allowedAction,
    responseStyle: decision.responseStyle || responseStyleFor(decision.allowedAction, decision.replyKey),
    safeReply: decision.safeReply || SAFE_REPLIES[decision.replyKey] || SAFE_REPLIES.safe_fallback,
    requiresHuman: decision.requiresHuman ?? requiresHumanFor(decision.allowedAction, decision.intent),
    replyKey: decision.replyKey,
    auditReason: decision.auditReason || decision.reason,
    reason: decision.reason
  });
}

export function buildSambahAiAudit(input = {}, decision = classifySambahIntent(input)) {
  const previousState = normalizeConversationState(input.conversationState);
  return {
    messageReceived: safeMessageSnippet(input.message || ""),
    previousState,
    conversationState: decision.conversationState || previousState,
    intent: decision.intent,
    confidence: decision.confidence,
    allowedAction: decision.allowedAction,
    requiresHuman: decision.requiresHuman,
    auditReason: decision.auditReason,
    reason: decision.reason,
    nextState: deriveNextState(previousState, decision.allowedAction)
  };
}

function decideByState({ detected, normalized, state }) {
  if (state === "HUMANO") {
    return decision("humano", 1, "NO_ACTION", "no_auto_reply_human", "Conversa em atendimento humano; IA nao responde automaticamente", true);
  }
  if (state === "CANCELADO") {
    return decision(detected.intent, detected.confidence, "NO_ACTION", "flow_cancelled", "Fluxo cancelado; nenhuma acao operacional automatica");
  }
  if (state === "AGUARDANDO_NOME") {
    if (detected.intent === "humano") return decision("humano", detected.confidence, "HANDOFF_HUMAN", "human_support", "Cliente pediu atendimento humano", true);
    if (detected.intent === "cancelar") return decision("cancelar", detected.confidence, "CANCEL_FLOW", "cancel_flow", "Cliente pediu cancelamento");
    if (normalized) return decision("pedido", 0.72, "SEND_MESA_LINK", "order_name_received", "Nome recebido; enviar link da Mesa Comanda");
    return decision("unknown", 0.2, "ASK_NAME", "ask_name_again", "Estado aguarda nome e mensagem nao trouxe nome claro");
  }
  if (ORDER_WAITING_STATES.has(state)) {
    if (detected.intent === "humano") return decision("humano", detected.confidence, "HANDOFF_HUMAN", "human_support", "Cliente pediu atendimento humano durante pedido", true);
    if (detected.intent === "cancelar") return decision("cancelar", detected.confidence, "CANCEL_FLOW", "cancel_flow", "Cliente pediu cancelamento durante pedido");
    return decision(detected.intent, Math.max(detected.confidence, 0.65), "SEND_MESA_LINK", "send_mesa_link", "Pedido ativo pertence a Mesa; IA apenas reenvia link");
  }
  if (state === "PEDIDO_MESA_RECEBIDO") {
    if (detected.intent === "pagamento_comprovante") return decision("pagamento", detected.confidence, "HANDOFF_HUMAN", "payment_review", "Cliente informou pagamento; exige conferencia humana", true);
    return decision(detected.intent, Math.max(detected.confidence, 0.7), "ASK_PAYMENT", "ask_payment", "Pedido Mesa ja existe; proxima acao permitida e perguntar pagamento");
  }
  if (state === "AGUARDANDO_FORMA_PAGAMENTO") {
    if (detected.intent === "pagamento_comprovante") return decision("pagamento", detected.confidence, "HANDOFF_HUMAN", "payment_review", "Cliente informou pagamento; IA nao confirma pagamento", true);
    if (normalized === "1" || detected.intent === "pagamento_pix") return decision("pagamento_pix", 0.92, "SEND_PAYMENT_LINK", "send_payment_link", "Cliente escolheu Pix; encaminhar SamBah Pay");
    if (normalized === "2" || normalized === "3" || normalized === "4" || ["pagamento_cartao", "pagamento_dinheiro", "pagamento_a_cobrar"].includes(detected.intent)) {
      return decision(paymentIntentFromNumber(normalized, detected.intent), Math.max(detected.confidence, 0.88), "MARK_A_COBRAR", "mark_a_cobrar", "Pagamento manual fica marcado como A_COBRAR");
    }
    if (detected.intent === "humano") return decision("humano", detected.confidence, "HANDOFF_HUMAN", "human_support", "Cliente pediu atendimento humano no pagamento", true);
    return decision("pagamento", 0.5, "ASK_PAYMENT", "ask_payment_again", "Forma de pagamento nao reconhecida");
  }
  if (detected.intent === "saudacao") return decision("saudacao", detected.confidence, "ANSWER_INFO", "greeting_short", "Saudacao em estado livre; resposta curta sem menu longo");
  if (detected.intent === "humano") return decision("humano", detected.confidence, "HANDOFF_HUMAN", "human_support", "Cliente pediu atendimento humano", true);
  if (detected.intent === "reclamar") return decision("reclamar", detected.confidence, "HANDOFF_HUMAN", "complaint_handoff", "Reclamacao deve ir para humano", true);
  if (detected.intent === "pagamento_comprovante") return decision("pagamento", detected.confidence, "HANDOFF_HUMAN", "payment_review", "Mensagem de pagamento precisa de conferencia humana", true);
  if (detected.intent === "cancelar") return decision("cancelar", detected.confidence, "CANCEL_FLOW", "cancel_flow", "Cliente pediu cancelamento");
  if (detected.intent === "pedido") return decision("pedido", detected.confidence, "ASK_NAME", "ask_name", "Intencao de pedido em estado livre");
  if (detected.intent === "delivery" || detected.intent === "retirada") return decision("pedido", detected.confidence, "ASK_NAME", "delivery_info", "Entrega ou retirada deve seguir fluxo Mesa");
  if (detected.intent === "cardapio") return decision("cardapio", detected.confidence, "ANSWER_INFO", "menu_info", "Cliente pediu cardapio; IA nao inventa itens nem precos");
  if (detected.intent === "preco") return decision("preco", detected.confidence, "ANSWER_INFO", "price_info", "Cliente pediu preco; IA nao inventa valores");
  if (detected.intent === "estoque") return decision("estoque", detected.confidence, "ANSWER_INFO", "stock_info", "Cliente pediu disponibilidade; IA nao confirma estoque");
  if (detected.intent === "evento") return decision("evento", detected.confidence, "ANSWER_INFO", "event_info", "Cliente pediu evento/orcamento");
  if (detected.intent === "empresa") return decision("evento", detected.confidence, "ANSWER_INFO", "company_info", "Cliente perguntou atendimento para empresa");
  if (detected.intent === "localizacao") return decision("localizacao", detected.confidence, "ANSWER_INFO", "location_info", "Cliente pediu localizacao");
  if (detected.intent === "horario") return decision("horario", detected.confidence, "ANSWER_INFO", "hours_info", "Cliente pediu horario");
  if (detected.intent === "link") return decision("unknown", detected.confidence, "ANSWER_INFO", "safe_fallback", "Cliente pediu link sem contexto suficiente");
  if (PAYMENT_STATES.has(state)) return decision("pagamento", 0.45, "ASK_PAYMENT", "ask_payment_again", "Estado financeiro exige forma de pagamento");
  return decision(detected.intent, detected.confidence, "ANSWER_INFO", "safe_fallback", "Mensagem incompleta; resposta segura sem acao operacional");
}

function detectIntent(normalized = "", previousIntent = "") {
  if (!normalized) return { intent: "unknown", confidence: 0.1 };
  if (isGreeting(normalized)) return { intent: "saudacao", confidence: 0.9 };
  if (hasAny(normalized, ["cancelar", "cancela", "desistir", "deixa pra depois"])) return { intent: "cancelar", confidence: 0.92 };
  if (hasAny(normalized, ["reclamacao", "reclamar", "problema", "errado", "atrasou", "ruim", "irritado", "brabo"])) return { intent: "reclamar", confidence: 0.85 };
  if (hasAny(normalized, ["humano", "atendente", "gerente", "falar com pessoa", "falar com alguem", "suporte"]) || normalized === "6") return { intent: "humano", confidence: 0.95 };
  if (hasAny(normalized, ["paguei", "pix feito", "ja fiz o pix", "comprovante", "mandei o comprovante", "pagamento feito"])) return { intent: "pagamento_comprovante", confidence: 0.92 };
  if (hasAny(normalized, ["pix", "sambah pay"])) return { intent: "pagamento_pix", confidence: 0.92 };
  if (hasAny(normalized, ["cartao", "credito", "debito"])) return { intent: "pagamento_cartao", confidence: 0.88 };
  if (hasAny(normalized, ["dinheiro"])) return { intent: "pagamento_dinheiro", confidence: 0.88 };
  if (hasAny(normalized, ["a cobrar", "cobrar depois", "pendente"])) return { intent: "pagamento_a_cobrar", confidence: 0.88 };
  if (hasAny(normalized, ["manda o link", "me manda o link", "link"])) return { intent: "link", confidence: 0.62 };
  if (hasAny(normalized, ["faz entrega", "entrega", "delivery", "entregar"])) return { intent: "delivery", confidence: 0.82 };
  if (hasAny(normalized, ["retirar", "retirada", "buscar", "pegar ai", "posso retirar"])) return { intent: "retirada", confidence: 0.82 };
  if (hasAny(normalized, ["evento", "festa", "orcamento", "food truck", "foodtruck", "casamento", "aniversario"])) return { intent: "evento", confidence: 0.82 };
  if (hasAny(normalized, ["empresa", "corporativo", "atendem empresa", "atende empresa"])) return { intent: "empresa", confidence: 0.82 };
  if (hasAny(normalized, ["onde fica", "endereco", "localizacao", "mapa", "como chegar"])) return { intent: "localizacao", confidence: 0.84 };
  if (hasAny(normalized, ["horario", "abre", "fecha", "funciona", "atende hoje", "que horas"])) return { intent: "horario", confidence: 0.82 };
  if (hasAny(normalized, ["quanto ta", "quanto custa", "preco", "valor", "custa"])) return { intent: "preco", confidence: 0.84 };
  if (hasAny(normalized, ["tem hoje", "tem disponivel", "disponivel", "estoque", "ainda tem"])) return { intent: "estoque", confidence: 0.78 };
  if (hasAny(normalized, ["cardapio", "menu"])) return { intent: "cardapio", confidence: 0.82 };
  if (hasAny(normalized, ["ja fiz o pedido", "pedido feito", "finalizei o pedido"])) return { intent: "pedido", confidence: 0.74 };
  if (normalized === "1" || hasAny(normalized, ["pedido", "pedir", "comprar", "lanche", "espetinho", "farofa", "adicional", "complemento"])) return { intent: "pedido", confidence: 0.82 };
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
  const conversationState = result.conversationState || result.state || "IDLE";
  const safeReply = allowedAction === "NO_ACTION" ? "" : safeMessageSnippet(result.safeReply || SAFE_REPLIES.safe_fallback, 900);
  return {
    intent: normalizeIntent(result.intent),
    confidence: clampConfidence(result.confidence),
    conversationState,
    state: conversationState,
    allowedAction,
    responseStyle: result.responseStyle || responseStyleFor(allowedAction, result.replyKey),
    safeReply,
    requiresHuman: Boolean(result.requiresHuman ?? requiresHumanFor(allowedAction, result.intent)),
    replyKey: result.replyKey || "safe_fallback",
    auditReason: safeMessageSnippet(result.auditReason || result.reason || "Decisao controlada"),
    reason: safeMessageSnippet(result.reason || result.auditReason || "Decisao controlada")
  };
}

function decision(intent, confidence, allowedAction, replyKey, reason, requiresHuman = undefined) {
  return { intent, confidence, allowedAction, replyKey, reason, auditReason: reason, requiresHuman };
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

function responseStyleFor(allowedAction = "", replyKey = "") {
  if (allowedAction === "HANDOFF_HUMAN") return "human_handoff";
  if (allowedAction === "SEND_MESA_LINK") return "mesa_guidance";
  if (allowedAction === "ASK_PAYMENT" || allowedAction === "SEND_PAYMENT_LINK" || allowedAction === "MARK_A_COBRAR") return "payment_safe";
  if (replyKey === "greeting_short") return "natural_short";
  return "controlled_safe";
}

function requiresHumanFor(allowedAction = "", intent = "") {
  return allowedAction === "HANDOFF_HUMAN" || ["humano", "reclamar", "pagamento_comprovante"].includes(normalizeIntent(intent));
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
  if (normalized === "pagamento_comprovante") return "pagamento";
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

function isGreeting(normalized = "") {
  if (["oi", "ola", "buenas", "bom dia", "boa tarde", "boa noite", "hello", "hy", "hi"].includes(normalized)) return true;
  return /^(oi|ola|buenas|bom dia|boa tarde|boa noite)\b/.test(normalized);
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeMessageSnippet(value = "", maxLength = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
