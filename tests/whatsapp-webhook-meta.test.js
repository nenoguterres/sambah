import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../src/auditService.js";
import { CrmService } from "../src/crmService.js";
import { EventScheduleService } from "../src/eventScheduleService.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { OrderDraftService } from "../src/orderDraftService.js";
import { SambahConversationService } from "../src/sambahConversationService.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";
import { createApp } from "../src/server.js";
import { MockWhatsAppProvider } from "../src/whatsapp/providers/mockProvider.js";
import { WhatsAppMessageService } from "../src/whatsapp/whatsappMessageService.js";

test("GET /webhook/whatsapp valida challenge da Meta", async () => {
  const previous = process.env.WHATSAPP_META_VERIFY_TOKEN;
  process.env.WHATSAPP_META_VERIFY_TOKEN = "token-certo";
  const { server, base, cleanup } = await createTestServer();
  try {
    const ok = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token-certo&hub.challenge=abc123`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "abc123");

    const denied = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123`);
    assert.equal(denied.status, 403);
  } finally {
    await close(server);
    await cleanup();
    if (previous === undefined) delete process.env.WHATSAPP_META_VERIFY_TOKEN;
    else process.env.WHATSAPP_META_VERIFY_TOKEN = previous;
  }
});

test("POST /webhook/whatsapp preserva mock e normaliza payload Meta", async () => {
  const { server, base, cleanup } = await createTestServer();
  try {
    const mockResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: "mock-1", from: "51999999999", message: "quero falar com Kazuko" })
    });
    const mockBody = await mockResponse.json();
    assert.equal(mockResponse.status, 202);
    assert.equal(mockBody.ok, true);
    assert.equal(mockBody.intent, "human_request");
    assert.match(mockBody.responseText, /5551997920292/);

    const metaResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-meta-normaliza",
        type: "text",
        text: { body: "quero o cardapio" }
      }))
    });
    const metaBody = await metaResponse.json();
    assert.equal(metaResponse.status, 200);
    assert.equal(metaBody.ok, true);
    assert.equal(metaBody.normalized.provider, "meta");
    assert.equal(metaBody.normalized.from, "5551999999999");
    assert.equal(metaBody.autoIntent, "menu_request");

    const interactiveResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-meta-interactive",
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "cardapio", title: "Quero cardapio" }
        }
      }))
    });
    const interactiveBody = await interactiveResponse.json();
    assert.equal(interactiveResponse.status, 200);
    assert.equal(interactiveBody.ok, true);
    assert.equal(interactiveBody.normalized.message, "Quero cardapio");
    assert.equal(interactiveBody.conversa.ultimaMensagem, "Quero cardapio");
    assert.equal(interactiveBody.autoIntent, "menu_request");
  } finally {
    await close(server);
    await cleanup();
  }
});

