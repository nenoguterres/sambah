import { detectIntent } from "../intentEngine.js";

const DEFAULT_MIN_CONFIDENCE = 0.75;

export class AiIntentClassifier {
  constructor({ minConfidence = DEFAULT_MIN_CONFIDENCE } = {}) {
    this.minConfidence = minConfidence;
  }

  classify(message = "") {
    const result = detectIntent(message);
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
