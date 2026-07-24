import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

const PHONE = "5551980413745";
const TEXT = "Portal Insano\nEscolha uma area para continuar:\nInsano Food Truck\nXeriffe Obirici\nMais opcoes";

async function fixture(t, { historyCreatedAt = "2026-07-17T14:48:01.000Z" } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambah-legacy-outbound-dedupe-"));
  const conversationsFile = join(dir, "whatsapp-conversas.json");
  const messagesFile = join(dir, "whatsapp-messages.json");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(conversationsFile, JSON.stringify({
    conversas: [{
      id: `wa_${PHONE}`,
      nome: "Cliente",
      telefone: PHONE,
      status: "aguardando_cliente",
      mensagens: [{
        id: "msg-conversation-copy",
        direction: "out",
        type: "text",
        text: TEXT,
        createdAt: "2026-07-17T14:48:00.000Z",
        status: "sent"
      }],
      createdAt: "2026-07-17T14:47:59.000Z",
      updatedAt: "2026-07-17T14:48:00.000Z"
    }]
  }, null, 2), "utf8");
  await writeFile(messagesFile, JSON.stringify([{
    id: "out-history-copy-with-another-id",
    direction: "out",
    provider: "meta",
    phone: PHONE,
    customerName: "Cliente",
    messageId: "another-message-id",
    providerMessageId: "wamid-provider-menu",
    correlationId: "another-correlation-id",
    text: TEXT,
    status: "read",
    createdAt: historyCreatedAt
  }], null, 2), "utf8");
  return {
    conversationsFile,
    service: new WhatsAppConversationService({ filePath: conversationsFile, messagesFile })
  };
}

test("arquivo oficial existente não é reescrito por cópia outbound legada", async (t) => {
  const f = await fixture(t);
  const result = await f.service.list();
  const outgoing = result.items[0].mensagens.filter((message) => message.direction === "out");
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].id, "msg-conversation-copy");
  assert.equal(outgoing[0].providerMessageId, undefined);
  assert.equal(outgoing[0].status, "sent");

  const stored = JSON.parse(await readFile(f.conversationsFile, "utf8"));
  assert.equal(stored.conversas[0].mensagens.filter((message) => message.direction === "out").length, 1);
});

test("histórico secundário não acrescenta outbound ao arquivo oficial existente", async (t) => {
  const f = await fixture(t, { historyCreatedAt: "2026-07-17T14:49:00.000Z" });
  const result = await f.service.list();
  const outgoing = result.items[0].mensagens.filter((message) => message.direction === "out");
  assert.equal(outgoing.length, 1);
});
