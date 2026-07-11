import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_METRICS = Object.freeze({
  messagesAnalyzed: 0,
  intentDetected: {},
  approvedResponses: 0,
  blockedResponses: 0,
  humanHandoffs: 0,
  lowConfidenceEvents: 0,
  confidenceTotal: 0,
  averageConfidence: 0,
  blockReasons: {}
});

const INTENT_GROUPS = {
  pedido: "Pedido",
  cardapio: "Cardapio",
  horario: "Horario",
  evento: "Evento",
  humano: "Humano"
};

const BLOCK_REASON_GROUPS = {
  missing_internal_source_price: "preco sem fonte interna",
  missing_internal_source_discount: "desconto sem autorizacao",
  missing_internal_source_deadline: "prazo sem validacao",
  missing_internal_source_payment: "pagamento",
  human_handoff_required: "baixa confianca",
  low_confidence: "baixa confianca",
  final_action_not_allowed: "regra operacional"
};

export class AiMetricsService {
  constructor({ filePath = "", now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
  }

  async recordDecision(decision = {}) {
    const data = await this.#read();
    const confidence = Number(decision.classification?.confidence || decision.confidence || 0);
    const intent = normalizeIntent(decision.classification?.intent || decision.intent || "unknown");
    const handoff = Boolean(decision.handoffRequired || decision.guardrail?.action === "handoff");
    const approved = decision.approvedToSend === true;

    data.messagesAnalyzed += 1;
    data.intentDetected[intent] = (data.intentDetected[intent] || 0) + 1;
    data.confidenceTotal = Number((data.confidenceTotal + confidence).toFixed(6));
    data.averageConfidence = data.messagesAnalyzed > 0
      ? Number((data.confidenceTotal / data.messagesAnalyzed).toFixed(4))
      : 0;

    if (approved) data.approvedResponses += 1;
    if (!approved && !handoff) data.blockedResponses += 1;
    if (handoff) data.humanHandoffs += 1;
    if (decision.classification?.lowConfidence || confidence < 0.75) data.lowConfidenceEvents += 1;

    for (const reason of collectBlockReasons(decision)) {
      data.blockReasons[reason] = (data.blockReasons[reason] || 0) + 1;
    }

    data.updatedAt = this.now().toISOString();
    await this.#write(data);
    return this.summaryFrom(data);
  }

  async summary() {
    return this.summaryFrom(await this.#read());
  }

  summaryFrom(data = {}) {
    const metrics = normalizeMetrics(data);
    return {
      ok: true,
      storage: "json",
      messagesAnalyzed: metrics.messagesAnalyzed,
      intentDetected: metrics.intentDetected,
      approvedResponses: metrics.approvedResponses,
      blockedResponses: metrics.blockedResponses,
      humanHandoffs: metrics.humanHandoffs,
      lowConfidenceEvents: metrics.lowConfidenceEvents,
      averageConfidence: metrics.averageConfidence,
      intentRanking: buildIntentRanking(metrics.intentDetected),
      blockReasons: buildBlockReasonRanking(metrics.blockReasons),
      updatedAt: metrics.updatedAt || null
    };
  }

  async #read() {
    if (!this.filePath) return normalizeMetrics();
    try {
      return normalizeMetrics(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") {
        return normalizeMetrics();
      }
      return normalizeMetrics();
    }
  }

  async #write(data) {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(normalizeMetrics(data), null, 2)}\n`, "utf8");
  }
}

function normalizeMetrics(data = {}) {
  return {
    ...EMPTY_METRICS,
    ...data,
    intentDetected: { ...(data.intentDetected || {}) },
    blockReasons: { ...(data.blockReasons || {}) },
    messagesAnalyzed: Number(data.messagesAnalyzed || 0),
    approvedResponses: Number(data.approvedResponses || 0),
    blockedResponses: Number(data.blockedResponses || 0),
    humanHandoffs: Number(data.humanHandoffs || 0),
    lowConfidenceEvents: Number(data.lowConfidenceEvents || 0),
    confidenceTotal: Number(data.confidenceTotal || 0),
    averageConfidence: Number(data.averageConfidence || 0)
  };
}

function normalizeIntent(intent = "") {
  const key = String(intent || "unknown").toLowerCase();
  return INTENT_GROUPS[key] ? key : "outras";
}

function buildIntentRanking(intentDetected = {}) {
  return Object.entries(intentDetected)
    .map(([intent, count]) => ({ intent: INTENT_GROUPS[intent] || "Outras", key: intent, count }))
    .sort((a, b) => b.count - a.count || a.intent.localeCompare(b.intent));
}

function buildBlockReasonRanking(blockReasons = {}) {
  return Object.entries(blockReasons)
    .map(([reason, count]) => ({ reason, label: BLOCK_REASON_GROUPS[reason] || "outros", count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function collectBlockReasons(decision = {}) {
  const reasons = [];
  if (decision.classification?.lowConfidence) reasons.push("low_confidence");
  if (decision.guardrail?.reason && decision.guardrail.reason !== "approved") reasons.push(decision.guardrail.reason);
  for (const violation of decision.guardrail?.violations || []) {
    if (violation?.code) reasons.push(violation.code);
  }
  return reasons;
}
