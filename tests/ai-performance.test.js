import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { AiConversionService } from "../src/ai/aiConversionService.js";
import { AiPerformanceService } from "../src/ai/aiPerformanceService.js";
import { ControlledAiService } from "../src/ai/controlledAiService.js";
import { createApp } from "../src/server.js";

test("IA Performance calcula automacao, confianca media, tempo medio e ranking operacional", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-ai-performance-"));
  const performanceService = new AiPerformanceService({ filePath: join(dir, "performance.json"), now: () => new Date("2026-07-06T10:30:00.000Z") });

  try {
    await performanceService.recordConversation({
      createdAt: "2026-07-06T10:00:00.000Z",
      classification: { intent: "pedido", confidence: 0.9 },
      guardrail: { action: "allow_send" },
      approvedToSend: true,
      handoffRequired: false
    }, { responseTimeMs: 1000 });
    await performanceService.recordConversation({
      createdAt: "2026-07-06T10:05:00.000Z",
      classification: { intent: "evento", confidence: 0.6 },
      guardrail: { action: "handoff" },
      approvedToSend: false,
      handoffRequired: true
    }, { responseTimeMs: 3000 });
    await performanceService.recordConversation({
      createdAt: "2026-07-07T11:00:00.000Z",
      classification: { intent: "pedido", confidence: 0.8 },
      guardrail: { action: "allow_send" },
      approvedToSend: true,
      handoffRequired: false
    }, { responseTimeMs: 2000 });

    const summary = await performanceService.summary();
    assert.equal(summary.totalConversations, 3);
    assert.equal(summary.aiResolvedConversations, 2);
    assert.equal(summary.humanTransferredConversations, 1);
    assert.equal(summary.automationRate, 0.6667);
    assert.equal(summary.averageConfidence, 0.7667);
    assert.equal(summary.averageResponseTime, 2000);
    assert.equal(summary.conversationsByHour["10"], 2);
    assert.equal(summary.conversationsByDay["2026-07-06"], 2);
    assert.equal(summary.intentRanking[0].intent, "Pedido");
    assert.equal(summary.intentRanking[0].count, 2);
    assert.equal(summary.handoffsByIntent[0].intent, "Evento");

    const persisted = JSON.parse(await readFile(join(dir, "performance.json"), "utf8"));
    assert.equal(persisted.totalConversations, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("IA Conversao registra somente eventos confirmados por fonte interna", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-ai-conversion-"));
  const conversionService = new AiConversionService({ filePath: join(dir, "conversion.json"), now: () => new Date("2026-07-06T12:00:00.000Z") });

  try {
    await conversionService.recordEvent({ type: "intent_detected", intent: "evento", origin: "whatsapp", source: "controlled_ai" });
    await conversionService.recordEvent({ type: "lead_created", intent: "evento", origin: "whatsapp", source: "crm", referenceId: "lead-1" });
    await conversionService.recordEvent({ type: "quote_requested", intent: "evento", origin: "whatsapp", source: "crm", referenceId: "quote-1" });
    await conversionService.recordEvent({ type: "order_started", intent: "pedido", origin: "whatsapp", source: "mesa", referenceId: "draft-1" });
    await conversionService.recordEvent({ type: "order_completed", intent: "pedido", origin: "whatsapp", source: "mesa", referenceId: "order-1" });
    const rejectedSale = await conversionService.recordEvent({ type: "sale_confirmed", intent: "pedido", origin: "whatsapp", source: "texto_cliente" });
    const confirmedSale = await conversionService.recordEvent({ type: "sale_confirmed", intent: "pedido", origin: "whatsapp", source: "mesa", confirmed: true, referenceId: "sale-1" });

    assert.equal(rejectedSale.ok, false);
    assert.equal(rejectedSale.error, "sale_requires_internal_confirmation");
    assert.equal(confirmedSale.ok, true);

    const summary = await conversionService.summary();
    assert.equal(summary.leadsCreated, 1);
    assert.equal(summary.quotesRequested, 1);
    assert.equal(summary.ordersStarted, 1);
    assert.equal(summary.ordersCompleted, 1);
    assert.equal(summary.confirmedConversions, 1);
    assert.equal(summary.intentRanking.find((item) => item.intent === "pedido").count, 3);
    assert.equal(summary.origins[0].origin, "whatsapp");
    assert.equal(summary.recentEvents.length, 6);

    const persisted = JSON.parse(await readFile(join(dir, "conversion.json"), "utf8"));
    assert.equal(persisted.confirmedConversions, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ControlledAiService registra performance como observacao sem mudar resposta", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-ai-controlled-performance-"));
  const performanceService = new AiPerformanceService({ filePath: join(dir, "performance.json") });
  const service = new ControlledAiService({ performanceService });

  try {
    const result = await service.processMessage({ message: "quero ver o cardapio", responseTimeMs: 700 });
    assert.equal(result.approvedToSend, true);

    const summary = await performanceService.summary();
    assert.equal(summary.totalConversations, 1);
    assert.equal(summary.aiResolvedConversations, 1);
    assert.equal(summary.averageResponseTime, 700);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("dashboard IA Performance expoe rota visual e APIs de leitura", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-ai-performance-dashboard-"));
  const aiPerformanceService = new AiPerformanceService({ filePath: join(dir, "performance.json") });
  const aiConversionService = new AiConversionService({ filePath: join(dir, "conversion.json") });
  const app = createApp({
    aiPerformanceService,
    aiConversionService,
    authMode: "mock"
  });

  try {
    app.listen(0);
    await once(app, "listening");
    const baseUrl = `http://127.0.0.1:${app.address().port}`;

    const page = await fetch(`${baseUrl}/sambah-ai-performance`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SamBah IA Performance/);

    const performance = await fetch(`${baseUrl}/api/sambah-ai/performance`);
    assert.equal(performance.status, 200);
    assert.equal((await performance.json()).storage, "json");

    const conversion = await fetch(`${baseUrl}/api/sambah-ai/conversion`);
    assert.equal(conversion.status, 200);
    assert.equal((await conversion.json()).storage, "json");
  } finally {
    await new Promise((resolve) => app.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