test("POST /webhook/whatsapp processa payload real da Meta e envia resposta simples", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "env-phone-number-id";

  const graphCalls = [];
  const providerCalls = [];
  const logs = [];
  const previousConsoleInfo = console.info;
  console.info = (...args) => logs.push(args);
  const { server, base, auditFile, messagesFile, conversationsFile, cleanup } = await createTestServer({
    provider: {
      name: "meta-test-provider",
      status: () => ({ provider: "meta-test-provider", configured: true }),
      sendText: async (input) => {
        providerCalls.push(input);
        return { ok: true, sent: true, status: "sent_by_provider" };
      }
    },
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response(JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ input: "5551999999999", wa_id: "5551999999999" }],
        messages: [{ id: "wamid-auto-reply" }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-real-meta-text",
        type: "text",
        text: { body: "Oi SamBah" }
      }, { phoneNumberId: "1234567890" }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.enviado, true);
    assert.equal(body.automaticoAtivo, true);
    assert.equal(body.directAutoReply.sent, true);
    assert.equal(body.directAutoReply.httpStatus, 200);
    assert.equal(graphCalls.length, 1);
    assert.equal(providerCalls.length, 0);
    assert.equal(graphCalls[0].url, "https://graph.facebook.com/v25.0/1234567890/messages");
    assert.equal(graphCalls[0].options.method, "POST");
    assert.equal(graphCalls[0].options.headers.authorization, "Bearer meta-token-teste");
    const sentBody = JSON.parse(graphCalls[0].options.body);
    assert.deepEqual(sentBody, {
      messaging_product: "whatsapp",
      to: "5551999999999",
      type: "text",
      text: { body: sentBody.text.body }
    });
    assert.match(sentBody.text.body, /Aqui e o SamBah/);
    assert.doesNotMatch(sentBody.text.body, /1 - Fazer pedido|6 - Falar com atendente/);
    const receivedLog = logs.find(([event]) => event === "whatsapp.webhook.post.received");
    assert.ok(receivedLog);
    assert.equal(receivedLog[1].bodyEntryLength, 1);
    assert.equal(receivedLog[1].changesLength, 1);
    assert.equal(receivedLog[1].field, "messages");
    assert.equal(receivedLog[1].phoneNumberIdReceived, "1234567890");
    assert.equal(receivedLog[1].messagesLength, 1);
    assert.equal(receivedLog[1].textBody, "Oi SamBah");
    assert.equal(receivedLog[1].from, "5551999999999");
    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    const aiEvent = audit.find((event) => event.type === "sambah_ai_decision");
    assert.ok(aiEvent);
    assert.equal(aiEvent.source, "whatsapp_ai_core");
    assert.equal(aiEvent.context.phone, "[masked]");
    assert.equal(aiEvent.context.intent, "saudacao");
    assert.equal(aiEvent.context.allowedAction, "ANSWER_INFO");
    assert.equal(aiEvent.context.requiresHuman, false);
    assert.match(aiEvent.context.auditReason, /Saudacao/);
    const history = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(history.length, 2);
    assert.equal(history[0].direction, "out");
    assert.equal(history[0].text, sentBody.text.body);
    assert.equal(history[0].status, "sent");
    assert.equal(history[0].httpStatus, 200);
    assert.equal(history[0].response.messages[0].id, "wamid-auto-reply");
    assert.equal(history[1].direction, "in");
    assert.equal(history[1].text, "Oi SamBah");
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 1);
    assert.equal(conversations.conversas[0].mensagens.length, 2);
    assert.equal(conversations.conversas[0].mensagens[0].direction, "in");
    assert.equal(conversations.conversas[0].mensagens[1].direction, "out");
    assert.equal(conversations.conversas[0].mensagens[1].text, sentBody.text.body);
  } finally {
    console.info = previousConsoleInfo;
    await close(server);
    await cleanup();
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousAccessToken;
    if (previousPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumberId;
  }
});

test("POST /webhook/whatsapp responde fluxo humano quando cliente pede atendente", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const { server, base, cleanup } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response(JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ input: "5551999999999", wa_id: "5551999999999" }],
        messages: [{ id: "wamid-human-reply" }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-human-request",
        type: "text",
        text: { body: "quero falar com atendente" }
      }, { phoneNumberId: "1234567890" }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.directAutoReply.sent, true);
    assert.equal(graphCalls.length, 1);
    const sentBody = JSON.parse(graphCalls[0].options.body);
    assert.deepEqual(sentBody, {
      messaging_product: "whatsapp",
      to: "5551999999999",
      type: "text",
      text: { body: sentBody.text.body }
    });
    assert.match(sentBody.text.body, /atendimento humano/);
    assert.doesNotMatch(sentBody.text.body, /1.*Continuar com o SamBah/s);
  } finally {
    await close(server);
    await cleanup();
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousAccessToken;
    if (previousPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumberId;
  }
});

test("POST /webhook/whatsapp em AGUARDANDO_HUMANO cancela e retoma automatico", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const { server, base, cleanup, conversationsFile } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response(JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ input: "5551999999999", wa_id: "5551999999999" }],
        messages: [{ id: `wamid-human-${graphCalls.length}` }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  try {
    await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-human-start",
        type: "text",
        text: { body: "humano" }
      }))
    });
    await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-human-cancelar",
        type: "text",
        text: { body: "cancelar" }
      }))
    });
    await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-human-oi",
        type: "text",
        text: { body: "oi" }
      }))
    });

    assert.equal(graphCalls.length, 3);
    const cancelBody = JSON.parse(graphCalls[1].options.body);
    assert.match(cancelBody.text.body, /Cancelei a espera/);
    assert.doesNotMatch(cancelBody.text.body, /Fazer pedido|Cardapio|Cardápio/);
    const helloBody = JSON.parse(graphCalls[2].options.body);
    assert.doesNotMatch(helloBody.text.body, /fila do atendimento humano|Aguarda um instante/);

    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    const conversa = conversations.conversas[0];
    assert.equal(conversa.mode, "AUTO");
    assert.equal(conversa.atendimentoEstado, "");
    assert.equal(conversa.humanHandoff.status, "cancelado");
    assert.equal(conversa.mensagens.filter((message) => message.direction === "in").length, 3);
  } finally {
    await close(server);
    await cleanup();
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousAccessToken;
    if (previousPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumberId;
  }
});

