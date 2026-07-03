import test from "node:test";
import assert from "node:assert/strict";
import {
  approvePerolaCommercialActionByAdmin,
  buildPerolaCommercialActionFromTiming
} from "../src/perolaService.js";
import {
  buildEcosystemDistributionPackage,
  buildMesaPackageFromDistribution,
  buildPerolaPackageFromDistribution,
  buildSambahPackageFromDistribution,
  buildSambahPayPackageFromDistribution
} from "../src/ecosystemIntegrationService.js";

test("pacote de distribuicao exige acao aprovada pelo admin", () => {
  const action = buildPerolaCommercialActionFromTiming(demographicTimingInput());
  const distribution = buildEcosystemDistributionPackage(action);

  assert.equal(distribution.integrationStatus, "not_ready_for_distribution");
  assert.equal(distribution.reason, "action_not_approved_by_admin");
});

test("pacote aprovado prepara targets dos quatro gestores sem execucao automatica", () => {
  const distribution = approvedDistributionPackage();

  assert.equal(distribution.integrationStatus, "ready_for_module_ack");
  assert.deepEqual(Object.keys(distribution.targets), ["mesa", "sambah", "sambahPay", "perola"]);
  assert.equal(distribution.targets.mesa.executeAutomatically, false);
  assert.equal(distribution.targets.sambah.executeAutomatically, false);
  assert.equal(distribution.targets.sambahPay.executeAutomatically, false);
  assert.equal(distribution.targets.perola.executeAutomatically, false);
});

test("payloads especificos de modulo ficam prontos para ciencia sem executar nada", () => {
  const distribution = approvedDistributionPackage();
  const mesa = buildMesaPackageFromDistribution(distribution);
  const sambah = buildSambahPackageFromDistribution(distribution);
  const sambahPay = buildSambahPayPackageFromDistribution(distribution);
  const perola = buildPerolaPackageFromDistribution(distribution);

  assert.equal(mesa.mesaStatus, "waiting_mesa_ack");
  assert.equal(mesa.requiresCashierOk, true);
  assert.equal(mesa.useMesaRules, true);
  assert.equal(sambah.sambahStatus, "waiting_crm_action");
  assert.equal(sambah.useSambahRules, true);
  assert.equal(sambahPay.payStatus, "waiting_commercial_rule");
  assert.equal(sambahPay.useSambahPayRules, true);
  assert.equal(perola.perolaStatus, "waiting_campaign_execution");
  assert.equal(perola.usePerolaRules, true);

  for (const payload of [mesa, sambah, sambahPay, perola]) {
    assert.equal(payload.executeAutomatically, false);
    assert.notEqual(payload.executeAutomatically, true);
  }
});

function approvedDistributionPackage() {
  const action = buildPerolaCommercialActionFromTiming(demographicTimingInput());
  const approval = approvePerolaCommercialActionByAdmin(action, {
    role: "admin",
    authorized: true,
    userId: "admin-local"
  });
  return buildEcosystemDistributionPackage(approval.action);
}

function demographicTimingInput() {
  return {
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
}
