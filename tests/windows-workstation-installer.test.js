import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("instalador Windows inicia no logon, mantem o PC acordado e reabre o SamBah", async () => {
  const source = await readFile("scripts/install-sambah-workstation.ps1", "utf8");
  assert.match(source, /GetFolderPath\("Startup"\)/);
  assert.match(source, /SamBah Central\.lnk/);
  assert.match(source, /--app=\$Url/);
  assert.match(source, /SetThreadExecutionState\(0x80000003\)/);
  assert.match(source, /Start-Sleep -Seconds 20/);
  assert.match(source, /BrowserProfile/);
  assert.match(source, /-Watch/);
  assert.doesNotMatch(source, /password|senha/i);
});

test("atalho de dois cliques baixa e executa o instalador oficial", async () => {
  const source = await readFile("scripts/instalar-sambah-no-pc.cmd", "utf8");
  assert.match(source, /raw\.githubusercontent\.com\/nenoguterres\/sambah\/main\/scripts\/install-sambah-workstation\.ps1/);
  assert.match(source, /Invoke-WebRequest/);
  assert.match(source, /ExecutionPolicy Bypass -File/);
  assert.doesNotMatch(source, /password|senha/i);
});
