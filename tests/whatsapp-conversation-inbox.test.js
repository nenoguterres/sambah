import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

test("Central de Conversas envia resposta manual pelo provider WhatsApp configurado", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-inbox-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551980413745",
      nome: "Cliente Teste",
      telefone: "5551980413745",
      status: "aguardando_equipe",
      mensagens: [],
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:00:00.000Z"
    }]
  }), "utf8");
  const sent = [];
  const service = new WhatsAppConversationService({ filePath });
  try {
    const result = await service.addOutgoing("wa_5551980413745", { text: "Buenas, sigo contigo." }, {
      runtimeConfig: {
        whatsappBusiness: {
          sendEnabled: true,
          accessToken: "token-test",
          phoneNumberId: "phone-test"
        }
      },
      whatsappProvider: {
        sendText: async (input) => {
          sent.push(input);
          return { ok: true, sent: true, status: "sent", httpStatus: 200, response: { messages: [{ id: "wamid-manual" }] } };
        }
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.enviado, true);
    assert.equal(result.message.status, "sent");
    assert.deepEqual(sent, [{ to: "5551980413745", text: "Buenas, sigo contigo." }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Conversas registra resposta automatica ja enviada sem reenviar", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-auto-out-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551980413745",
      nome: "Cliente Teste",
      telefone: "5551980413745",
      status: "aguardando_equipe",
      mensagens: [{ id: "wamid-in", direction: "in", type: "text", text: "Ola", createdAt: "2026-06-30T10:00:00.000Z" }],
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:00:00.000Z"
    }]
  }), "utf8");
  const service = new WhatsAppConversationService({ filePath, now: () => new Date("2026-06-30T10:01:00.000Z") });
  try {
    const result = await service.recordOutgoing("wa_5551980413745", {
      text: "Buenas! Eu sou o SamBah.",
      sendResult: { ok: true, sent: true, status: "sent", httpStatus: 200, response: { messages: [{ id: "wamid-out" }] } }
    });
    assert.equal(result.ok, true);
    assert.equal(result.enviado, true);
    assert.equal(result.message.direction, "out");
    assert.equal(result.message.text, "Buenas! Eu sou o SamBah.");
    assert.equal(result.conversa.status, "aguardando_cliente");
    assert.equal(result.conversa.mensagens.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
