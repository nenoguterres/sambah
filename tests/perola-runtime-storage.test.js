import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PerolaService } from "../src/perolaService.js";

test("Perola cria colecoes operacionais no DATA_DIR informado", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "sambah-perola-runtime-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const service = new PerolaService({ dataDir });
  await service.ready;
  const posts = JSON.parse(await readFile(join(dataDir, "perola-posts.json"), "utf8"));
  const rules = JSON.parse(await readFile(join(dataDir, "perola-rules.json"), "utf8"));
  assert.ok(Array.isArray(posts));
  assert.ok(Array.isArray(rules));
  assert.ok(posts.length >= 1);
  assert.ok(rules.length >= 1);
});
