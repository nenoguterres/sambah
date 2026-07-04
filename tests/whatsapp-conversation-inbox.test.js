import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("Central de Conversas page keeps the message list scrollable", async () => {
  const css = await readFile(new URL("../public/conversas.css", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/conversas.js", import.meta.url), "utf8");
  assert.match(css, /body\s*{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /body\.sambah-shell-mounted \.app\s*{[^}]*overflow:\s*visible/s);
  assert.match(css, /\.message-list\s*{[^}]*overflow:\s*visible/s);
  assert.match(js, /function scrollMessagesToBottom/);
  assert.match(js, /scrollTop\s*=\s*list\.scrollHeight/);
  assert.match(js, /window\.scrollTo/);
});

test("WhatsApp pedido cria precomanda somente quando tem nome item e retirada", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-order-"));
  const filePath = join(dir, "conversas.json");
  const nowValues = [
    "2026-07-04T01:55:13.000Z",
    "2026-07-04T01:55:14.000Z",
    "2026-07-04T01:55:20.000Z",
    "2026-07-04T01:55:21.000Z",
    "2026-07-04T01:55:28.000Z",
    "2026-07-04T01:55:29.000Z",
    "2026-07-04T01:55:42.000Z",
    "2026-07-04T01:55:43.000Z",
    "2026-07-04T01:55:55.000Z",
    "2026-07-04T01:55:56.000Z",
    "2026-07-04T01:57:01.000Z"
  ];
  const savedOrders = [];
  const commercialRecords = [];
  const crmService = {
    salvarPrecomanda: async (payload) => {
      savedOrders.push(payload);
      return { ok: true };
    },
    registrarAtendimentoComercial: async (payload) => {
      commercialRecords.push(payload);
      return { ok: true };
    }
  };
  let nowIndex = 0;
  const service = new WhatsAppConversationService({
    filePath,
    now: () => new Date(nowValues[nowIndex++] || "2026-07-04T01:58:00.000Z")
  });
  try {
    await service.recordIncoming({ from: "5551999999999", text: "1", messageId: "in-1" }, { crmService });
    await service.recordOutgoing("wa_5551999999999", { text: "Bah, perfeito. Vamos montar teu pedido." });
    await service.recordIncoming({ from: "5551999999999", text: "Kazuko", messageId: "in-name" }, { crmService });
    await service.recordOutgoing("wa_5551999999999", { text: "Perfeito, ja peguei teu nome." });
    await service.recordIncoming({ from: "5551999999999", text: "Calabresa", messageId: "in-item" }, { crmService });
    await service.recordOutgoing("wa_5551999999999", { text: "Boa, ja anotei a ideia do pedido." });
    await service.recordIncoming({ from: "5551999999999", text: "Retirada", messageId: "in-service" }, { crmService });
    await service.recordOutgoing("wa_5551999999999", { text: "Fechado. Pedido encaminhado para a equipe conferir." });
    await service.recordIncoming({ from: "5551999999999", text: "So pedido", messageId: "in-after" }, { crmService });

    assert.equal(savedOrders.length, 1);
    assert.equal(savedOrders[0].nome, "Kazuko");
    assert.equal(savedOrders[0].whatsapp, "5551999999999");
    assert.deepEqual(savedOrders[0].itens, [{ nome: "Calabresa", quantidade: 1 }]);
    assert.equal(savedOrders[0].tipo, "retirada");
    assert.equal(savedOrders[0].status, "aguardando_pagamento");
    assert.equal(savedOrders[0].proximo_passo, "Confirmar forma de pagamento");
    assert.equal(commercialRecords.some((record) => record.interesse === "desconhecido"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
