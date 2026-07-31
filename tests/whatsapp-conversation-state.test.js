import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "sambah-conv-state-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const service = new WhatsAppConversationService({ filePath: join(dir, "conversas.json") });
  const incoming = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid-state-1", text: "preciso falar" });
  return { service, id: incoming.conversa.id };
}

test("leitura, reinicio e nova entrada mantem estado correto", async (t) => {
  const { service, id } = await fixture(t);
  const read = await service.markRead(id, { username: "neno", role: "ADMIN" });
  assert.equal(read.conversa.unread, false);
  const restarted = new WhatsAppConversationService({ filePath: service.filePath });
  assert.equal((await restarted.get(id)).conversa.unread, false);
  const unread = await restarted.markUnread(id, { username: "neno", role: "ADMIN" });
  assert.equal(unread.conversa.unread, true);
  await restarted.markRead(id, { username: "neno", role: "ADMIN" });
  const next = await restarted.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid-state-2", text: "nova" });
  assert.equal(next.conversa.unread, true);
});

test("claim conflita com segundo operador, transfere, resolve, reabre e limpa historico", async (t) => {
  const { service, id } = await fixture(t);
  const first = await service.claimConversation(id, { phone: "5551980413745", name: "Neno", role: "OPERADOR" });
  assert.equal(first.ok, true);
  const second = await service.claimConversation(id, { phone: "5551999999999", name: "Kazuko", role: "OPERADOR" });
  assert.equal(second.statusCode, 409);
  const transfer = await service.transferConversation(id, { phone: "5551980413745", role: "OPERADOR" }, { phone: "5551999999999", name: "Kazuko" }, { expectedVersion: first.conversa.version });
  assert.equal(transfer.conversa.assignedOperatorPhone, "5551999999999");
  const stale = await service.resolveConversation(id, { role: "ADMIN", username: "admin" }, { expectedVersion: first.conversa.version });
  assert.equal(stale.statusCode, 409);
  const resolved = await service.resolveConversation(id, { role: "ADMIN", username: "admin" }, { expectedVersion: transfer.conversa.version });
  assert.equal(resolved.conversa.status, "finalizada");
  const reopened = await service.reopenConversation(id, { role: "ADMIN", username: "admin" }, { expectedVersion: resolved.conversa.version });
  assert.equal(reopened.conversa.status, "em_atendimento");
  const blocked = await service.clearConversationHistory(id, { role: "OPERADOR", username: "op" });
  assert.equal(blocked.statusCode, 403);
  const cleared = await service.clearConversationHistory(id, { role: "ADMIN", username: "admin" });
  assert.equal(cleared.removedMessages, 1);
  assert.equal(cleared.conversa.mensagens.length, 0);
});

test("limpeza inicial arquiva fila sem apagar historico e nova mensagem reabre", async (t) => {
  const { service, id } = await fixture(t);
  const reset = await service.resetOperationalQueue({ role: "ADMIN", username: "admin" });
  assert.equal(reset.archived, 1);
  const archived = await service.get(id);
  assert.equal(archived.conversa.status, "arquivada");
  assert.equal(archived.conversa.mensagens.length, 1);
  const repeated = await service.resetOperationalQueue({ role: "ADMIN", username: "admin" });
  assert.equal(repeated.alreadyApplied, true);
  const reopened = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid-state-reopen", text: "novo atendimento" });
  assert.equal(reopened.conversa.status, "nova");
  assert.equal(reopened.conversa.mensagens.length, 2);
});
