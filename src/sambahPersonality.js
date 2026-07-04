const INITIAL_MESSAGE = `Buenas! Aqui é o SamBah, atendimento do Portal Insano.

Me diz o que tu precisa:

1 - Fazer pedido
2 - Ver cardápio
3 - Orçamento para evento
4 - Granja Águas da Lagoa
5 - Pagamentos
6 - Falar com atendente`;

const HUMAN_SUPPORT_MESSAGE = `Sem problema, vivente!

Vou colocar tua conversa na fila da nossa equipe.

Pode ser que o atendimento humano leve um pouquinho mais de tempo, porque depende de um atendente ficar disponível.

Mas deixa eu te contar uma coisa...

Enquanto o pessoal tá atendendo outros clientes, eu posso ir adiantando tudo contigo.

Consigo tirar dúvidas, montar teu pedido, mostrar o cardápio, informar valores, apresentar nossas promoções e deixar tudo encaminhado.

Quando um atendente assumir a conversa, ele já recebe todo o histórico do que conversamos. Assim, tu não precisa repetir tudo de novo.

O que tu prefere agora?

1️⃣ Continuar com o SamBah 🚀
2️⃣ Aguardar um atendente 👨‍💼`;

const CONTINUE_WITH_SAMBAH_MESSAGE = "Fechado, seguimos por aqui contigo. Me diz o que tu precisa agora que eu já vou te ajudando.";
const WAITING_FOR_ATTENDANT_MESSAGE = "Combinado. Tua conversa ficou na fila da equipe. Assim que um atendente estiver disponível, ele assume por aqui.";
const FALLBACK_MESSAGE = "Certo. Me conta um pouco mais do que tu precisa, ou responde com um número de 1 a 6 para eu te levar direto ao ponto.";

const DEFAULT_MESA_COMANDA_URL = "https://insanofoodtruck.com.br/pedir?origem=whatsapp_sambah";

const ORDER_MESSAGE = `Bah, perfeito. Vou te levar para a Comanda Mesa.

Primeiro me manda teu nome, por favor.`;

const ORDER_NAME_RECEIVED_MESSAGE = `Perfeito, já peguei teu nome.

Para montar teu pedido, usa a comanda do Mesa aqui: {MESA_COMANDA_URL}

Por lá tu escolhe item, adicional, retirada, delivery ou consumo no local.`;

const ORDER_ITEMS_RECEIVED_MESSAGE = "Para montar teu pedido, usa a comanda do Mesa aqui: {MESA_COMANDA_URL}";

const ORDER_DELIVERY_RECEIVED_MESSAGE = `Boa, teu pedido já chegou pela Comanda Mesa.

Agora me diz a forma de pagamento:

1 - Pix pelo SamBah Pay
2 - Cartão
3 - Dinheiro
4 - A cobrar`;

const SAMBAH_PAY_PIX_MESSAGE = "Fechado. Vou deixar a cobrança Pix encaminhada pelo SamBah Pay.";
const PAYMENT_TO_COLLECT_MESSAGE = "Combinado. Vou deixar marcado como A COBRAR na comanda do Mesa.";

const MENU_MESSAGE = `Claro! Vou te ajudar com o cardápio.

Me diz o que tu quer ver primeiro:

1. Espetinhos e carnes
2. Lanches
3. Bebidas
4. Combos e promoções
5. Quero uma sugestão do SamBah

Se tu já sabe o que quer, pode me mandar direto o pedido.`;

const EVENT_MESSAGE = `Buenas! Para evento eu consigo adiantar a proposta contigo.

Me passa:

1. Data do evento
2. Cidade e local
3. Horário aproximado
4. Quantidade de pessoas
5. Tipo de evento

Com isso eu já organizo as informações para o time do Insano.`;

const GRANJA_MESSAGE = `Que baita escolha. A Granja Águas da Lagoa trabalha com produtos da nossa operação rural.

Me diz o que tu quer conhecer:

1. Ovos
2. Produtos da granja
3. Valores e disponibilidade
4. Entrega ou retirada

Eu te ajudo a deixar essa consulta pronta.`;

const FINANCE_MESSAGE = `Certo, vamos pelo financeiro.

Me diz qual é o assunto:

1. Pagamento de pedido
2. Comprovante
3. Dúvida de valor
4. Acerto de evento
5. Falar com o financeiro

Se tiver comprovante ou número do pedido, pode mandar aqui.`;

export function buildSambahInitialMessage() {
  return INITIAL_MESSAGE;
}

export function buildSambahHumanSupportMessage() {
  return HUMAN_SUPPORT_MESSAGE;
}

export function buildSambahContinueMessage() {
  return CONTINUE_WITH_SAMBAH_MESSAGE;
}

export function buildSambahWaitingAttendantMessage() {
  return WAITING_FOR_ATTENDANT_MESSAGE;
}