test("manual reply in HUMANO state uses Meta provider and succeeds", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const { server, base, cleanup, conversationsFile } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      const body = JSON.parse(options.body);
      graphCalls.push({ url, body, authorization: options.headers.authorization });
      if (graphCalls.length === 1) {
        return new Response(JSON.stringify({
          error: {
            message: "(#131030) Recipient phone number not in allowed list",
            code: 131030
          }
        }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ input: body.to, wa_id: body.to }],
        messages: [{ id: "wamid-manual-human-ok" }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  try {
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_5551981675115",
        nome: "Teste SamBah",
        telefone: "5551981675115",
        status: "aguardando_humano",
        atendimentoEstado: "HUMANO",
        intencao: "humano",
        humanHandoff: {
          status: "pendente",
          requestedAt: "2026-07-08T10:00:00.000Z",
          lastCustomerMessageAt: "2026-07-08T10:00:00.000Z",
          waitMessageSentAt: "",
          pendingNoticeDue: false
        },
        mensagens: [{ id: "msg-in", direction: "in", type: "text", text: "humano", createdAt: "2026-07-08T10:00:00.000Z", status: "recebida" }],
        createdAt: "2026-07-08T10:00:00.000Z",
        updatedAt: "2026-07-08T10:00:00.000Z"
      }]
    }), "utf8");

    const response = await fetch(`${base}/api/conversas/wa_5551981675115/responder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "ola, teste humano" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.enviado, true);
    assert.equal(body.message.status, "sent");
    assert.equal(body.sendResult.retried, true);
    assert.equal(body.sendResult.originalTo, "5551981675115");
    assert.equal(body.sendResult.retryTo, "555181675115");
    assert.equal(graphCalls.length, 2);
    assert.equal(graphCalls[0].url, "https://graph.facebook.com/v25.0/1234567890/messages");
    assert.equal(graphCalls[0].body.to, "5551981675115");
    assert.equal(graphCalls[1].body.to, "555181675115");
    assert.equal(graphCalls[1].body.text.body, "ola, teste humano");
    assert.match(graphCalls[1].authorization, /^Bearer /);

    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    const sentMessage = conversations.conversas[0].mensagens.at(-1);
    assert.equal(sentMessage.direction, "out");
    assert.equal(sentMessage.status, "sent");
    assert.equal(sentMessage.response.messages[0].id, "wamid-manual-human-ok");
    assert.equal(conversations.conversas[0].humanHandoff.status, "em_atendimento");
  } finally {
    await close(server);
    await cleanup();
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousAccessToken;
    if (previousPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumberId;
  }
});

test("manual reply in HUMANO state persists Meta retry diagnostics when both attempts fail", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const { server, base, cleanup, conversationsFile } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      const body = JSON.parse(options.body);
      graphCalls.push({ url, body });
      return new Response(JSON.stringify({
        error: {
          message: "(#131030) Recipient phone number not in allowed list",
          code: 131030,
          error_data: { details: "destinatario fora da lista" }
        }
      }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }
  });
  try {
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_5551981675115",
        nome: "Teste SamBah",
        telefone: "5551981675115",
        status: "aguardando_humano",
        atendimentoEstado: "HUMANO",
        intencao: "humano",
        humanHandoff: { status: "pendente", requestedAt: "2026-07-08T10:00:00.000Z" },
        mensagens: [],
        createdAt: "2026-07-08T10:00:00.000Z",
        updatedAt: "2026-07-08T10:00:00.000Z"
      }]
    }), "utf8");

    const response = await fetch(`${base}/api/conversas/wa_5551981675115/responder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "teste" })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.enviado, false);
    assert.equal(body.message.status, "meta_error");
    assert.equal(body.sendResult.retried, true);
    assert.equal(body.sendResult.originalTo, "5551981675115");
    assert.equal(body.sendResult.retryTo, "555181675115");
    assert.equal(body.sendResult.attempts.length, 2);
    assert.equal(graphCalls[0].body.to, "5551981675115");
    assert.equal(graphCalls[1].body.to, "555181675115");

    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    const failedMessage = conversations.conversas[0].mensagens.at(-1);
    assert.equal(failedMessage.status, "meta_error");
    assert.equal(failedMessage.retried, true);
    assert.equal(failedMessage.originalTo, "5551981675115");
    assert.equal(failedMessage.retryTo, "555181675115");
    assert.equal(failedMessage.attempts.length, 2);
    assert.equal(failedMessage.attempts[0].response.error.code, 131030);
    assert.equal(failedMessage.attempts[1].response.error.code, 131030);
  } finally {
    await close(server);
    await cleanup();
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousAccessToken;
    if (previousPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumberId;
  }
});

