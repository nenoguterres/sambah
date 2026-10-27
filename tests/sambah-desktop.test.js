import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("SamBah Desktop possui processo proprio sem depender de Chrome ou Edge", async () => {
  const [packageText, main] = await Promise.all([
    read("desktop/package.json"),
    read("desktop/main.cjs")
  ]);
  const desktopPackage = JSON.parse(packageText);

  assert.equal(desktopPackage.devDependencies.electron, "45.0.0");
  assert.equal(desktopPackage.build.appId, "br.com.insanofoodtruck.sambah");
  assert.match(main, /new BrowserWindow/);
  assert.match(main, /persist:sambah-central/);
  assert.doesNotMatch(main, /chrome\.exe|msedge\.exe|Find-Browser/);
});

test("SamBah Desktop gera instaladores para Windows e Linux", async () => {
  const [packageText, workflow] = await Promise.all([
    read("desktop/package.json"),
    read(".github/workflows/desktop-sambah.yml")
  ]);
  const desktopPackage = JSON.parse(packageText);

  assert.match(desktopPackage.scripts["dist:win"], /--win nsis/);
  assert.match(desktopPackage.scripts["dist:linux"], /AppImage deb/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test("SamBah Desktop permanece ativo, inicia com o sistema e recupera conexao", async () => {
  const main = await read("desktop/main.cjs");

  assert.match(main, /setLoginItemSettings/);
  assert.match(main, /\.config", "autostart/);
  assert.match(main, /event\.preventDefault\(\);\s*mainWindow\.hide\(\)/);
  assert.match(main, /setTimeout\(loadSamBah, 15000\)/);
  assert.match(main, /backgroundThrottling: false/);
  assert.match(main, /prevent-app-suspension/);
});

test("SamBah Desktop desativa somente o antigo lancador por navegador no Windows", async () => {
  const main = await read("desktop/main.cjs");

  assert.match(main, /disableLegacyBrowserLauncher/);
  assert.match(main, /SamBahWorkstation\.ps1/);
  assert.match(main, /Programs\\\\Startup\\\\SamBah Central\.lnk/);
  assert.match(main, /Stop-Process/);
  assert.doesNotMatch(main, /Remove-Item[^\n]+SamBahCentral[^\n]+-Recurse/);
});
