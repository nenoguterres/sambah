import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
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
  assert.match(js, /REFRESH_INTERVAL_MS\s*=\s*5000/);
  assert.match(js, /silentRefresh:\s*true/);
  assert.match(js, /cache:\s*"no-store"/);
});

test("WhatsApp pedido nao cria precomanda e aguarda Mesa Comanda", async () => {
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
    const start = await service.recordIncoming({ from: "5551999999999", text: "1", messageId: "in-1" }, { crmService });
    await service.recordOutgoing("wa_5551999999999", { text: "Bah, perfeito. Vou te levar para a Comanda Mesa." });
    const named = await service.recordIncoming({ from: "5551999999999", text: "Kazuko", messageId: "in-name" }, { crmService });
    await service.recordOutgoing("wa_5551999999999", { text: "Perfeito, ja peguei teu nome." });
    const itemText = await service.recordIncoming({ from: "5551999999999", text: "Farofa", messageId: "in-item" }, { crmService });
    const deliveryText = await service.recordIncoming({ from: "5551999999999", text: "Delivery", messageId: "in-service" }, { crmService });

    assert.equal(start.conversa.atendimentoEstado, "AGUARDANDO_NOME");
    assert.equal(named.conversa.atendimentoEstado, "ENVIADO_PARA_MESA_COMANDA");
    assert.equal(itemText.conversa.atendimentoEstado, "AGUARDANDO_PEDIDO_MESA");
    assert.equal(deliveryText.conversa.atendimentoEstado, "AGUARDANDO_PEDIDO_MESA");
    assert.equal(savedOrders.length, 0);
    assert.equal(commercialRecords.length, 0);

    const linked = await service.linkMesaOrder("wa_5551999999999", {
      id: "mesa-123",
      customer: { name: "Kazuko", phone: "5551999999999" },
      type: "retirada"
    });
    assert.equal(linked.ok, true);
    assert.equal(linked.conversa.atendimentoEstado, "AGUARDANDO_FORMA_PAGAMENTO");
    assert.equal(linked.conversa.mesaPedido.id, "mesa-123");
    assert.equal(linked.conversa.statusCobranca, "A_COBRAR");

    const duplicated = await service.linkMesaOrder("wa_5551999999999", {
      id: "mesa-123",
      customer: { name: "Kazuko", phone: "5551999999999" },
      type: "retirada"
    });
    assert.equal(duplicated.ok, true);
    assert.equal(duplicated.duplicated, true);
    assert.equal(duplicated.conversa.mesaPedido.id, "mesa-123");

    const pix = await service.recordIncoming({ from: "5551999999999", text: "pix", messageId: "in-pix" }, { crmService });
    assert.equal(pix.conversa.atendimentoEstado, "COBRANCA_ENVIADA");
    assert.equal(pix.conversa.statusCobranca, "COBRANCA_ENVIADA");

    const charged = await service.recordSambahPayCharge("wa_5551999999999", {
      id: "pay-123",
      status: "pending",
      amount: 0
    });
    assert.equal(charged.ok, true);
    assert.equal(charged.conversa.sambahPay.paymentId, "pay-123");
    assert.equal(charged.conversa.statusCobranca, "COBRANCA_ENVIADA");

    const paid = await service.markPaymentConfirmed("wa_5551999999999", {
      id: "pay-123",
      status: "paid"
    });
    assert.equal(paid.ok, true);
    assert.equal(paid.conversa.atendimentoEstado, "PAGAMENTO_CONFIRMADO");
    assert.equal(paid.conversa.statusCobranca, "PAGAMENTO_EFETUADO");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Mesa recebe status financeiro A_COBRAR e PAGAMENTO_EFETUADO", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-mesa-financial-"));
  const queueFile = join(dir, "mesa-queue.json");
  const service = new MesaIntegrationService({ queueFile });
  try {
    await service.enqueueOrder({
      externalId: "mesa-123",
      customer: { name: "Kazuko", phone: "5551999999999" },
      order: { items: [], total: null }
    });

    const pending = await service.updateFinancialStatus("mesa-123", {
      statusFinanceiro: "A_COBRAR",
      correlationId: "wa_5551999999999:mesa-123"
    });
    assert.equal(pending.ok, true);
    assert.equal(pending.statusFinanceiro, "A_COBRAR");
    assert.equal(pending.item.statusFinanceiro, "A_COBRAR");

    const paid = await service.updateFinancialStatus("mesa-123", {
      statusFinanceiro: "PAGAMENTO_EFETUADO",
      correlationId: "wa_5551999999999:mesa-123"
    });
    assert.equal(paid.ok, true);
    assert.equal(paid.statusFinanceiro, "PAGAMENTO_EFETUADO");
    assert.equal(paid.item.statusFinanceiro, "PAGAMENTO_EFETUADO");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
