import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

async function createFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "sambah-main-manual-dedupe-"));
  const filePath = join(directory, "whatsapp-conversas.json");
  const conversationId = "wa_5551999999999";

  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: conversationId,
      nome: "Cliente Teste",
      telefone: "5551999999999",
      status: "aguardando_equipe",
      mensagens: [],
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z"
    }]
  }, null, 2));

  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  let sendCalls = 0;
  const whatsappProvider = {
    async sendText({ to, text }) {
      sendCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        sent: true,
        status: "sent",
        httpStatus: 200,
        providerMessageId: `meta_${sendCalls}`,
        response: { messages: [{ id: `meta_${sendCalls}` }] },
        to,
        text
      };
    }
  };

  const runtimeConfig = {
    whatsappBusiness: {
      sendEnabled: true,
      accessToken: "test-token",
      phoneNumberId: "test-phone-id"
    }
  };

  return {
    service: new WhatsAppConversationService({ filePath }),
    filePath,
    conversationId,
    whatsappProvider,
    runtimeConfig,
    getSendCalls: () => sendCalls
  };
}

test("bloqueia respostas manuais concorrentes com o mesmo manualSendId", async (t) => {
  const fixture = await createFixture(t);
  const options = {
    runtimeConfig: fixture.runtimeConfig,
    whatsappProvider: fixture.whatsappProvider
  };

  const results = await Promise.all([
    fixture.service.addOutgoing(fixture.conversationId, {
      text: "Resposta unica",
      manualSendId: "manual-main-001"
    }, options),
    fixture.service.addOutgoing(fixture.conversationId, {
      text: "Resposta unica",
      manualSendId: "manual-main-001"
    }, options)
  ]);

  assert.equal(fixture.getSendCalls(), 1);
  assert.equal(results.filter((result) => result.duplicated === true).length, 1);

  const stored = JSON.parse(await readFile(fixture.filePath, "utf8"));
  const outgoing = stored.conversas[0].mensagens.filter((message) => message.direction === "out");
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].manualSendId, "manual-main-001");
});

test("bloqueia repeticao posterior do mesmo manualSendId", async (t) => {
  const fixture = await createFixture(t);
  const options = {
    runtimeConfig: fixture.runtimeConfig,
    whatsappProvider: fixture.whatsappProvider
  };

  const first = await fixture.service.addOutgoing(fixture.conversationId, {
    text: "Resposta persistida",
    manualSendId: "manual-main-002"
  }, options);
  const second = await fixture.service.addOutgoing(fixture.conversationId, {
    text: "Resposta persistida",
    manualSendId: "manual-main-002"
  }, options);

  assert.equal(first.duplicated, false);
  assert.equal(second.duplicated, true);
  assert.equal(fixture.getSendCalls(), 1);
});

test("permite respostas manuais com manualSendId diferentes", async (t) => {
  const fixture = await createFixture(t);
  const options = {
    runtimeConfig: fixture.runtimeConfig,
    whatsappProvider: fixture.whatsappProvider
  };

  await Promise.all([
    fixture.service.addOutgoing(fixture.conversationId, {
      text: "Primeira resposta",
      manualSendId: "manual-main-101"
    }, options),
    fixture.service.addOutgoing(fixture.conversationId, {
      text: "Segunda resposta",
      manualSendId: "manual-main-102"
    }, options)
  ]);

  assert.equal(fixture.getSendCalls(), 2);
  const stored = JSON.parse(await readFile(fixture.filePath, "utf8"));
  const outgoing = stored.conversas[0].mensagens.filter((message) => message.direction === "out");
  assert.equal(outgoing.length, 2);
  assert.deepEqual(outgoing.map((message) => message.manualSendId), [
    "manual-main-101",
    "manual-main-102"
  ]);
});
