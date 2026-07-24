import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "sambah-conv-idem-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { service: new WhatsAppConversationService({ filePath: join(dir, "conversas.json") }), filePath: join(dir, "conversas.json") };
}

test("entrada Meta repetida persiste uma mensagem e retorna duplicate", async (t) => {
  const { service, filePath } = await fixture(t);
  const first = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid.1", text: "quero humano" });
  const second = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid.1", text: "quero humano" });
  const stored = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(first.duplicate, undefined);
  assert.equal(second.duplicate, true);
  assert.equal(stored.conversas.length, 1);
  assert.equal(stored.conversas[0].mensagens.length, 1);
  assert.equal(stored.conversas[0].unread, true);
  assert.equal(stored.conversas[0].lastInboundMessageId, "wamid.1");
});

test("telefones equivalentes com e sem nono digito nao duplicam conversa", async (t) => {
  const { service } = await fixture(t);
  await service.recordNeutralIncoming({ telefone: "5551980413745", messageId: "wamid.2", text: "oi" });
  await service.recordNeutralIncoming({ telefone: "555180413745", messageId: "wamid.3", text: "oi de novo" });
  const list = await service.list();
  assert.equal(list.count, 1);
  assert.equal(list.items[0].mensagens.length, 2);
});

test("saida com mesmo manualSendId chama provider uma vez e falha fica persistida", async (t) => {
  const { service } = await fixture(t);
  const incoming = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid.4", text: "oi" });
  let calls = 0;
  const provider = { async sendText() { calls += 1; return { sent: true, status: "sent", providerMessageId: "meta-1", response: { messages: [{ id: "meta-1" }] } }; } };
  const options = { runtimeConfig: { whatsappBusiness: { sendEnabled: true, accessToken: "x", phoneNumberId: "y" } }, whatsappProvider: provider };
  const first = await service.addOutgoing(incoming.conversa.id, { text: "resposta", manualSendId: "manual-abc-1" }, options);
  const second = await service.addOutgoing(incoming.conversa.id, { text: "resposta", manualSendId: "manual-abc-1" }, options);
  assert.equal(calls, 1);
  assert.equal(first.message.providerMessageId, "meta-1");
  assert.equal(second.duplicate, true);
});

test("status Meta atualiza o mesmo balao sem criar mensagem", async (t) => {
  const { service } = await fixture(t);
  const incoming = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid.5", text: "oi" });
  const provider = { async sendText() { return { sent: true, status: "sent", providerMessageId: "meta-2", response: { messages: [{ id: "meta-2" }] } }; } };
  await service.addOutgoing(incoming.conversa.id, { text: "resposta", manualSendId: "manual-abc-2" }, { runtimeConfig: { whatsappBusiness: { sendEnabled: true, accessToken: "x", phoneNumberId: "y" } }, whatsappProvider: provider });
  await service.recordMetaStatus({ id: "meta-2", status: "delivered", timestamp: "1780000000" });
  await service.recordMetaStatus({ id: "meta-2", status: "read", timestamp: "1780000010" });
  const got = await service.get(incoming.conversa.id);
  assert.equal(got.conversa.mensagens.length, 2);
  const out = got.conversa.mensagens.find((item) => item.direction === "out");
  assert.equal(out.status, "read");
  assert.ok(out.deliveredAt);
  assert.ok(out.readAt);
});