test("POST /webhook/whatsapp envia resposta quando payload Meta vem sem field explicito", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const { server, base, cleanup } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response(JSON.stringify({ messages: [{ id: "wamid-auto-reply-sem-field" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-real-meta-sem-field",
        type: "text",
        text: { body: "Oi SamBah" }
      }, { field: "" }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.directAutoReply.sent, true);
    assert.equal(graphCalls.length, 1);
  } finally {
    await close(server);
    await cleanup();
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousAccessToken;
    if (previousPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumberId;
  }
});

test("POST /webhook/whatsapp tenta nono digito brasileiro quando Meta recusa allowed list", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const { server, base, messagesFile, cleanup } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      if (graphCalls.length === 1) {
        return new Response(JSON.stringify({
          error: {
            message: "(#131030) Recipient phone number not in allowed list",
            code: 131030,
            type: "OAuthException"
          }
        }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ input: "5551980413745", wa_id: "555180413745" }],
        messages: [{ id: "wamid-auto-reply-retry" }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "555180413745",
        id: "wamid-real-meta-br-retry",
        type: "text",
        text: { body: "hy" }
      }, { phoneNumberId: "1234567890" }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.enviado, true);
    assert.equal(body.directAutoReply.sent, true);
    assert.equal(body.directAutoReply.retried, true);
    assert.equal(body.directAutoReply.originalTo, "555180413745");
    assert.equal(body.directAutoReply.retryTo, "5551980413745");
    assert.equal(graphCalls.length, 2);
    assert.equal(JSON.parse(graphCalls[0].options.body).to, "555180413745");
    assert.equal(JSON.parse(graphCalls[1].options.body).to, "5551980413745");
    const history = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(history[0].status, "sent");
    assert.equal(history[0].httpStatus, 200);
    assert.equal(history[0].response.messages[0].id, "wamid-auto-reply-retry");
  } finally {
    await close(server);
    await cleanup();
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousAccessToken;
    if (previousPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumberId;
  }
});

test("POST /webhook/whatsapp registra callback Meta de status sem reenviar mensagem", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const { server, base, auditFile, messagesFile, conversationsFile, cleanup } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  try {
    await writeFile(messagesFile, JSON.stringify([{
      id: "out_1",
      direction: "out",
      provider: "meta",
      phone: "5551999999999",
      providerMessageId: "wamid-status-only",
      text: "Buenas",
      status: "sent",
      response: { messages: [{ id: "wamid-status-only" }] },
      createdAt: "2026-07-03T10:00:00.000Z"
    }]), "utf8");
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_5551999999999",
        nome: "Cliente Meta",
        telefone: "5551999999999",
        mensagens: [{
          id: "msg_out_1",
          direction: "out",
          type: "text",
          text: "Buenas",
          status: "sent",
          providerMessageId: "wamid-status-only",
          response: { messages: [{ id: "wamid-status-only" }] },
          createdAt: "2026-07-03T10:00:00.000Z"
        }],
        createdAt: "2026-07-03T10:00:00.000Z",
        updatedAt: "2026-07-03T10:00:00.000Z"
      }]
    }), "utf8");
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5551980413745",
                phone_number_id: "1234567890"
              },
              statuses: [{
                id: "wamid-status-only",
                status: "delivered",
                timestamp: "1782214373",
                recipient_id: "5551999999999"
              }]
            }
          }]
        }]
      })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.reason, "meta_status_callback");
    assert.equal(body.statuses, 1);
    assert.equal(body.updated, 1);
    assert.equal(graphCalls.length, 0);
    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages[0].status, "delivered");
    assert.equal(messages[0].statusUpdatedAt.length > 0, true);
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas[0].mensagens[0].status, "delivered");
    assert.equal(conversations.conversas[0].mensagens[0].statusUpdatedAt.length > 0, true);
    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.ok(audit.some((event) => event.type === "whatsapp_meta_status_callback"));
  } finally {
    await close(server);
    await cleanup();
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousAccessToken;
    if (previousPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumberId;
  }
});

