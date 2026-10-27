import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SambahAuthService } from "../src/auth/authService.js";

test("sessao operacional sobrevive ao reinicio e renova enquanto o SamBah esta aberto", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-auth-session-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sessionsFile = join(dir, "auth-sessions.json");
  let now = new Date("2026-10-27T12:00:00.000Z");
  const options = {
    sessionsFile,
    secret: "test-secret",
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    sessionRenewMs: 60 * 60 * 1000,
    now: () => now
  };

  const first = new SambahAuthService(options);
  const login = await first.login({ username: "admin", password: "admin123" });
  assert.equal(login.ok, true);
  const cookie = login.cookie.split(";")[0];

  const restarted = new SambahAuthService(options);
  const restored = await restarted.authenticate({ headers: { cookie } });
  assert.equal(restored.user.username, "admin");
  assert.equal(restored.cookie, "");

  now = new Date("2026-10-27T14:00:00.000Z");
  const renewed = await restarted.authenticate({ headers: { cookie } });
  assert.equal(renewed.user.username, "admin");
  assert.match(renewed.cookie, /sambah_session=/);
  const persisted = JSON.parse(await readFile(sessionsFile, "utf8"));
  assert.equal(persisted.sessions.length, 1);
  assert.equal(persisted.sessions[0].expiresAt, "2026-11-03T14:00:00.000Z");

  const restartedAgain = new SambahAuthService({ ...options, now: () => new Date("2026-11-02T12:00:00.000Z") });
  assert.equal((await restartedAgain.authenticate({ headers: { cookie } })).user.username, "admin");
});

test("logout remove do disco a sessao persistente", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-auth-logout-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sessionsFile = join(dir, "auth-sessions.json");
  const service = new SambahAuthService({ sessionsFile, secret: "test-secret" });
  const login = await service.login({ username: "admin", password: "admin123" });
  const request = { headers: { cookie: login.cookie.split(";")[0] } };

  await service.logout(request);

  const restarted = new SambahAuthService({ sessionsFile, secret: "test-secret" });
  assert.equal(await restarted.authenticate(request), null);
});
