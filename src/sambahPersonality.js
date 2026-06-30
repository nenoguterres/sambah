const INITIAL_MESSAGE = `🤠 Buenas! Eu sou o SamBah.

Que bom te ver por aqui!

Tô pronto pra te ajudar da forma mais rápida possível. Me diz, o que tu precisa agora?

1️⃣ Quero fazer um pedido 🍔
2️⃣ Quero ver o cardápio 📋
3️⃣ Quero contratar o Insano para um evento 🎪
4️⃣ Quero conhecer os produtos da Granja Águas da Lagoa 🥚
5️⃣ Pagamentos e financeiro 💳
6️⃣ Quero falar com um atendente 👨‍💼`;

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

const ORDER_MESSAGE = `Bah, perfeito. Vamos montar teu pedido.

Me manda, por favor:

1. Teu nome
2. O que tu quer pedir
3. Retirada, delivery ou consumo no local
4. Se for delivery, teu endereço completo

Com isso eu já deixo tudo encaminhado contigo.`;

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

export function buildSambahAutoReply(text = "") {
  const normalized = normalizeText(text);
  if (detectSambahHumanSupportIntent(text)) {
    return buildSambahHumanSupportMessage();
  }
  if (isOrderIntent(normalized) || normalized === "1") return buildSambahOrderMessage();
  if (isMenuIntent(normalized) || normalized === "2") return buildSambahMenuMessage();
  if (isEventIntent(normalized) || normalized === "3") return buildSambahEventMessage();
  if (isGranjaIntent(normalized) || normalized === "4") return buildSambahGranjaMessage();
  if (isFinanceIntent(normalized) || normalized === "5") return buildSambahFinanceMessage();
  return buildSambahInitialMessage();
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

function normalizeText(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