test("POST /api/conversas/mesa-pedido vincula pedido Mesa por conversationId", async () => {
  const { server, base, conversationsFile, cleanup } = await createTestServer();
  try {
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_55517776666",
        nome: "Cliente Mesa",
        telefone: "55517776666",
        atendimentoEstado: "AGUARDANDO_PEDIDO_MESA",
        status: "aguardando_cliente",
        mensagens: [],
        createdAt: "2026-07-04T12:00:00.000Z",
        updatedAt: "2026-07-04T12:00:00.000Z"
      }]
    }), "utf8");

    const missingReference = await fetch(`${base}/api/conversas/mesa-pedido`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mesaOrderId: "mesa-sem-referencia",
        customerName: "Cliente Mesa",
        origin: "WHATSAPP_SAMBAH"
      })
    });
    const missingBody = await missingReference.json();
    assert.equal(missingReference.status, 400);
    assert.equal(missingBody.ok, false);
    assert.equal(missingBody.error, "conversation_reference_required");

    const response = await fetch(`${base}/api/conversas/mesa-pedido`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "wa_55517776666",
        mesaOrderId: "mesa-789",
        customerName: "Cliente Mesa",
        mode: "retirada",
        total: 42,
        origin: "WHATSAPP_SAMBAH"
      })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.conversa.atendimentoEstado, "PEDIDO_MESA_RECEBIDO");
    assert.equal(body.mesaPedido.id, "mesa-789");
    assert.equal(body.mesaPedido.origem, "WHATSAPP_SAMBAH");
  } finally {
    await close(server);
    await cleanup();
  }
});

test("POST /webhook/site continua respondendo 202", async () => {
  const { server, base, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/webhook/site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "site-preservado-1",
        source: "site",
        name: "Cliente Site",
        phone: "51999990000",
        message: "quero falar com pessoa"
      })
    });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.ok, true);
  } finally {
    await close(server);
    await cleanup();
  }
});

async function createTestServer({ provider = new MockWhatsAppProvider({ logger: { info: () => {} } }), whatsappSendFetch = globalThis.fetch } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambha-wa-meta-"));
  await writeFile(join(dir, "menu.json"), JSON.stringify({ items: menuItems(), updatedAt: "2026-06-15T00:00:00.000Z" }), "utf8");
  await writeFile(join(dir, "rules.json"), JSON.stringify(menuRules()), "utf8");
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json"), fetchImpl: async () => new Response("{}", { status: 202 }) });
  const eventService = new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "services.json") });
  const conversationsFile = join(dir, "conversas.json");
  const whatsappConversationService = new WhatsAppConversationService({ filePath: conversationsFile });
  const whatsappMessageService = new WhatsAppMessageService({
    provider,
    sessionsFile: join(dir, "sessions.json"),
    messagesFile: join(dir, "messages.json")
  });
  const crmService = new CrmService({
    files: {
      clientes: join(dir, "clientes.json"),
      leads: join(dir, "leads.json"),
      atendimentos: join(dir, "atendimentos.json"),
      eventos: join(dir, "eventos.json"),
      precomandas: join(dir, "precomandas.json")
    }
  });
  const server = createApp({
    auditService,
    menuService,
    draftService,
    mesaService,
    eventService,
    crmService,
    conversationService: new SambahConversationService({ scriptsFile: join(dir, "scripts.json") }),
    whatsappConversationService,
    whatsappMessageService,
    whatsappSendFetch
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    auditFile: join(dir, "audit.json"),
    messagesFile: join(dir, "messages.json"),
    conversationsFile,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

function metaPayload(message, { phoneNumberId = "1234567890", field = "messages" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field,
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "5551980413745",
            phone_number_id: phoneNumberId
          },
          contacts: [{ profile: { name: "Cliente Meta" }, wa_id: message.from }],
          messages: [message]
        }
      }]
    }]
  };
}

function menuItems() {
  return [{ productId: "kachurrasco", name: "Kachurrasco", price: 24, available: true, addons: [] }];
}

function menuRules() {
  return { version: 1, globalSynonyms: {}, products: { kachurrasco: { aliases: ["kachurrasco"], keywords: [] } }, addons: {} };
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}
