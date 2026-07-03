import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDemographicTimingContext,
  buildModuleTimingPayloads
} from "../src/ecosystemTimingService.js";

const completeInput = {
  mesa: {
    signalType: "low_traffic_period",
    period: {
      start: "15:00",
      end: "18:00"
    },
    summary: "Baixo movimento no periodo da tarde"
  },
  sambahPay: {
    productFocus: "Espetinho de Frango",
    stockToday: 20,
    soldToday: 1,
    projectedStockTomorrow: 39,
    paymentTrend: "pix"
  },
  sambah: {
    targetDemographic: "clientes_tarde",
    customerSegment: "clientes que costumam responder promocoes no WhatsApp",
    preferredChannel: "whatsapp"
  },
  perola: {
    actionType: "happy_hour",
    campaignIntent: "girar produto em horario fraco",
    tone: "gaucho_colloquial"
  }
};

test("Timing Demografico completo monta contexto unico sem executar modulos", () => {
  const context = buildDemographicTimingContext(completeInput);

  assert.equal(context.readiness, "complete");
  assert.equal(context.strategyType, "demographic_timing");
  assert.deepEqual(context.timingWindow, {
    start: "15:00",
    end: "18:00"
  });
  assert.equal(context.targetDemographic, "clientes_tarde");
  assert.equal(context.productFocus, "Espetinho de Frango");
  assert.equal(context.requiresAdminApproval, true);
  assert.deepEqual(Object.keys(context.modulePlan), ["mesa", "sambah", "sambahPay", "perola"]);
  assert.equal(context.modulePlan.mesa.useOwnRules, true);
  assert.equal(context.modulePlan.sambah.useOwnRules, true);
  assert.equal(context.modulePlan.sambahPay.useOwnRules, true);
  assert.equal(context.modulePlan.perola.useOwnRules, true);
});

test("Timing Demografico incompleto informa fontes ausentes", () => {
  const { sambah, ...withoutSambah } = completeInput;
  const context = buildDemographicTimingContext(withoutSambah);

  assert.equal(context.readiness, "incomplete");
  assert.deepEqual(context.missingSources, ["sambah"]);
  assert.equal(context.requiresAdminApproval, true);
});

test("Timing Demografico gera payloads separados para cada modulo sem executar nada", () => {
  const context = buildDemographicTimingContext(completeInput);
  const payloads = buildModuleTimingPayloads(context);

  assert.deepEqual(Object.keys(payloads), ["mesa", "sambah", "sambahPay", "perola"]);
  assert.equal(payloads.mesa.mesaStatus, "waiting_mesa_ack");
  assert.equal(payloads.sambah.sambahStatus, "waiting_crm_action");
  assert.equal(payloads.sambahPay.payStatus, "waiting_commercial_rule");
  assert.equal(payloads.perola.perolaStatus, "ready_to_create_campaign");
  assert.equal(payloads.mesa.useMesaRules, true);
  assert.equal(payloads.sambah.useSambahRules, true);
  assert.equal(payloads.sambahPay.useSambahPayRules, true);
  assert.equal(payloads.perola.usePerolaRules, true);
});
