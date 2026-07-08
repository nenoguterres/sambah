import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";
import { WhatsAppOrderService } from "../src/whatsappOrderService.js";

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
  const html = await readFile(new URL("../public/conversas.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/conversas.css", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/conversas.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /sambah-shell\.js|renderSambahShell|sambah-shell\.css/);
  assert.match(css, /body\s*{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /body\.sambah-shell-mounted \.app\s*{[^}]*overflow:\s*visible/s);
  assert.match(css, /\.message-list\s*{[^}]*overflow:\s*visible/s);
  assert.match(css, /\.order-panel\s*{/);
  assert.match(js, /function scrollMessagesToBottom/);
  assert.match(js, /function renderOrderPanel/);
  assert.match(js, /loadCatalogIntoPanel/);
  assert.match(js, /\/api\/sambah\/cardapio/);
  assert.match(js, /\/api\/sambah\/cardapio\/sync-mesa/);
  assert.match(js, /Fonte: Mesa/);
  assert.match(js, /function syncMesaCatalog/);
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

    assert.equal(start.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(named.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(itemText.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(deliveryText.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(savedOrders.length, 0);
    assert.equal(commercialRecords.length, 0);

    const linked = await service.linkMesaOrder("wa_5551999999999", {
      id: "mesa-123",
      customer: { name: "Kazuko", phone: "5551999999999" },
      type: "retirada"
    });
    assert.equal(linked.ok, true);
    assert.equal(linked.conversa.atendimentoEstado, "PEDIDO_MESA_RECEBIDO");
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

test("WhatsApp mantem contexto do pedido entre mensagens livres", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-context-"));
  const filePath = join(dir, "conversas.json");
  const orderService = new WhatsAppOrderService({ filePath: join(dir, "orders.json"), now: () => new Date("2026-07-06T13:00:00.000Z") });
  const service = new WhatsAppConversationService({
    filePath,
    orderService,
    now: () => new Date("2026-07-06T13:00:00.000Z")
  });
  try {
    const hello = await service.recordIncoming({ from: "5551999999999", text: "Oi", messageId: "ctx-hello" });
    const order = await service.recordIncoming({ from: "5551999999999", text: "Quero pedir", messageId: "ctx-order" });
    const burger = await service.recordIncoming({ from: "5551999999999", text: "X-Burger", messageId: "ctx-burger" });
    const coke = await service.recordIncoming({ from: "5551999999999", text: "Coca-Cola", messageId: "ctx-coke" });
    const data = JSON.parse(await readFile(filePath, "utf8"));

    assert.equal(data.conversas.length, 1);
    assert.equal(hello.conversa.id, "wa_5551999999999");
    assert.equal(order.conversa.id, hello.conversa.id);
    assert.equal(burger.conversa.id, hello.conversa.id);
    assert.equal(coke.conversa.id, hello.conversa.id);
    assert.equal(order.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(order.aiDecision.conversationState, "COMANDA_EM_ANDAMENTO");
    assert.equal(burger.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(burger.aiDecision.previousConversationState, "COMANDA_EM_ANDAMENTO");
    assert.equal(burger.aiDecision.conversationState, "COMANDA_EM_ANDAMENTO");
    assert.equal(coke.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(coke.aiDecision.previousConversationState, "COMANDA_EM_ANDAMENTO");
    assert.equal(coke.aiDecision.conversationState, "COMANDA_EM_ANDAMENTO");
    assert.equal(coke.aiDecision.allowedAction, "ADD_ORDER_ITEM");
    assert.equal(coke.conversa.whatsappOrder.items.length, 2);
    assert.equal(coke.conversa.whatsappOrder.items[0].name, "X-Burger");
    assert.equal(coke.conversa.whatsappOrder.items[1].name, "Coca-Cola");
    assert.doesNotMatch(coke.aiDecision.safeReply, /1 - Fazer pedido|Falar com atendente/);
    assert.doesNotMatch(coke.aiDecision.safeReply, /\/sambah|\/pedir|MESA_COMANDA_URL/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WhatsApp nao anota saudacao como item em comanda ativa", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-greeting-item-"));
  const filePath = join(dir, "conversas.json");
  const orderService = new WhatsAppOrderService({ filePath: join(dir, "orders.json"), now: () => new Date("2026-07-07T19:05:00.000Z") });
  const service = new WhatsAppConversationService({
    filePath,
    orderService,
    now: () => new Date("2026-07-07T19:05:00.000Z")
  });
  try {
    await service.recordIncoming({ from: "5551999999999", text: "Quero pedir", messageId: "greeting-item-1" });
    const helloAgain = await service.recordIncoming({ from: "5551999999999", text: "Oi", messageId: "greeting-item-2" });

    assert.equal(helloAgain.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(helloAgain.aiDecision.allowedAction, "ANSWER_INFO");
    assert.doesNotMatch(helloAgain.aiDecision.safeReply, /Anotei esse item/i);
    assert.match(helloAgain.aiDecision.safeReply, /SamBah/);
    assert.equal(helloAgain.conversa.whatsappOrder.items.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WhatsApp expira comanda antiga antes de interpretar nova mensagem", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-expired-order-"));
  const filePath = join(dir, "conversas.json");
  let currentTime = new Date("2026-07-07T11:49:00.000Z");
  const orderService = new WhatsAppOrderService({ filePath: join(dir, "orders.json"), now: () => currentTime });
  const service = new WhatsAppConversationService({
    filePath,
    orderService,
    now: () => currentTime
  });
  try {
    const started = await service.recordIncoming({ from: "5551999999999", text: "1", messageId: "expired-order-1" });
    assert.equal(started.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");

    currentTime = new Date("2026-07-07T19:05:00.000Z");
    const reopened = await service.recordIncoming({ from: "5551999999999", text: "Oi", messageId: "expired-order-2" });
    const order = await orderService.getOrderByConversation(reopened.conversa.id);

    assert.equal(reopened.conversa.atendimentoEstado, "");
    assert.equal(reopened.conversa.whatsappOrder, null);
    assert.equal(reopened.conversa.lastOrderContextResetAt, "2026-07-07T19:05:00.000Z");
    assert.equal(reopened.aiDecision.intent, "saudacao");
    assert.equal(reopened.aiDecision.allowedAction, "ANSWER_INFO");
    assert.doesNotMatch(reopened.aiDecision.safeReply, /Anotei esse item/i);
    assert.equal(order.order.status, "cancelled");
    assert.equal(order.order.items.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WhatsApp segue anotando item real depois de saudacao ignorada", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-item-after-greeting-"));
  const filePath = join(dir, "conversas.json");
  const orderService = new WhatsAppOrderService({ filePath: join(dir, "orders.json"), now: () => new Date("2026-07-07T19:06:00.000Z") });
  const service = new WhatsAppConversationService({
    filePath,
    orderService,
    now: () => new Date("2026-07-07T19:06:00.000Z")
  });
  try {
    await service.recordIncoming({ from: "5551999999999", text: "Quero pedir", messageId: "item-after-greeting-1" });
    await service.recordIncoming({ from: "5551999999999", text: "Oi", messageId: "item-after-greeting-2" });
    const item = await service.recordIncoming({ from: "5551999999999", text: "2 x burger", messageId: "item-after-greeting-3" });

    assert.equal(item.aiDecision.allowedAction, "ADD_ORDER_ITEM");
    assert.equal(item.conversa.whatsappOrder.items.length, 1);
    assert.equal(item.conversa.whatsappOrder.items[0].name, "burger");
    assert.equal(item.conversa.whatsappOrder.items[0].quantity, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WhatsApp nao captura intencoes prioritarias como item em AGUARDANDO_PEDIDO_MESA", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-priority-waiting-"));
  const filePath = join(dir, "conversas.json");
  const orderPath = join(dir, "orders.json");
  const orderService = new WhatsAppOrderService({ filePath: orderPath, now: () => new Date("2026-07-07T20:20:00.000Z") });
  const service = new WhatsAppConversationService({
    filePath,
    orderService,
    now: () => new Date("2026-07-07T20:20:00.000Z")
  });
  try {
    await writeFile(filePath, JSON.stringify({
      conversas: [{
        id: "wa_5551999999999",
        nome: "Cliente Teste",
        telefone: "5551999999999",
        status: "aguardando_cliente",
        atendimentoEstado: "AGUARDANDO_PEDIDO_MESA",
        mensagens: [],
        createdAt: "2026-07-07T20:00:00.000Z",
        updatedAt: "2026-07-07T20:00:00.000Z",
        ultimaInteracao: "2026-07-07T20:00:00.000Z"
      }]
    }), "utf8");
    await writeFile(orderPath, JSON.stringify({
      orders: [{
        id: "wa_order_test",
        conversationId: "wa_5551999999999",
        phone: "5551999999999",
        customerName: "Cliente Teste",
        items: [],
        status: "collecting_items",
        source: "whatsapp_sambah",
        createdAt: "2026-07-07T20:00:00.000Z",
        updatedAt: "2026-07-07T20:00:00.000Z"
      }]
    }), "utf8");

    for (const [index, text] of ["Oi", "Cardápio", "Humano", "Cancelar"].entries()) {
      await writeFile(filePath, JSON.stringify({
        conversas: [{
          id: "wa_5551999999999",
          nome: "Cliente Teste",
          telefone: "5551999999999",
          status: "aguardando_cliente",
          atendimentoEstado: "AGUARDANDO_PEDIDO_MESA",
          mensagens: [],
          createdAt: "2026-07-07T20:00:00.000Z",
          updatedAt: "2026-07-07T20:00:00.000Z",
          ultimaInteracao: "2026-07-07T20:00:00.000Z"
        }]
      }), "utf8");
      await writeFile(orderPath, JSON.stringify({
        orders: [{
          id: "wa_order_test",
          conversationId: "wa_5551999999999",
          phone: "5551999999999",
          customerName: "Cliente Teste",
          items: [],
          status: "collecting_items",
          source: "whatsapp_sambah",
          createdAt: "2026-07-07T20:00:00.000Z",
          updatedAt: "2026-07-07T20:00:00.000Z"
        }]
      }), "utf8");
      const result = await service.recordIncoming({ from: "5551999999999", text, messageId: `priority-waiting-${index}` });
      const orders = JSON.parse(await readFile(orderPath, "utf8"));

      assert.notEqual(result.aiDecision.allowedAction, "ADD_ORDER_ITEM");
      assert.doesNotMatch(result.aiDecision.safeReply, /Anotei esse item/i);
      assert.equal(orders.orders[0].items.length, 0, text);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WhatsApp nao captura Cardapio como item em COMANDA_EM_ANDAMENTO", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-cardapio-active-"));
  const filePath = join(dir, "conversas.json");
  const orderService = new WhatsAppOrderService({ filePath: join(dir, "orders.json"), now: () => new Date("2026-07-07T20:24:00.000Z") });
  const service = new WhatsAppConversationService({
    filePath,
    orderService,
    now: () => new Date("2026-07-07T20:24:00.000Z")
  });
  try {
    await service.recordIncoming({ from: "5551999999999", text: "Quero pedir", messageId: "cardapio-active-1" });
    const cardapio = await service.recordIncoming({ from: "5551999999999", text: "Cardápio", messageId: "cardapio-active-2" });

    assert.equal(cardapio.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(cardapio.aiDecision.intent, "cardapio");
    assert.equal(cardapio.aiDecision.allowedAction, "ANSWER_INFO");
    assert.doesNotMatch(cardapio.aiDecision.safeReply, /Anotei esse item/i);
    assert.equal(cardapio.conversa.whatsappOrder.items.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Comanda WhatsApp envia pedido estruturado ao Mesa sem link publico", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-whatsapp-order-mesa-"));
  const conversationFile = join(dir, "conversas.json");
  const orderService = new WhatsAppOrderService({ filePath: join(dir, "orders.json"), now: () => new Date("2026-07-07T10:00:00.000Z") });
  const conversationService = new WhatsAppConversationService({
    filePath: conversationFile,
    orderService,
    now: () => new Date("2026-07-07T10:00:00.000Z")
  });
  const sentOrders = [];
  const mesaConnector = {
    createOrder: async (order) => {
      sentOrders.push(order);
      return { ok: true, mesaOrderId: "mesa-wa-1", status: "accepted", httpStatus: 200 };
    }
  };
  try {
    await conversationService.recordIncoming({ from: "5551999999999", text: "quero pedir", messageId: "mesa-flow-1" });
    const item = await conversationService.recordIncoming({ from: "5551999999999", text: "2 espetinhos de carne", messageId: "mesa-flow-2" });
    const sent = await orderService.sendOrderToMesa(item.conversa.id, { mesaConnector });
    const attached = await conversationService.attachWhatsappOrder(item.conversa.id, sent.order);

    assert.equal(sent.ok, true);
    assert.equal(sent.sent, true);
    assert.equal(sentOrders.length, 1);
    assert.equal(sentOrders[0].source, "whatsapp_sambah");
    assert.equal(sentOrders[0].metadata.conversationId, item.conversa.id);
    assert.equal(sentOrders[0].order.items[0].name, "espetinhos de carne");
    assert.equal(attached.conversa.atendimentoEstado, "PEDIDO_MESA_RECEBIDO");
    assert.equal(attached.conversa.mesaPedido.id, "mesa-wa-1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WhatsApp pedido de atendente durante pedido permanece em handoff humano", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-order-human-"));
  const filePath = join(dir, "conversas.json");
  const service = new WhatsAppConversationService({ filePath });
  try {
    await service.recordIncoming({ from: "5551999999999", text: "quero pedir", messageId: "order-human-1" });
    await service.recordIncoming({ from: "5551999999999", text: "Neno", messageId: "order-human-2" });
    const handoff = await service.recordIncoming({
      from: "5551999999999",
      text: "quero conversar com atendente",
      messageId: "order-human-3"
    });
    assert.equal(handoff.conversa.atendimentoEstado, "HUMANO");
    assert.equal(handoff.conversa.status, "aguardando_humano");
    assert.equal(handoff.conversa.humanHandoff.status, "pendente");
    assert.equal(handoff.aiDecision.allowedAction, "HANDOFF_HUMAN");

    const recorded = await service.recordOutgoing("wa_5551999999999", {
      text: handoff.aiDecision.safeReply,
      sendResult: {
        sent: true,
        status: "sent",
        httpStatus: 200,
        response: { messages: [{ id: "wamid-human-sent" }] }
      }
    });
    assert.equal(recorded.conversa.status, "aguardando_humano");
    assert.equal(recorded.conversa.atendimentoEstado, "HUMANO");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central marca atendimento humano preservando estado de handoff", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-manual-human-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_55518881111",
      nome: "Cliente Manual",
      telefone: "55518881111",
      status: "aguardando_cliente",
      atendimentoEstado: "AGUARDANDO_PEDIDO_MESA",
      mensagens: [],
      createdAt: "2026-07-06T10:00:00.000Z",
      updatedAt: "2026-07-06T10:00:00.000Z"
    }]
  }), "utf8");
  const service = new WhatsAppConversationService({ filePath });
  try {
    const marked = await service.markHuman("wa_55518881111");
    assert.equal(marked.conversa.status, "aguardando_humano");
    assert.equal(marked.conversa.atendimentoEstado, "HUMANO");
    assert.equal(marked.conversa.humanHandoff.status, "pendente");

    const resolved = await service.markResolved("wa_55518881111");
    assert.equal(resolved.conversa.status, "resolvido");
    assert.equal(resolved.conversa.atendimentoEstado, "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Atendente responde handoff humano e conversa continua sem automacao", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-human-manual-reply-"));
  const filePath = join(dir, "conversas.json");
  const service = new WhatsAppConversationService({ filePath });
  const whatsappProvider = {
    sendText: async () => ({ sent: true, status: "sent", httpStatus: 200, response: { messages: [{ id: "wamid-human-manual" }] } })
  };
  try {
    const handoff = await service.recordIncoming({ from: "5551999999999", text: "humano", messageId: "manual-human-1" });
    assert.equal(handoff.conversa.status, "aguardando_humano");
    assert.equal(handoff.conversa.humanHandoff.status, "pendente");

    const replied = await service.addOutgoing("wa_5551999999999", { text: "Buenas, estou contigo por aqui." }, {
      runtimeConfig: { whatsappBusiness: { sendEnabled: true, accessToken: "token", phoneNumberId: "123" } },
      whatsappProvider
    });

    assert.equal(replied.ok, true);
    assert.equal(replied.enviado, true);
    assert.equal(replied.conversa.status, "aguardando_cliente");
    assert.equal(replied.conversa.atendimentoEstado, "HUMANO");
    assert.equal(replied.conversa.humanHandoff.status, "em_atendimento");
    assert.equal(replied.conversa.mensagens.at(-1).direction, "out");

    const after = await service.recordIncoming({ from: "5551999999999", text: "oi", messageId: "manual-human-2" });
    assert.equal(after.aiDecision.allowedAction, "NO_ACTION");
    assert.equal(after.conversa.status, "aguardando_humano");
    assert.equal(after.conversa.mensagens.at(-1).text, "oi");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WhatsApp nao recria conversa quando telefone vem com ou sem nono digito", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-phone-alias-"));
  const filePath = join(dir, "conversas.json");
  const service = new WhatsAppConversationService({ filePath });
  try {
    const first = await service.recordIncoming({ from: "555180413745", text: "Quero pedir", messageId: "alias-order" });
    const second = await service.recordIncoming({ from: "5551980413745", text: "X-Burger", messageId: "alias-burger" });
    const data = JSON.parse(await readFile(filePath, "utf8"));

    assert.equal(data.conversas.length, 1);
    assert.equal(second.conversa.id, first.conversa.id);
    assert.equal(second.conversa.atendimentoEstado, "COMANDA_EM_ANDAMENTO");
    assert.equal(second.aiDecision.previousConversationState, "COMANDA_EM_ANDAMENTO");
    assert.equal(second.aiDecision.conversationState, "COMANDA_EM_ANDAMENTO");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Pedido Mesa criado com identificador correto vincula conversa e sem identificador nao vincula", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-link-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_55518887777",
      nome: "Cliente Mesa",
      telefone: "55518887777",
      atendimentoEstado: "AGUARDANDO_PEDIDO_MESA",
      status: "aguardando_cliente",
      mensagens: [],
      createdAt: "2026-07-04T10:00:00.000Z",
      updatedAt: "2026-07-04T10:00:00.000Z"
    }]
  }), "utf8");
  const service = new WhatsAppConversationService({ filePath });
  try {
    const missing = await service.linkMesaOrderByReference({
      mesaOrderId: "mesa-sem-referencia",
      customerName: "Cliente Mesa",
      origin: "WHATSAPP_SAMBAH"
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.error, "conversation_reference_required");

    const linked = await service.linkMesaOrderByReference({
      conversationId: "wa_55518887777",
      mesaOrderId: "mesa-456",
      customerName: "Cliente Mesa",
      mode: "delivery",
      total: 78.5,
      origin: "WHATSAPP_SAMBAH"
    });
    assert.equal(linked.ok, true);
    assert.equal(linked.conversa.atendimentoEstado, "PEDIDO_MESA_RECEBIDO");
    assert.equal(linked.conversa.mesaPedido.id, "mesa-456");
    assert.equal(linked.conversa.mesaPedido.origem, "WHATSAPP_SAMBAH");
    assert.equal(linked.conversa.respostaSugerida.includes("forma de pagamento"), true);
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

test("Central registra decisao do AI Core sem responder em atendimento humano", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-ai-core-human-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_55518880000",
      nome: "Cliente Humano",
      telefone: "55518880000",
      status: "aguardando_humano",
      atendimentoEstado: "HUMANO",
      humanHandoff: { status: "pendente", requestedAt: "2026-07-06T10:00:00.000Z" },
      mensagens: [],
      createdAt: "2026-07-06T10:00:00.000Z",
      updatedAt: "2026-07-06T10:00:00.000Z"
    }]
  }), "utf8");
  const service = new WhatsAppConversationService({ filePath });
  try {
    const result = await service.recordIncoming({
      from: "55518880000",
      text: "tem alguem ai?",
      messageId: "in-human-no-action"
    });
    assert.equal(result.ok, true);
    assert.equal(result.aiDecision.allowedAction, "NO_ACTION");
    assert.equal(result.conversa.status, "aguardando_humano");
    assert.equal(result.conversa.atendimentoEstado, "HUMANO");
    assert.equal(result.conversa.mensagens.length, 1);
    assert.match(result.conversa.respostaSugerida, /atendimento humano/);
    assert.equal(result.conversa.humanHandoff.status, "pendente");
    assert.equal(result.conversa.aiAuditTrail.length, 1);
    assert.equal(result.conversa.aiAuditTrail[0].intent, "humano");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
