import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InsanoWorkhubService } from "../src/insanoWorkhubService.js";

test("Workhub grava tarefas no DATA_DIR informado", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "sambah-workhub-runtime-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const dataFile = join(dataDir, "insano-workhub.json");
  const service = new InsanoWorkhubService({ dataFile, idGenerator: () => "teste", now: () => new Date("2026-07-22T00:00:00.000Z") });
  await service.createTask({ sourceModule: "sambah", targetModule: "workhub", title: "Teste de armazenamento" });
  const tasks = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "work_teste");
  assert.equal(tasks[0].title, "Teste de armazenamento");
});