export function buildSambahOrderMessage() {
  return ORDER_MESSAGE;
}

export function buildSambahOrderNameReceivedMessage() {
  return withMesaComandaUrl(ORDER_NAME_RECEIVED_MESSAGE);
}

export function buildSambahOrderItemsReceivedMessage() {
  return withMesaComandaUrl(ORDER_ITEMS_RECEIVED_MESSAGE);
}

export function buildSambahOrderDeliveryReceivedMessage() {
  return ORDER_DELIVERY_RECEIVED_MESSAGE;
}

export function buildSambahMenuMessage() {
  return MENU_MESSAGE;
}

export function buildSambahEventMessage() {
  return EVENT_MESSAGE;
}

export function buildSambahGranjaMessage() {
  return GRANJA_MESSAGE;
}

export function buildSambahFinanceMessage() {
  return FINANCE_MESSAGE;
}

export function buildSambahFallbackMessage() {
  return FALLBACK_MESSAGE;
}

export function detectSambahHumanSupportIntent(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return [
    "atendente",
    "humano",
    "pessoa",
    "falar com alguem",
    "falar com alguém",
    "suporte"
  ].some((term) => normalized.includes(normalizeText(term))) || normalized === "6";
}

export function buildSambahAutoReply(text = "", context = {}) {
  const normalized = normalizeText(text);
  const nextContext = { ...context, textNormalized: normalized };
  if (detectSambahHumanSupportIntent(text)) {
    return buildSambahHumanSupportMessage();
  }
  if (hasBlockingOrderState(context.conversation || context.conversa || null)) {
    const contextualReply = buildContextualReply(normalized, nextContext);
    if (contextualReply) return contextualReply;
  }
  if (isGreetingIntent(normalized)) return buildSambahInitialMessage();
  const contextualReply = buildContextualReply(normalized, nextContext);
  if (contextualReply) return contextualReply;
  if (isOrderIntent(normalized) || normalized === "1") return buildSambahOrderMessage();
  if (isMenuIntent(normalized) || normalized === "2") return buildSambahMenuMessage();
  if (isEventIntent(normalized) || normalized === "3") return buildSambahEventMessage();
  if (isGranjaIntent(normalized) || normalized === "4") return buildSambahGranjaMessage();
  if (isFinanceIntent(normalized) || normalized === "5") return buildSambahFinanceMessage();
  return buildSambahFallbackMessage();
}

function buildContextualReply(normalized = "", context = {}) {
  if (!normalized) return "";
  const conversation = context.conversation || context.conversa || null;
  const flow = inferActiveFlow(conversation);
  if (!flow) return "";
  if (flow === "order") return buildOrderContextualReply(conversation, context);
  if (flow === "menu") {
    return `Certo. Vou seguir pelo cardápio contigo.

Me diz se tu quer ver espetinhos, lanches, bebidas ou combos.`;
  }
  if (flow === "event") {
    return `Perfeito. Vou seguir pelo orçamento do evento.

Me manda data, cidade, horário e quantidade de pessoas que eu organizo para a equipe.`;
  }
  if (flow === "granja") {
    return `Certo. Vou seguir pela Granja Águas da Lagoa.

Me diz se tu quer saber sobre ovos, produtos, valores ou entrega.`;
  }
  if (flow === "finance") {
    return `Certo. Vou seguir pelo financeiro.

Me manda o assunto, comprovante ou número do pedido que eu deixo encaminhado.`;
  }
  return "";
}

function buildOrderContextualReply(conversation = {}, context = {}) {
  const state = conversation?.atendimentoEstado || conversation?.estadoAtendimento || "";
  if (state === "AGUARDANDO_FORMA_PAGAMENTO" || state === "PEDIDO_MESA_RECEBIDO") {
    if (isPixPaymentIntent(context.textNormalized || "")) return SAMBAH_PAY_PIX_MESSAGE;
    if (isManualPaymentIntent(context.textNormalized || "")) return PAYMENT_TO_COLLECT_MESSAGE;
    return buildSambahOrderDeliveryReceivedMessage();
  }
  if (["ENVIADO_PARA_MESA_COMANDA", "AGUARDANDO_PEDIDO_MESA"].includes(state)) {
    return withMesaComandaUrl(ORDER_ITEMS_RECEIVED_MESSAGE, context);
  }
  const answers = inboundTextsSinceLastOrderPrompt(conversation);
  if (isOrderAlreadyForwarded(conversation)) {
    return buildSambahOrderDeliveryReceivedMessage();
  }
  if (answers.length <= 1) return withMesaComandaUrl(ORDER_NAME_RECEIVED_MESSAGE, context);
  return withMesaComandaUrl(ORDER_ITEMS_RECEIVED_MESSAGE, context);
}

