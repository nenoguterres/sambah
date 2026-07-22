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

test("mantem assets oficiais e remove rejeitados e copias exatas", async () => {
  assert.equal(await exists("public/assets/brand/logo-sambah-oficial.png"), true);
  assert.equal(await exists("public/assets/brand/capbah-oficial.png"), true);
  assert.equal(await exists("public/assets/rejeitados"), false);
  assert.equal(await exists("public/assets/brand/oficial/logo-sambah-oficial.png"), false);
  assert.equal(await exists("public/assets/brand/oficial/capbah-oficial.png"), false);
  assert.equal(await exists("public/assets/brand/actions/card-foodtruck.png"), false);
  assert.equal(await exists("public/assets/brand/actions/card-atendimento-crop.png"), false);
});
