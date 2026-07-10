import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname } from "node:path";

const repoRoot = new URL("../", import.meta.url);
const removedFiles = [
  "src/flowManager.js",
  "src/eventFlow.js",
  "src/intentEngine.js",
  "src/operationRouter.js",
  "src/sambahPersonality.js"
];
const forbiddenRuntimePatterns = [
  "sambahPersonality",
  "intentEngine",
  "flowManager",
  "operationRouter",
  "buildSambahAutoReply",
  "sendWhatsAppCloudAutoReply",
  "recordIntentDetected",
  "recordOperationRoute",
  "routeCallCenterIfNeeded",
  "automaticoAtivo",
  "directAutoReply",
  "autoIntent",
  "legacyHandler",
  "WHATSAPP_ENGINE_VERSION",
  "whatsapp-v2"
];

test("arquivos exclusivos do WhatsApp V1 nao existem mais", async () => {
  for (const relative of removedFiles) {
    await assert.rejects(readFile(new URL(relative, repoRoot), "utf8"), /ENOENT/);
  }
});

test("runtime nao importa nem referencia motor WhatsApp V1", async () => {
  const runtimeFiles = await listFiles(new URL("src/", repoRoot), [".js"]);
  const matches = [];
  for (const file of runtimeFiles) {
    const text = await readFile(file, "utf8");
    for (const pattern of forbiddenRuntimePatterns) {
      if (text.includes(pattern)) matches.push(`${file}:${pattern}`);
    }
  }
  assert.deepEqual(matches, []);
});

test("webhook Meta aponta para handler neutro de manutencao", async () => {
  const server = await readFile(new URL("src/server.js", repoRoot), "utf8");
  const handler = await readFile(new URL("src/whatsapp/whatsappMaintenanceHandler.js", repoRoot), "utf8");
  assert.match(server, /whatsappMaintenanceHandler\(body/);
  assert.match(handler, /engine:\s*"disabled"/);
  assert.match(handler, /reason:\s*"whatsapp_engine_disabled"/);
  assert.match(handler, /automaticReplyCreated:\s*false/);
  assert.doesNotMatch(handler, /sendText|fetch\(|buildMesaOrder/);
});

async function listFiles(dirUrl, extensions) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) {
      files.push(...await listFiles(child, extensions));
    } else if (extensions.includes(extname(entry.name))) {
      files.push(child);
    }
  }
  return files;
}
