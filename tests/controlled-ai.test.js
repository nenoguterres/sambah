import test from "node:test";
import assert from "node:assert/strict";
import { ControlledAiService } from "../src/ai/controlledAiService.js";
import { AiGuardrailsService } from "../src/ai/aiGuardrailsService.js";
import { classifyAiIntent } from "../src/ai/aiIntentClassifier.js";

test("IA controlada classifica intencao e extrai dados sem executar acao final", async () => {
  const audit = [];
  const service = new ControlledAiService({
    auditService: { record: async (entry) => audit.push(entry) },
    now: () => new Date("2026-07-06T12:00:00.000Z")
  });

  const result = await service.processMessage({ message: "Preciso de orcamento para evento com 80 pessoas dia 12/07" });

  assert.equal(result.classification.intent, "evento");
  assert.equal(result.route.module, "crm");
  assert.equal(result.extractedData.peopleCount, 80);
  assert.deepEqual(result.extractedData.dates, ["12/07"]);
  assert.equal(result.approvedToSend, true);
  assert.match(result.responseText, /evento/i);
  assert.doesNotMatch(result.responseText, /R\$|desconto|pedido confirmado|pagamento aprovado/i);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].type, "controlled_ai_decision");
});

test("IA guardrail bloqueia preco, desconto, prazo e pagamento sem fonte interna", () => {
  const guardrails = new AiGuardrailsService();
  const result = guardrails.validate({
    text: "Fechado, teu pedido confirmado fica por R$ 30 com 10% de desconto e pagamento aprovado em 10 minutos.",
    classification: { intent: "pedido", confidence: 0.95 },
    route: { requiresHuman: false },
    internalSources: {}
  });

  assert.equal(result.approved, false);
  assert.equal(result.action, "block_send");
  assert.ok(result.violations.some((item) => item.code === "final_action_not_allowed"));
  assert.ok(result.violations.some((item) => item.code === "missing_internal_source_price"));
  assert.ok(result.violations.some((item) => item.code === "missing_internal_source_discount"));
  assert.ok(result.violations.some((item) => item.code === "missing_internal_source_payment"));
});

test("IA controlada envia baixa confianca para handoff humano", async () => {
  const service = new ControlledAiService();
  const result = await service.processMessage({ message: "buenas, coisa aleatoria sem contexto" });

  assert.equal(result.classification.intent, "unknown");
  assert.equal(result.classification.requiresHandoff, true);
  assert.equal(result.route.module, "human");
  assert.equal(result.handoffRequired, true);
  assert.equal(result.approvedToSend, false);
  assert.equal(result.responseText, "");
  assert.equal(result.guardrail.action, "handoff");
});

test("IA so libera resposta aprovada depois do guardrail", async () => {
  const service = new ControlledAiService();
  const result = await service.processMessage({ message: "quero ver o cardapio" });

  assert.equal(result.classification.intent, "cardapio");
  assert.equal(result.guardrail.approved, true);
  assert.equal(result.guardrail.action, "allow_send");
  assert.equal(result.approvedToSend, true);
  assert.ok(result.responseText.length > 0);
});

test("classificador de IA respeita limite minimo de confianca", () => {
  const result = classifyAiIntent("oi", { minConfidence: 0.8 });
  assert.equal(result.intent, "unknown");
  assert.equal(result.requiresHandoff, true);
});
