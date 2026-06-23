import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SambahPerolaBridgeService } from "../src/sambahPerolaBridgeService.js";

test("bridge SamBah Perola registra e lista sinais e sugestoes em JSON local", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "sambah-perola-bridge-"));
  const service = new SambahPerolaBridgeService({
    dataDir,
    now: () => new Date("2026-06-19T12:00:00.000Z"),
    idGenerator: (() => {
      let sequence = 0;
      return () => `bridge-${++sequence}`;
    })()
  });

  try {
    const signal = await service.registrarSinalSambah({ tipo: "venda_detectada", valor: 59.9 });
    const suggestion = await service.registrarSugestaoPerola({ tipo: "campanha", titulo: "Giro do dia" });

    assert.deepEqual(signal, {
      id: "bridge-1",
      origem: "sambah",
      tipo: "venda_detectada",
      valor: 59.9,
      registradoEm: "2026-06-19T12:00:00.000Z"
    });
    assert.deepEqual(suggestion, {
      id: "bridge-2",
      origem: "perola",
      tipo: "campanha",
      titulo: "Giro do dia",
      registradoEm: "2026-06-19T12:00:00.000Z"
    });
    assert.deepEqual(await service.listarSinais(), [signal]);
    assert.deepEqual(await service.listarSugestoes(), [suggestion]);

    const persistedSignals = JSON.parse(await readFile(join(dataDir, "sambah-perola-signals.json"), "utf8"));
    const persistedSuggestions = JSON.parse(await readFile(join(dataDir, "sambah-perola-suggestions.json"), "utf8"));
    assert.deepEqual(persistedSignals, [signal]);
    assert.deepEqual(persistedSuggestions, [suggestion]);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("bridge SamBah Perola preserva registros em chamadas simultaneas", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "sambah-perola-bridge-"));
  const service = new SambahPerolaBridgeService({ dataDir });

  try {
    await Promise.all([
      service.registrarSinalSambah({ tipo: "pedido" }),
      service.registrarSinalSambah({ tipo: "pagamento" })
    ]);

    assert.equal((await service.listarSinais()).length, 2);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

