import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAY_PEROLA_SIGNAL_CREATED, PayPerolaBridgeService } from "../src/payPerolaBridgeService.js";
import { PayPerolaBridgeController } from "../src/sambahPay/controllers/payPerolaBridgeController.js";
import { createApp } from "../src/server.js";

test("bridge Pay Perola registra e lista sinais e sugestoes em JSON local", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "pay-perola-bridge-"));
  const service = new PayPerolaBridgeService({
    dataDir,
    now: () => new Date("2026-06-19T12:00:00.000Z"),
    idGenerator: (() => {
      let sequence = 0;
      return () => `pay-bridge-${++sequence}`;
    })()
  });

  try {
    const signal = await service.registrarSinalPay({ tipo: "pagamento_confirmado", valor: 79.9 });
    const suggestion = await service.registrarSugestaoPerola({ tipo: "campanha", titulo: "Cliente recorrente" });

    assert.deepEqual(signal, {
      id: "pay-bridge-1",
      origem: "pay",
      tipo: "pagamento_confirmado",
      valor: 79.9,
      registradoEm: "2026-06-19T12:00:00.000Z"
    });
    assert.deepEqual(suggestion, {
      id: "pay-bridge-2",
      origem: "perola",
      tipo: "campanha",
      titulo: "Cliente recorrente",
      registradoEm: "2026-06-19T12:00:00.000Z"
    });
    assert.deepEqual(await service.listarSinais(), [signal]);
    assert.deepEqual(await service.listarSugestoes(), [suggestion]);

    const persistedSignals = JSON.parse(await readFile(join(dataDir, "pay-perola-signals.json"), "utf8"));
    const persistedSuggestions = JSON.parse(await readFile(join(dataDir, "pay-perola-suggestions.json"), "utf8"));
    assert.deepEqual(persistedSignals, [signal]);
    assert.deepEqual(persistedSuggestions, [suggestion]);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("bridge Pay Perola preserva sinais em registros simultaneos", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "pay-perola-bridge-"));
  const service = new PayPerolaBridgeService({ dataDir });

  try {
    await Promise.all([
      service.registrarSinalPay({ tipo: "checkout" }),
      service.registrarSinalPay({ tipo: "wallet_topup" })
    ]);

    assert.equal((await service.listarSinais()).length, 2);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("bridge Pay Perola publica pay.perola.signal.created ao registrar sinal", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "pay-perola-bridge-"));
  const published = [];
  const service = new PayPerolaBridgeService({
    dataDir,
    eventBus: { publish: async (event) => published.push(event) },
    idGenerator: () => "pay-signal-event-1"
  });

  try {
    const signal = await service.registrarSinalPay({ tipo: "pagamento_confirmado", valor: 49.9 });

    assert.equal(published.length, 1);
    assert.deepEqual(published[0], {
      type: PAY_PEROLA_SIGNAL_CREATED,
      source: "sambah-pay",
      aggregateType: "pay_perola_signal",
      aggregateId: signal.id,
      payload: signal,
      metadata: { origin: "pay_perola_bridge" }
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("controller Pay Perola expoe CRUD basico usando exclusivamente o servico", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "pay-perola-controller-"));
  const service = new PayPerolaBridgeService({ dataDir });
  const controller = new PayPerolaBridgeController({ payPerolaBridgeService: service });
  const server = createApp({ payPerolaController: controller, authMode: "mock" });

  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const signalResponse = await fetch(`${baseUrl}/api/pay-perola/signals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "pagamento_confirmado", valor: 29.9 })
    });
    const signalBody = await signalResponse.json();
    assert.equal(signalResponse.status, 201);
    assert.equal(signalBody.ok, true);
    assert.equal(signalBody.signal.origem, "pay");

    const signalsResponse = await fetch(`${baseUrl}/api/pay-perola/signals`);
    const signalsBody = await signalsResponse.json();
    assert.equal(signalsResponse.status, 200);
    assert.equal(signalsBody.total, 1);
    assert.equal(signalsBody.items[0].tipo, "pagamento_confirmado");

    const suggestionResponse = await fetch(`${baseUrl}/api/pay-perola/suggestions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "campanha", titulo: "Oferta Pay" })
    });
    const suggestionBody = await suggestionResponse.json();
    assert.equal(suggestionResponse.status, 201);
    assert.equal(suggestionBody.ok, true);
    assert.equal(suggestionBody.suggestion.origem, "perola");

    const suggestionsResponse = await fetch(`${baseUrl}/api/pay-perola/suggestions`);
    const suggestionsBody = await suggestionsResponse.json();
    assert.equal(suggestionsResponse.status, 200);
    assert.equal(suggestionsBody.total, 1);
    assert.equal(suggestionsBody.items[0].titulo, "Oferta Pay");

    const perolaPage = await fetch(`${baseUrl}/perola`);
    const perolaHtml = await perolaPage.text();
    assert.equal(perolaPage.status, 200);
    assert.match(perolaHtml, /Pay ↔ Pérola/);
    assert.match(perolaHtml, /payPerolaSignals/);
    assert.match(perolaHtml, /payPerolaSuggestions/);

    const payPage = await fetch(`${baseUrl}/sambah-pay`);
    const payHtml = await payPage.text();
    assert.equal(payPage.status, 200);
    assert.match(payHtml, /id="payPerolaHeading">Pérola/);
    assert.match(payHtml, /perolaSuggestionsList/);
    assert.match(payHtml, /sambah-pay\.css/);

    const payCss = await fetch(`${baseUrl}/sambah-pay.css`);
    assert.equal(payCss.status, 200);
    assert.match(await payCss.text(), /\.eco-bridge-row/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
