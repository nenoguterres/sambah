import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_PERFORMANCE = Object.freeze({
  totalConversations: 0,
  aiResolvedConversations: 0,
  humanTransferredConversations: 0,
  automationRate: 0,
  responseTimeTotalMs: 0,
  responseTimeCount: 0,
  averageResponseTime: 0,
  confidenceTotal: 0,
  averageConfidence: 0,
  conversationsByHour: {},
  conversationsByDay: {},
  intentDetected: {},
  handoffsByIntent: {}
});

const INTENT_LABELS = {
  pedido: "Pedido",
  cardapio: "Cardapio",
  horario: "Horario",
  evento: "Evento",
  humano: "Humano"
};

export class AiPerformanceService {
  constructor({ filePath = "", now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
  }

  async recordConversation(decision = {}, input = {}) {
    const data = await this.#read();
    const timestamp = parseTimestamp(input.timestamp || decision.createdAt, this.now);
    const intent = normalizeIntent(decision.classification?.intent || decision.intent || "unknown");
    const confidence = Number(decision.classification?.confidence || decision.confidence || 0);
    const responseTimeMs = Number(input.responseTimeMs || decision.responseTimeMs || 0);
    const handoff = Boolean(decision.handoffRequired || decision.guardrail?.action === "handoff");
    const resolvedByAi = decision.approvedToSend === true && !handoff;

    data.totalConversations += 1;
    if (resolvedByAi) data.aiResolvedConversations += 1;
    if (handoff) data.humanTransferredConversations += 1;
    data.intentDetected[intent] = (data.intentDetected[intent] || 0) + 1;
    if (handoff) data.handoffsByIntent[intent] = (data.handoffsByIntent[intent] || 0) + 1;

    data.confidenceTotal = Number((data.confidenceTotal + confidence).toFixed(6));
    data.averageConfidence = calculateAverage(data.confidenceTotal, data.totalConversations);

    if (responseTimeMs > 0) {
      data.responseTimeTotalMs += responseTimeMs;
      data.responseTimeCount += 1;
      data.averageResponseTime = Math.round(data.responseTimeTotalMs / data.responseTimeCount);
    }

    const hourKey = String(timestamp.getUTCHours()).padStart(2, "0");
    const dayKey = timestamp.toISOString().slice(0, 10);
    data.conversationsByHour[hourKey] = (data.conversationsByHour[hourKey] || 0) + 1;
    data.conversationsByDay[dayKey] = (data.conversationsByDay[dayKey] || 0) + 1;
    data.automationRate = calculateAverage(data.aiResolvedConversations, data.totalConversations);
    data.updatedAt = this.now().toISOString();

    await this.#write(data);
    return this.summaryFrom(data);
  }

  async summary() {
    return this.summaryFrom(await this.#read());
  }

  summaryFrom(data = {}) {
    const performance = normalizePerformance(data);
    return {
      ok: true,
      storage: "json",
      totalConversations: performance.totalConversations,
      aiResolvedConversations: performance.aiResolvedConversations,
      humanTransferredConversations: performance.humanTransferredConversations,
      automationRate: performance.automationRate,
      averageResponseTime: performance.averageResponseTime,
      averageConfidence: performance.averageConfidence,
      conversationsByHour: performance.conversationsByHour,
      conversationsByDay: performance.conversationsByDay,
      intentRanking: buildIntentRanking(performance.intentDetected),
      busiestHours: buildRanking(performance.conversationsByHour, "hour"),
      busiestDays: buildRanking(performance.conversationsByDay, "day"),
      handoffsByIntent: buildIntentRanking(performance.handoffsByIntent),
      updatedAt: performance.updatedAt || null
    };
  }

  async #read() {
    if (!this.filePath) return normalizePerformance();
    try {
      return normalizePerformance(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") return normalizePerformance();
      return normalizePerformance();
    }
  }

  async #write(data) {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(normalizePerformance(data), null, 2)}\n`, "utf8");
  }
}

function normalizePerformance(data = {}) {
  return {
    ...EMPTY_PERFORMANCE,
    ...data,
    totalConversations: Number(data.totalConversations || 0),
    aiResolvedConversations: Number(data.aiResolvedConversations || 0),
    humanTransferredConversations: Number(data.humanTransferredConversations || 0),
    automationRate: Number(data.automationRate || 0),
    responseTimeTotalMs: Number(data.responseTimeTotalMs || 0),
    responseTimeCount: Number(data.responseTimeCount || 0),
    averageResponseTime: Number(data.averageResponseTime || 0),
    confidenceTotal: Number(data.confidenceTotal || 0),
    averageConfidence: Number(data.averageConfidence || 0),
    conversationsByHour: { ...(data.conversationsByHour || {}) },
    conversationsByDay: { ...(data.conversationsByDay || {}) },
    intentDetected: { ...(data.intentDetected || {}) },
    handoffsByIntent: { ...(data.handoffsByIntent || {}) }
  };
}

function calculateAverage(total, count) {
  return count > 0 ? Number((total / count).toFixed(4)) : 0;
}

function normalizeIntent(intent = "") {
  const key = String(intent || "unknown").toLowerCase();
  return INTENT_LABELS[key] ? key : "outras";
}

function buildIntentRanking(values = {}) {
  return Object.entries(values)
    .map(([intent, count]) => ({ key: intent, intent: INTENT_LABELS[intent] || "Outras", count }))
    .sort((left, right) => right.count - left.count || left.intent.localeCompare(right.intent));
}

function buildRanking(values = {}, keyName = "key") {
  return Object.entries(values)
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((left, right) => right.count - left.count || String(left[keyName]).localeCompare(String(right[keyName])));
}

function parseTimestamp(value, now) {
  const date = value ? new Date(value) : now();
  return Number.isNaN(date.getTime()) ? now() : date;
}
