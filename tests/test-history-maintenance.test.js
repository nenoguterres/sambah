import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetTestHistoryOnce } from "../src/testHistoryMaintenanceService.js";

test("zera históricos uma vez e preserva configuração operacional", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "sambah-history-reset-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  await writeFile(join(dataDir, "audit-logs.json"), JSON.stringify([{ id: "audit-test" }]), "utf8");
  await writeFile(join(dataDir, "whatsapp-conversas.json"), JSON.stringify({ conversas: [{ id: "wa_test" }] }), "utf8");
  await writeFile(join(dataDir, "sambah-pay-payments.json"), JSON.stringify([{ id: "pay-test" }]), "utf8");
  await writeFile(join(dataDir, "auth-users.json"), JSON.stringify({ users: [{ username: "admin" }] }), "utf8");
  await writeFile(join(dataDir, "menu-cache.json"), JSON.stringify({ items: [{ id: "produto" }] }), "utf8");

  const first = await resetTestHistoryOnce({ dataDir, resetId: "test-v1", now: () => new Date("2026-08-27T12:00:00.000Z") });
  assert.equal(first.applied, true);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, "audit-logs.json"), "utf8")), []);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, "whatsapp-conversas.json"), "utf8")), { conversas: [] });
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, "sambah-pay-payments.json"), "utf8")), []);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, "auth-users.json"), "utf8")), { users: [{ username: "admin" }] });
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, "menu-cache.json"), "utf8")), { items: [{ id: "produto" }] });
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, "maintenance-backups/test-v1/audit-logs.json"), "utf8")), [{ id: "audit-test" }]);

  await writeFile(join(dataDir, "audit-logs.json"), JSON.stringify([{ id: "real-after-reset" }]), "utf8");
  const second = await resetTestHistoryOnce({ dataDir, resetId: "test-v1" });
  assert.equal(second.applied, false);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, "audit-logs.json"), "utf8")), [{ id: "real-after-reset" }]);
});
