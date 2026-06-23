export class SambahWhatsappMockService {
  constructor({ memoryService, handoffService, crmService } = {}) {
    this.memory = memoryService;
    this.handoff = handoffService;
    this.crm = crmService;
  }

  async receiveMessage(input = {}) {
    if (!input.phone) return { ok: false, statusCode: 400, error: "phone_required" };
    if (!input.message) return { ok: false, statusCode: 400, error: "message_required" };

    const previous = await this.memory.getContact(input.phone);
    const previousContact = previous.ok ? previous.contact : null;
    const intent = detectIntent(input.message);
    const commercialData = extractCommercialData(input.message);
    const reply = suggestedReply({ intent, previousContact });
    const memoryResult = await this.memory.upsertContact({
      phone: input.phone,
      name: input.name,
      message: input.message,
      intent,
      messages: [
        { direction: "inbound", text: input.message, intent },
        { direction: "outbound", text: reply, intent }
      ]
    });
    if (!memoryResult.ok) return memoryResult;
    const crmResult = await this.crm?.upsertByIntent?.({
      phone: memoryResult.contact.phone,
      name: memoryResult.contact.name,
      message: input.message,
      intent,
      source: input.channel || "whatsapp",
      commercialData,
      totalInteractions: memoryResult.contact.totalInteractions
    });

    const handoff = intent === "humano";
    const handoffSummary = handoff ? buildHandoffSummary(memoryResult.contact, input.message) : null;
    if (handoff && this.handoff) {
      await this.handoff.upsertPending({
        phone: handoffSummary.phone,
        name: handoffSummary.name,
        reason: intent,
        summaryText: handoffSummary.summaryText,
        recentMessages: handoffSummary.recentMessages
      });
    }

    return {
      ok: true,
      intent,
      contact: memoryResult.contact,
      suggestedReply: reply,
      commercialData,
      priorityScore: crmResult?.lead?.priorityScore,
      priorityLabel: crmResult?.lead?.priorityLabel,
      handoff,
      ...(handoff ? { handoffSummary } : {})
    };
  }
}

function detectIntent(message = "") {
  const text = normalize(message);
  if (hasAny(text, ["neno", "kazuko", "atendente", "humano", "falar com"])) return "humano";
  if (hasAny(text, ["orcament", "valor", "preco", "quanto custa"])) return "orcamento";
  if (hasAny(text, ["anivers", "festa", "confraterniz", "evento"])) return "evento";
  if (hasAny(text, ["pedir", "pedido", "cardapio", "burger", "hamburguer", "espetinho", "entrega"])) return "pedido";
  return "desconhecido";
}

function suggestedReply({ intent, previousContact }) {
  if (!previousContact) {
    return "Buenas! Eu sou o SamBah, atendimento rapido do Insano/Xeriffe. Me diz: e pedido, evento ou orcamento?";
  }
  if (intent === "humano") return "Vou encaminhar para Neno ou Kazuko com o resumo da conversa.";

  const context = `Te achei aqui. Da ultima vez falamos sobre ${previousContact.lastIntent || "atendimento"}.`;
  if (intent === "evento") return `${context} Qual data, numero de pessoas e local?`;
  if (intent === "orcamento") return `${context} Me passa tipo, quantidade de pessoas e data se for evento.`;
  if (intent === "pedido") return `${context} Me diz o que tu quer pedir ou se prefere ver o cardapio.`;
  return `${context} E pedido, evento, orcamento ou quer falar com alguem?`;
}

function buildHandoffSummary(contact = {}, currentMessage = "") {
  const name = contact.name || "Cliente sem nome";
  const lastIntent = contact.lastIntent || "nao identificada";
  const lastMessage = contact.lastMessage || currentMessage || "";
  const phone = contact.phone || "";
  const recentMessages = (Array.isArray(contact.messages) ? contact.messages : []).slice(-5).map((message) => ({
    direction: message.direction,
    text: message.text,
    intent: message.intent,
    createdAt: message.createdAt
  }));
  const messageResume = recentMessages
    .slice(-3)
    .map((message) => `${message.direction}: ${shortText(message.text, 28)}`)
    .join(" | ");
  return {
    to: "Neno/Kazuko",
    phone,
    name,
    lastIntent,
    lastMessage,
    totalInteractions: Number(contact.totalInteractions || 0),
    recentMessages,
    summaryText: `Cliente ${name}, tel. ${phone}. Handoff humano. Assunto: ${lastIntent}. Interacoes: ${Number(contact.totalInteractions || 0)}. Ultimas: ${messageResume || shortText(lastMessage, 28)}`
  };
}

function shortText(value = "", max = 60) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

function hasAny(text, words) {
  return words.some((word) => text.includes(normalize(word)));
}

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractCommercialData(message = "") {
  const original = String(message || "");
  const text = normalize(original);
  return {
    peopleCount: extractPeopleCount(text),
    eventType: extractEventType(text),
    requestedDate: extractRequestedDate(original, text),
    locationHint: extractLocationHint(original),
    budgetHint: extractBudgetHint(original, text)
  };
}

function extractPeopleCount(text) {
  const match = text.match(/(\d{1,5})\s*(pessoas|convidados|participantes)/);
  return match ? Number(match[1]) : null;
}

function extractEventType(text) {
  if (text.includes("anivers")) return "aniversario";
  if (text.includes("confraterniz")) return "confraternizacao";
  if (text.includes("empresa") || text.includes("corporativo")) return "empresa";
  if (text.includes("feira")) return "feira";
  if (text.includes("casamento")) return "casamento";
  if (hasAny(text, ["festa", "evento"])) return "outro";
  return null;
}

function extractRequestedDate(original, text) {
  const dateMatch = String(original || "").match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
  if (dateMatch) return dateMatch[0];
  if (text.includes("amanha")) return "amanha";
  const weekday = text.match(/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/);
  return weekday ? weekday[1] : null;
}

function extractLocationHint(original) {
  const match = String(original || "").match(/\b(?:em|no|na|local|cidade)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ-]*(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ-]*){0,3})/);
  return match ? match[1].trim() : null;
}

function extractBudgetHint(original, text) {
  const currency = String(original || "").match(/R\$\s?\d+(?:[.,]\d{2})?/i);
  if (currency) return currency[0];
  const reais = String(original || "").match(/\b\d+(?:[.,]\d{2})?\s*reais\b/i);
  if (reais) return reais[0];
  if (hasAny(text, ["orcament", "preco", "valor"])) return "solicitado";
  return null;
}
