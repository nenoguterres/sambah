const DEFAULT_MIN_CONFIDENCE = 0.75;

export class AiIntentClassifier {
  constructor({ minConfidence = DEFAULT_MIN_CONFIDENCE } = {}) {
    this.minConfidence = minConfidence;
  }

  classify(message = "") {
    const result = classifyControlledIntent(message);
    const confidence = Number(result.confidence || 0);
    return {
      source: "ai_intent_classifier",
      intent: result.intent || "unknown",
      destination: result.destination || "personality",
      confidence,
      lowConfidence: confidence < this.minConfidence,
      requiresHandoff: confidence < this.minConfidence
    };
  }
}

export function classifyAiIntent(message = "", options = {}) {
  return new AiIntentClassifier(options).classify(message);
}

function classifyControlledIntent(message = "") {
  const text = normalizeText(message);
  if (/(evento|orcamento|orçamento|festa|aniversario|aniversário|casamento|confraternizacao|confraternização)/.test(text)) {
    return { intent: "evento", destination: "controlled_ai", confidence: 0.92 };
  }
  if (/(cardapio|cardápio|menu|opcoes|opções|lanche|pizza|assado|pancho|hot dog|porcao|porção)/.test(text)) {
    return { intent: "cardapio", destination: "controlled_ai", confidence: 0.9 };
  }
  if (/(pedido|delivery|entrega|retirada|buscar|mesa|comer no local)/.test(text)) {
    return { intent: "pedido", destination: "controlled_ai", confidence: 0.88 };
  }
  if (/(financeiro|pagamento|pagar|pix|cartao|cartão|nota fiscal|recibo)/.test(text)) {
    return { intent: "financeiro", destination: "controlled_ai", confidence: 0.86 };
  }
  if (/(horario|horário|abre|fecha|funciona|atendimento)/.test(text)) {
    return { intent: "horario", destination: "controlled_ai", confidence: 0.84 };
  }
  if (/(endereco|endereço|localizacao|localização|onde fica|chegar)/.test(text)) {
    return { intent: "localizacao", destination: "controlled_ai", confidence: 0.84 };
  }
  if (/(humano|atendente|pessoa|responsavel|responsável|kazuko)/.test(text)) {
    return { intent: "humano", destination: "controlled_ai", confidence: 0.82 };
  }
  return { intent: "unknown", destination: "controlled_ai", confidence: 0.35 };
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
