import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMesaOperationalSignal,
  buildMesaReceivedCommercialAction
} from "../src/mesaService.js";

test("buildMesaOperationalSignal cria sinal operacional padronizado do Mesa", () => {
  const signal = buildMesaOperationalSignal({
    type: "low_traffic_period",
    period: {
      start: "15:00",
      end: "18:00"
    },
    summary: "Baixo movimento no periodo da tarde",
    severity: "medium"
  });

  assert.equal(signal.source, "mesa");
  assert.equal(signal.signalType, "low_traffic_period");
  assert.deepEqual(signal.period, {
    start: "15:00",
    end: "18:00"
  });
  assert.equal(signal.status, "detected");
  assert.equal(signal.severity, "medium");
});

test("buildMesaReceivedCommercialAction prepara acao aprovada do Perola para o Mesa", () => {
  const action = buildMesaReceivedCommercialAction({
    id: "action-001",
    origin: "perola",
    type: "happy_hour",
    status: "approved",
    title: "Happy Hour da Tarde",
    description: "Acao aprovada para horario de baixo movimento.",
    startsAt: "15:00",
    endsAt: "18:00"
  });

  assert.deepEqual(action, {
    source: "perola",
    status: "approved",
    actionId: "action-001",
    actionType: "happy_hour",
    title: "Happy Hour da Tarde",
    description: "Acao aprovada para horario de baixo movimento.",
    productId: "",
    productName: "",
    product: {
      id: "",
      name: ""
    },
    channels: ["Cardapio do Mesa", "Telas do Mesa", "SamBah"],
    startsAt: "15:00",
    endsAt: "18:00",
    mesaStatus: "waiting_mesa_ack",
    requiresCashierOk: true,
    useMesaRules: true
  });
  assert.equal(action.source, "perola");
  assert.equal(action.mesaStatus, "waiting_mesa_ack");
  assert.equal(action.requiresCashierOk, true);
  assert.equal(action.useMesaRules, true);
});

test("buildMesaReceivedCommercialAction ignora acao sem aprovacao", () => {
  const action = buildMesaReceivedCommercialAction({
    id: "action-002",
    origin: "perola",
    type: "happy_hour",
    status: "pending_approval",
    title: "Happy Hour pendente"
  });

  assert.equal(action, null);
});
