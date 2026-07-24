import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

async function listen(app) {
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${app.address().port}`;
}

test("rotas definitivas retornam summary, leitura e limpeza atomica", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-routes-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const service = new WhatsAppConversationService({ filePath: join(dir, "conversas.json") });
  const incoming = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid-route-1", text: "oi" });
  const app = createApp({
    whatsappConversationService: service,
    authMode: "mock",
    callCenterService: { listOperators: async () => ({ ok: true, operators: [] }), listAlerts: async () => ({ ok: true, alerts: [] }) }
  });
  t.after(() => app.close());
  const base = await listen(app);
  const list = await (await fetch(`${base}/api/conversas`)).json();
  assert.equal(list.ok, true);
  assert.equal(list.summary.unread, 1);
  const read = await (await fetch(`${base}/api/conversas/${incoming.conversa.id}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
  assert.equal(read.conversa.unread, false);
  const cleared = await (await fetch(`${base}/api/conversas/${incoming.conversa.id}/messages`, { method: "DELETE" })).json();
  assert.equal(cleared.removedMessages, 1);
});

test("rotas de conversas não expõem dados nem aceitam mutações sem sessão", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-routes-auth-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const service = new WhatsAppConversationService({ filePath: join(dir, "conversas.json") });
  const incoming = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid-route-auth-1", text: "privado" });
  const app = createApp({
    whatsappConversationService: service,
    authMode: "session",
    callCenterService: { listOperators: async () => ({ ok: true, operators: [] }), listAlerts: async () => ({ ok: true, alerts: [] }) }
  });
  t.after(() => app.close());
  const base = await listen(app);
  for (const [path, options] of [
    ["/api/conversas", {}],
    [`/api/conversas/${incoming.conversa.id}`, {}],
    [`/api/conversas/${incoming.conversa.id}/responder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "não enviar", manualSendId: "manual-auth-test" })
    }]
  ]) {
    const response = await fetch(`${base}${path}`, options);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "auth_required");
  }
});
