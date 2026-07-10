import { AiGuardrailsService } from "./aiGuardrailsService.js";
import { AiIntentClassifier } from "./aiIntentClassifier.js";
import { AiResponseDraftService } from "./aiResponseDraftService.js";

export class ControlledAiService {
  constructor({
    classifier = new AiIntentClassifier(),
    guardrails = new AiGuardrailsService(),
    draftService = new AiResponseDraftService(),
    router = routeControlledAiDecision,
    auditService = null,
    metricsService = null,
    aiAuditService = null,
    performanceService = null,
    now = () => new Date()
  } = {}) {
    this.classifier = classifier;
    this.guardrails = guardrails;
    this.draftService = draftService;
    this.router = router;
    this.auditService = auditService;
    this.metricsService = metricsService;
    this.aiAuditService = aiAuditService;
    this.performanceService = performanceService;
    this.now = now;
  }

  async processMessage({ message = "", context = {}, internalSources = {}, ...metadata } = {}) {
    const classification = this.classifier.classify(message);
    const extractedData = extractControlledData(message);
    const routeIntent = classification.requiresHandoff ? "humano" : classification.intent;
    const route = this.router({ ...classification, intent: routeIntent });
    const draft = this.draftService.suggest({ classification, route, extractedData, context });
    const guardrail = this.guardrails.validate({
      text: draft.text,
      internalSources,
      route,
      classification
    });
    const result = {
      ok: true,
      source: "controlled_ai_service",
      createdAt: this.now().toISOString(),
      classification,
      extractedData,
      route,
      draft,
      guardrail,
      approvedToSend: guardrail.approved === true && guardrail.action === "allow_send",
      responseText: guardrail.approved === true && guardrail.action === "allow_send" ? draft.text : "",
      handoffRequired: guardrail.action === "handoff" || classification.requiresHandoff || route.requiresHuman
    };

    await this.recordAudit(result, { message, context });
    await this.recordObservability(result, { message, context, ...metadata });
    return result;
  }

  async recordAudit(result, input = {}) {
    if (!this.auditService || typeof this.auditService.record !== "function") return;
    await this.auditService.record({
      type: "controlled_ai_decision",
      status: result.approvedToSend ? "info" : "warning",
      source: "controlled_ai",
      message: result.approvedToSend ? "IA controlada aprovou sugestao" : "IA controlada bloqueou ou enviou para humano",
      context: {
        createdAt: result.createdAt,
        intent: result.classification.intent,
        confidence: result.classification.confidence,
        route: result.route,
        guardrail: {
          approved: result.guardrail.approved,
          action: result.guardrail.action,
          reason: result.guardrail.reason,
          violations: result.guardrail.violations
        },
        extractedData: result.extractedData,
        messageLength: String(input.message || "").length
      }
    });
  }

  async recordObservability(result, input = {}) {
    if (this.metricsService && typeof this.metricsService.recordDecision === "function") {
      await this.metricsService.recordDecision(result);
    }
    if (this.aiAuditService && typeof this.aiAuditService.recordDecision === "function") {
      await this.aiAuditService.recordDecision(result, input);
    }
    if (this.performanceService && typeof this.performanceService.recordConversation === "function") {
      await this.performanceService.recordConversation(result, input);
    }
  }
}

export function extractControlledData(message = "") {
  const text = String(message || "");
  return {
    peopleCount: extractPeopleCount(text),
    dates: extractDates(text),
    phoneNumbers: extractPhoneNumbers(text),
    mentionedProducts: extractProducts(text)
  };
}

export function routeControlledAiDecision(classification = {}) {
  const intent = classification.intent || "unknown";
  if (intent === "humano" || intent === "unknown") {
    return {
      module: "human",
      queue: "atendimento",
      priority: intent === "humano" ? "high" : "normal",
      requiresHuman: true,
      nextAction: "human_review"
    };
  }
  if (intent === "evento") {
    return {
      module: "crm",
      queue: "eventos",
      priority: "high",
      requiresHuman: false,
      nextAction: "review_event_request"
    };
  }
  if (intent === "pedido" || intent === "delivery" || intent === "retirada" || intent === "local" || intent === "cardapio") {
    return {
      module: "assisted_service",
      queue: "pedidos",
      priority: "normal",
      requiresHuman: false,
      nextAction: "review_order_request"
    };
  }
  return {
    module: "support",
    queue: "triagem",
    priority: "normal",
    requiresHuman: false,
    nextAction: "review_message"
  };
}

function extractPeopleCount(text = "") {
  const match = text.match(/\b(\d{1,4})\s*(pessoas|convidados|clientes)\b/i);
  return match ? Number(match[1]) : null;
}

function extractDates(text = "") {
  return Array.from(text.matchAll(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g), (match) => match[0]);
}

function extractPhoneNumbers(text = "") {
  return Array.from(text.matchAll(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b/g), (match) => match[0].trim());
}

function extractProducts(text = "") {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return [
    "hamburguer",
    "assado",
    "pizza",
    "pancho",
    "hot dog",
    "panbagnat",
    "porcao",
    "batata",
    "espetinho"
  ].filter((product) => normalized.includes(product));
}
