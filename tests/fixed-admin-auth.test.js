import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SambahAuthService } from "../src/auth/authService.js";

test("fixed administrator is merged into an existing persistent user store", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sambah-fixed-admin-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const usersFile = join(directory, "auth-users.json");
  await writeFile(usersFile, JSON.stringify({
    users: [{
      username: "atendente",
      displayName: "Atendente",
      role: "ATENDENTE",
      active: true,
      salt: "legacy-salt",
      passwordHash: crypto.scryptSync("legacy-pass", "legacy-salt", 32).toString("hex")
    }]
  }));

  const fixedPassword = "test-pin";
  const fixedSalt = "fixed-admin-test-salt";
  const fixedUsers = [{
    username: "owner.user",
    displayName: "Owner User",
    role: "ADMIN",
    active: true,
    salt: fixedSalt,
    passwordHash: crypto.scryptSync(fixedPassword, fixedSalt, 32).toString("hex")
  }];
  const auth = new SambahAuthService({
    users: [],
    fixedUsers,
    usersFile,
    secret: "fixed-admin-test-session-secret"
  });

  const login = await auth.login({ username: "Owner User", password: fixedPassword });
  assert.equal(login.ok, true);
  assert.equal(login.user.username, "owner.user");
  assert.equal(login.user.role, "ADMIN");

  const stored = await readFile(usersFile, "utf8");
  assert.equal(stored.includes(fixedPassword), false);
  assert.equal(JSON.parse(stored).users.some((user) => user.username === "owner.user"), true);

  const passwordChange = await auth.changePassword("owner.user", { password: "new-test-pin" });
  assert.equal(passwordChange.statusCode, 409);
  assert.equal(passwordChange.error, "fixed_user_immutable");

  const deactivation = await auth.setUserActive("owner.user", false);
  assert.equal(deactivation.statusCode, 409);
  assert.equal(deactivation.error, "fixed_user_immutable");
});
