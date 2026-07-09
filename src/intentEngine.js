const PRIORITIZED_INTENTS = [
  {
    intent: "humano",
    destination: "human_support",
    terms: ["humano", "atendente", "pessoa", "gerente", "responsavel", "falar com alguem", "suporte"]
  },
  {
    intent: "pedido",
    destination: "mesa",
    terms: ["pedido", "comprar", "quero", "lanche", "hamburguer", "xis", "cachorro", "hot dog", "pancho", "pizza", "espetinho", "costela", "frango", "porcao", "batata", "cerveja", "chope", "refrigerante"]
  },
  {
    intent: "cardapio",
    destination: "mesa",
    terms: ["cardapio", "menu", "produtos", "opcoes"]
  },
  {
    intent: "delivery",
    destination: "mesa",
    terms: ["delivery", "entrega", "entregar", "tele"]
  },
  {
    intent: "retirada",
    destination: "mesa",
    terms: ["retirar", "buscar", "passar pegar"]
  },
  {
    intent: "local",
    destination: "mesa",
    terms: ["local", "mesa", "consumir", "ai", "presencial"]
  },
  {
    intent: "evento",
    destination: "crm_comercial",
    terms: ["evento", "casamento", "aniversario", "empresa", "corporativo", "food truck", "orcamento"]
  },
  {
    intent: "granja",
    destination: "granja_aguas_da_lagoa",
    terms: ["granja", "ovo", "ovos", "frango colonial", "colonial"]
  },
  {
    intent: "financeiro",
    destination: "sambah_pay",
    terms: ["pix", "cartao", "boleto", "pagamento", "financeiro"]
  },
  {
    intent: "horario",
    destination: "informacoes",
    terms: ["horario", "abre", "fecha", "funciona"]
  },
  {
    intent: "localizacao",
    destination: "informacoes",
    terms: ["endereco", "onde fica", "mapa", "como chegar"]
  }
];

const UNKNOWN_INTENT = Object.freeze({
  intent: "unknown",
  confidence: 0,
  destination: "personality"
});

export function detectIntent(message = "") {
  const normalized = normalizeIntentText(message);
  if (!normalized) return { ...UNKNOWN_INTENT };

  let genericOrderMatch = null;
  for (const definition of PRIORITIZED_INTENTS) {
    const matches = definition.terms.filter((term) => includesTerm(normalized, normalizeIntentText(term)));
    if (matches.length > 0) {
      if (definition.intent === "pedido" && matches.length === 1 && matches[0] === "quero") {
        genericOrderMatch = {
          intent: definition.intent,
          confidence: 0.72,
          destination: definition.destination
        };
        continue;
      }
      return {
        intent: definition.intent,
        confidence: scoreConfidence(matches.length, definition.terms.length),
        destination: definition.destination
      };
    }
  }

  if (genericOrderMatch) return genericOrderMatch;
  return { ...UNKNOWN_INTENT };
}

export function normalizeIntentText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesTerm(text, term) {
  if (!term) return false;
  if (term.includes(" ")) return text.includes(term);
  return new RegExp(`(^|\\s)${escapeRegExp(term)}(\\s|$)`).test(text);
}

function scoreConfidence(matchCount, totalTerms) {
  const base = 0.86;
  const extraMatches = Math.max(0, matchCount - 1) * 0.04;
  const coverage = totalTerms > 0 ? Math.min(0.06, matchCount / totalTerms) : 0;
  return Number(Math.min(0.99, base + extraMatches + coverage).toFixed(2));
}

function escapeRegExp(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
