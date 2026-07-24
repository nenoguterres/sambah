import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

test("módulo Android é nativo e não depende de Chrome ou WebView", async () => {
  const manifest = await read("android/sambah-atendimento/app/src/main/AndroidManifest.xml");
  const activity = await read("android/sambah-atendimento/app/src/main/java/br/com/insano/sambah/MainActivity.java");
  const service = await read("android/sambah-atendimento/app/src/main/java/br/com/insano/sambah/AlertPollingService.java");

  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE/);
  assert.match(manifest, /AlertPollingService/);
  assert.doesNotMatch(manifest, /WebView/i);
  assert.doesNotMatch(activity, /WebView|Chrome|CustomTabs/i);
  assert.match(service, /scheduleWithFixedDelay\(this::pollSafely, 0, 10, TimeUnit\.SECONDS\)/);
});

test("aplicativo usa o fluxo real de alerta, resposta e conclusão do SamBah", async () => {
  const client = await read("android/sambah-atendimento/app/src/main/java/br/com/insano/sambah/ApiClient.java");
  const server = await read("src/server.js");

  for (const route of [
    "/api/auth/login",
    "/api/call-center/alerts",
    "/api/conversas/",
    "/responder",
    "/resolve"
  ]) {
    assert.match(client, new RegExp(route.replaceAll("/", "\\/")));
  }

  assert.match(server, /url\.pathname === "\/api\/call-center\/alerts"/);
  assert.match(server, /conversaResponderMatch/);
  assert.match(server, /conversaActionMatch/);
});

test("APK mantém escopo mínimo aprovado", async () => {
  const activity = await read("android/sambah-atendimento/app/src/main/java/br/com/insano/sambah/MainActivity.java");
  assert.match(activity, /Chamadas pendentes/);
  assert.match(activity, /Responder/);
  assert.match(activity, /Concluir/);
  assert.doesNotMatch(activity, /dashboard|campanha|pagamento|cardápio|estoque/i);
});