function inferActiveFlow(conversation = {}) {
  const state = conversation?.atendimentoEstado || conversation?.estadoAtendimento || "";
  if (["AGUARDANDO_NOME", "ENVIADO_PARA_MESA_COMANDA", "AGUARDANDO_PEDIDO_MESA", "PEDIDO_MESA_RECEBIDO", "AGUARDANDO_FORMA_PAGAMENTO"].includes(state)) return "order";
  const lastOut = lastOutboundText(conversation);
  const normalized = normalizeText(lastOut);
  if (!normalized) return "";
  if (normalized.includes("vamos montar teu pedido")) return "order";
  if (normalized.includes("vou te levar para a comanda mesa")) return "order";
  if (normalized.includes("ja peguei teu nome")) return "order";
  if (normalized.includes("ja anotei a ideia do pedido")) return "order";
  if (normalized.includes("pedido encaminhado")) return "order";
  if (normalized.includes("comanda do mesa")) return "order";
  if (normalized.includes("pedido ja chegou pela comanda mesa")) return "order";
  if (normalized.includes("vou te ajudar com o cardapio")) return "menu";
  if (normalized.includes("para evento eu consigo")) return "event";
  if (normalized.includes("baita escolha") || normalized.includes("vou seguir pela granja")) return "granja";
  if (normalized.includes("vamos pelo financeiro")) return "finance";
  return "";
}

function inboundTextsSinceLastOrderPrompt(conversation = {}) {
  const messages = Array.isArray(conversation?.mensagens) ? conversation.mensagens : [];
  let promptIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] || {};
    if (message.direction !== "out") continue;
    if (normalizeText(message.text || "").includes("vamos montar teu pedido")) {
      promptIndex = index;
      break;
    }
  }
  if (promptIndex < 0) return [];
  return messages
    .slice(promptIndex + 1)
    .filter((message) => message?.direction === "in")
    .map((message) => String(message.text || message.transcricao || "").trim())
    .filter(Boolean);
}

function lastOutboundText(conversation = {}) {
  const messages = Array.isArray(conversation?.mensagens) ? conversation.mensagens : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] || {};
    if (message.direction === "out" && message.text) return message.text;
  }
  return "";
}

function hasBlockingOrderState(conversation = {}) {
  const state = conversation?.atendimentoEstado || conversation?.estadoAtendimento || "";
  return ["AGUARDANDO_NOME", "ENVIADO_PARA_MESA_COMANDA", "AGUARDANDO_PEDIDO_MESA", "PEDIDO_MESA_RECEBIDO", "AGUARDANDO_FORMA_PAGAMENTO", "COBRANCA_ENVIADA"].includes(state);
}

function isOrderAlreadyForwarded(conversation = {}) {
  const messages = Array.isArray(conversation?.mensagens) ? conversation.mensagens : [];
  return messages.some((message) => (
    message?.direction === "out"
    && normalizeText(message.text || "").includes("pedido encaminhado")
  ));
}

function withMesaComandaUrl(message = "", context = {}) {
  const url = context.mesaComandaUrl || context.mesaUrl || DEFAULT_MESA_COMANDA_URL;
  return message.replaceAll("{MESA_COMANDA_URL}", url);
}

function isOrderIntent(normalized = "") {
  return ["pedido", "pedir", "comprar", "espetinho", "lanche", "delivery", "retirada"].some((term) => normalized.includes(term));
}

function isMenuIntent(normalized = "") {
  return ["cardapio", "menu", "valores", "precos", "promocao"].some((term) => normalized.includes(term));
}

function isEventIntent(normalized = "") {
  return ["evento", "festa", "contratar", "orcamento", "food truck"].some((term) => normalized.includes(term));
}

function isGranjaIntent(normalized = "") {
  return ["granja", "aguas da lagoa", "ovo", "ovos"].some((term) => normalized.includes(term));
}

function isFinanceIntent(normalized = "") {
  return ["pagamento", "financeiro", "comprovante", "pix", "valor", "cobrar", "cobranca"].some((term) => normalized.includes(term));
}

function isPixPaymentIntent(normalized = "") {
  return normalized === "1" || /\bpix\b/.test(normalized) || normalized.includes("sambah pay");
}

function isManualPaymentIntent(normalized = "") {
  return normalized === "2" || normalized === "3" || normalized === "4" || ["cartao", "credito", "debito", "dinheiro", "a cobrar", "cobrar"].some((term) => normalized.includes(term));
}

function isGreetingIntent(normalized = "") {
  if (["", "oi", "ola", "olá", "buenas", "bom dia", "boa tarde", "boa noite", "hello", "hy", "hi"].some((term) => normalized === normalizeText(term))) {
    return true;
  }
  return /^(oi|ola|olá|buenas|bom dia|boa tarde|boa noite)\b/.test(normalized);
}

function normalizeText(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
