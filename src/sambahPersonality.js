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
  if (detectSambahHumanSupportIntent(text)) {
    return buildSambahHumanSupportMessage();
  }
  return buildSambahInitialMessage();
}

function normalizeText(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
