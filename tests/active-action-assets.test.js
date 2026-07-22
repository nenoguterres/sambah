import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("mantem somente os cards de acao usados pela tela publica", async () => {
  const active = [
    "public/assets/brand/actions/01-agendar-foodtruck-beertruck-insano.png",
    "public/assets/brand/actions/02-pedidos-insano-crop.png",
    "public/assets/brand/actions/03-pedidos-buteco-xeriffe-crop.png",
    "public/assets/brand/actions/04-falar-watts-atendimento-crop.png"
  ];
  const removed = [
    "public/assets/brand/actions/02-pedidos-insano.png",
    "public/assets/brand/actions/03-pedidos-buteco-xeriffe.png",
    "public/assets/brand/actions/04-falar-watts-atendimento.png",
    "public/assets/brand/actions/card-atendimento.png",
    "public/assets/brand/actions/card-pedidos-insano.png",
    "public/assets/brand/actions/card-xeriffe.png",
    "public/assets/brand/sambah-pay-logo-before-clipboard.png",
    "public/assets/brand/sambah-pay-logo-original.png"
  ];
  for (const path of active) assert.equal(await exists(path), true, path);
  for (const path of removed) assert.equal(await exists(path), false, path);
});
