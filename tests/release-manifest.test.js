import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("release operacional possui versao e empacotamento centralizado", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, "2.0.0");
  assert.match(pkg.scripts["release:package"], /build-release\.ps1/);
});
