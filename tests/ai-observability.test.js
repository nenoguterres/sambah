import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { ControlledAiService } from "../src/ai/controlledAiService.js";
import { AiAuditService } from "../src/ai/aiAuditService.js";
import { AiGuardrailsService } from "../src/ai/aiGuardrailsService.js";
import { AiMetricsService } from "../src/ai/aiMetricsService.js";
import { createApp } from "../src/server.js";

test("observabilidade da IA registra metricas, auditoria, intencoes, bloqueios e confianca media", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-ai-observability-"));
  const metricsFile = join(dir, "metrics.json");
  const auditFile = join(dir, "audit.json");
  const metricsService = new AiMetricsService({ filePath: metricsFile, now: () => new Date("2026-07-06T13:00:00.000Z") });
  const aiAuditService = new AiAuditService({ filePath: auditFile, now: () => new Date("2026-07-06T13:00:00.000Z") });
  const service = new ControlledAiService({ metricsService, aiAuditService });

  try {
    await service.processMessage({
      message: "quero ver o cardapio",
      context: { phone: "5551980413745" }
    });
    await service.processMessage({
      message: "assunto sem contexto suficiente",
      context: { phone: "5551980413746" }
    });
    await metricsService.recordDecision({
      classification: { intent: "pedido", confidence: 0.9, lowConfidence: false },
      guardrail: {
        approved: false,
        action: "block_send",
        reason: "guardrail_blocked",
        violations: [{ code: "missing_internal_source_price" }]
      },
      approvedToSend: false,
      handoffRequired: false
    });

    const summary = await metricsService.summary();
    assert.equal(summary.messagesAnalyzed, 3);
    assert.equal(summary.approvedResponses, 1);
    assert.equal(summary.blockedResponses, 1);
    assert.equal(summary.humanHandoffs, 1);
    assert.equal(summary.lowConfidenceEvents, 1);
    assert.equal(summary.intentDetected.cardapio, 1);
    assert.equal(summary.intentDetected.outras, 1);
    assert.equal(summary.intentDetected.pedido, 1);
    assert.equal(summary.averageConfidence, 0.6067);
    assert.deepEqual(summary.intentRanking.map((item) => item.intent).sort(), ["Cardapio", "Outras", "Pedido"]);
    assert.ok(summary.blockReasons.some((item) => item.label === "preco sem fonte interna" && item.count === 1));
    assert.ok(summary.blockReasons.some((item) => item.label === "baixa confianca" && item.count >= 1));

    const audit = await aiAuditService.list();
    assert.equal(audit.total, 2);
    assert.equal(audit.items[0].phone, "*********3746");
    assert.equal(audit.items[0].approvedToSend, false);
    assert.equal(audit.items[1].intent, "cardapio");
    assert.equal(audit.items[1].decision, "allow_send");

    const persistedMetrics = JSON.parse(await readFile(metricsFile, "utf8"));
    const persistedAudit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.equal(persistedMetrics.messagesAnalyzed, 3);
    assert.equal(persistedAudit.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("guardrail expõe motivo padronizado para bloqueio operacional", () => {
  const guardrails = new AiGuardrailsService();
  const result = guardrails.validate({
    text: "Pedido confirmado por R$ 40 com pagamento aprovado.",
    classification: { intent: "pedido", confidence: 0.95 },
    route: { requiresHuman: false },
    internalSources: {}
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "guardrail_blocked");
  assert.ok(result.violations.some((item) => item.code === "missing_internal_source_price"));
  assert.ok(result.violations.some((item) => item.code === "missing_internal_source_payment"));
});

test("dashboard IA expõe rota visual e endpoints de observabilidade sem acionar modulos operacionais", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-ai-dashboard-"));
  const metricsService = new AiMetricsService({ filePath: join(dir, "metrics.json") });
  const aiAuditService = new AiAuditService({ filePath: join(dir, "audit.json") });
  const app = createApp({
    aiMetricsService: metricsService,
    aiAuditService,
    authMode: "mock"
  });

  try {
    app.listen(0);
    await once(app, "listening");
    const baseUrl = `http://127.0.0.1:${app.address().port}`;

    const page = await fetch(`${baseUrl}/sambah-ai`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SamBah IA Controlada/);

    const metrics = await fetch(`${baseUrl}/api/sambah-ai/metrics`);
    assert.equal(metrics.status, 200);
    const metricsJson = await metrics.json();
    assert.equal(metricsJson.storage, "json");
    assert.equal(metricsJson.messagesAnalyzed, 0);

    const audit = await fetch(`${baseUrl}/api/sambah-ai/audit`);
    assert.equal(audit.status, 200);
    const auditJson = await audit.json();
    assert.deepEqual(auditJson.items, []);
  } finally {
    await new Promise((resolve) => app.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
