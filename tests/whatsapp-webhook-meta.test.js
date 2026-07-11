import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { AuditService } from "../src/auditService.js";
import { CrmService } from "../src/crmService.js";
import { EventScheduleService } from "../src/eventScheduleService.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { OrderDraftService } from "../src/orderDraftService.js";
import { SambahConversationService } from "../src/sambahConversationService.js";
import { createApp } from "../src/server.js";
import { getRuntimeConfig } from "../src/config.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";
import { MockWhatsAppProvider } from "../src/whatsapp/providers/mockProvider.js";
import { whatsappMaintenanceHandler } from "../src/whatsapp/whatsappMaintenanceHandler.js";
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
    restoreEnv("WHATSAPP_META_VERIFY_TOKEN", previous);
  }
});

test("POST /webhook/whatsapp aceita assinatura valida quando obrigatoria", async () => {
  const previousRequired = process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED;
  const previousSecret = process.env.SAMBAH_WEBHOOK_SECRET;
  process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED = "true";
  process.env.SAMBAH_WEBHOOK_SECRET = "segredo-webhook-teste";
  const { server, base, cleanup } = await createTestServer();
  try {
    const raw = JSON.stringify(metaPayload({
      from: "5551999999901",
      id: "wamid-signature-valid",
      type: "text",
      text: { body: "oi" }
    }));
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signMetaBody(raw, process.env.SAMBAH_WEBHOOK_SECRET) },
      body: raw
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED", previousRequired);
    restoreEnv("SAMBAH_WEBHOOK_SECRET", previousSecret);
  }
});

test("POST /webhook/whatsapp rejeita assinatura invalida ou ausente quando obrigatoria", async () => {
  const previousRequired = process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED;
  const previousSecret = process.env.SAMBAH_WEBHOOK_SECRET;
  process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED = "true";
  process.env.SAMBAH_WEBHOOK_SECRET = "segredo-webhook-teste";
  const { server, base, cleanup } = await createTestServer();
  const raw = JSON.stringify(metaPayload({
    from: "5551999999902",
    id: "wamid-signature-invalid",
    type: "text",
    text: { body: "oi" }
  }));
  try {
    const missing = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw
    });
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).error, "meta_signature_missing");

    const invalid = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=invalid" },
      body: raw
    });
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.json()).error, "meta_signature_invalid");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED", previousRequired);
    restoreEnv("SAMBAH_WEBHOOK_SECRET", previousSecret);
  }
});

test("POST /webhook/whatsapp preserva compatibilidade sem assinatura quando flag esta desligada", async () => {
  const previousRequired = process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED;
  process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED = "false";
  const { server, base, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999903",
        id: "wamid-signature-optional",
        type: "text",
        text: { body: "oi" }
      }))
    });
    assert.equal(response.status, 200);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED", previousRequired);
  }
});

test("POST /webhook/whatsapp com assinatura obrigatoria e segredo ausente retorna erro controlado", async () => {
  const previousRequired = process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED;
  const previousSecret = process.env.SAMBAH_WEBHOOK_SECRET;
  const previousWhatsappSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  process.env.WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED = "true";
  delete process.env.SAMBAH_WEBHOOK_SECRET;
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
  const { server, base, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999904",
        id: "wamid-signature-no-secret",
        type: "text",
        text: { body: "oi" }
      }))
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "meta_signature_configuration_incomplete");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_WEBHOOK_SIGNATURE_REQUIRED", previousRequired);
    restoreEnv("SAMBAH_WEBHOOK_SECRET", previousSecret);
    restoreEnv("WHATSAPP_WEBHOOK_SECRET", previousWhatsappSecret);
  }
});

test("POST /webhook/whatsapp retorna 413 para corpo acima do limite e 400 para JSON invalido", async () => {
  const { server, base, cleanup } = await createTestServer();
  try {
    const oversized = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"payload":"${"x".repeat(1024 * 1024 + 1)}"}`
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error, "payload_too_large");

    const invalid = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid-json"
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, "invalid_json");
  } finally {
    await close(server);
    await cleanup();
  }
});

test("POST /webhook/whatsapp registra entrada Meta sem auto-resposta ou provider", async () => {
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "meta-token-teste";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const graphCalls = [];
  const providerCalls = [];
  const { server, base, messagesFile, conversationsFile, auditFile, cleanup } = await createTestServer({
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
      return new Response("{}", { status: 200 });
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551999999999",
        id: "wamid-disabled-text",
        type: "text",
        text: { body: "quero o cardapio" }
      }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.engine, "disabled");
    assert.equal(body.reason, "whatsapp_v2_disabled");
    assert.equal(body.automaticReplyCreated, false);
    assert.equal(body.sent, false);
    assert.equal(body.handled, false);
    assert.equal(body.conversa.whatsappEngine, "disabled");
    assert.equal(body.conversa.respostaSugerida, "");
    assert.equal(body.conversa.automaticReplyCreated, false);
    assert.equal(body.normalized.message, "quero o cardapio");
    assert.equal(graphCalls.length, 0);
    assert.equal(providerCalls.length, 0);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].direction, "in");
    assert.equal(messages[0].text, "quero o cardapio");
    assert.equal(messages[0].status, "received");

    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 1);
    assert.equal(conversations.conversas[0].mensagens.length, 1);
    assert.equal(conversations.conversas[0].mensagens[0].direction, "in");
    assert.equal(conversations.conversas[0].whatsappEngine, "disabled");

    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.ok(audit.some((event) => event.type === "whatsapp_v2_disabled"));
    assert.equal(audit.some((event) => event.type === "intent_detected"), false);
    assert.equal(audit.some((event) => event.type === "operation_router"), false);
    assert.equal(audit.some((event) => event.type === "whatsapp_cloud_auto_reply"), false);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSendEnabled);
    restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previousPhoneNumberId);
  }
});

test("POST /webhook/whatsapp preserva callback de status Meta sem envio", async () => {
  const graphCalls = [];
  const { server, base, messagesFile, conversationsFile, auditFile, v2StateFile, cleanup } = await createTestServer({
    whatsappSendFetch: async (url, options) => {
      graphCalls.push({ url, options });
      return new Response("{}", { status: 200 });
    }
  });
  try {
    await writeFile(messagesFile, JSON.stringify([{
      id: "out_1",
      direction: "out",
      provider: "meta",
      phone: "5551999999999",
      providerMessageId: "wamid-status-only",
      text: "Resposta manual",
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
          text: "Resposta manual",
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
      body: JSON.stringify(statusPayload())
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
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas[0].mensagens[0].status, "delivered");
    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.ok(audit.some((event) => event.type === "whatsapp_meta_status_callback"));
  } finally {
    await close(server);
    await cleanup();
  }
});

test("POST /webhook/whatsapp ignora duplicata por messageId sem auto-resposta", async () => {
  const graphCalls = [];
  const providerCalls = [];
  const { server, base, messagesFile, conversationsFile, cleanup } = await createTestServer({
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
      return new Response("{}", { status: 200 });
    }
  });
  try {
    const payload = metaPayload({
      from: "5551888888888",
      id: "wamid-duplicate-neutral",
      type: "text",
      text: { body: "oi" }
    });

    const first = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const second = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const firstBody = await first.json();
    const secondBody = await second.json();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(firstBody.automaticReplyCreated, false);
    assert.equal(secondBody.automaticReplyCreated, false);
    assert.equal(secondBody.handled, false);
    assert.equal(secondBody.engine, "disabled");
    assert.equal(secondBody.conversa.mensagens.length, 1);
    assert.equal(secondBody.message.id, "wamid-duplicate-neutral");
    assert.equal(graphCalls.length, 0);
    assert.equal(providerCalls.length, 0);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, "wamid-duplicate-neutral");

    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 1);
    assert.equal(conversations.conversas[0].mensagens.length, 1);
    assert.equal(conversations.conversas[0].mensagens[0].id, "wamid-duplicate-neutral");
    assert.equal(conversations.conversas[0].automaticReplyCreated, false);
    assert.equal(conversations.conversas[0].whatsappEngine, "disabled");

    const inbox = await fetch(`${base}/api/conversas`);
    const inboxBody = await inbox.json();
    assert.equal(inbox.status, 200);
    assert.equal(inboxBody.count, 1);
    assert.equal(inboxBody.items[0].mensagens.length, 1);
    assert.equal(inboxBody.items[0].mensagens[0].id, "wamid-duplicate-neutral");
  } finally {
    await close(server);
    await cleanup();
  }
});

test("WhatsApp V2 nao reserva messageId se a gravacao neutra falhar", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-v2-no-orphan-reservation-"));
  const messageId = "wamid-no-orphan-reservation";
  try {
    await assert.rejects(
      () => whatsappMaintenanceHandler(metaPayload({
        from: "5551999999910",
        id: messageId,
        type: "text",
        text: { body: "oi" }
      }), {
        conversationService: {
          recordNeutralIncoming: async () => {
            throw new SyntaxError("Unexpected non-whitespace character after JSON at position 321106");
          }
        },
        messageService: {
          handleIncoming: async () => {
            throw new Error("message service should not run after neutral storage failure");
          }
        },
        auditService: { record: async () => ({ duplicated: false }) },
        whatsappProvider: { sendMessage: async () => ({ sent: true }) },
        runtimeConfig: {
          dataDir: dir,
          whatsappV2: {
            enabled: true,
            autoReplyEnabled: true,
            sendEnabled: true
          },
          whatsappBusiness: {
            accessToken: "token-test",
            phoneNumberId: "phone-number-test"
          }
        }
      }),
      /Unexpected non-whitespace/
    );
    await assert.rejects(() => readFile(join(dir, "whatsapp-v2-state.json"), "utf8"), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("POST /webhook/whatsapp V2 operacional cria outbound sem sender quando envio esta desabilitado", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  const previousSend = process.env.WHATSAPP_SEND_ENABLED;
  const previousAi = process.env.WHATSAPP_AI_ENABLED;
  const previousAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  process.env.WHATSAPP_V2_ENABLED = "true";
  process.env.WHATSAPP_SEND_ENABLED = "false";
  process.env.WHATSAPP_AI_ENABLED = "false";
  process.env.WHATSAPP_AUTO_REPLY_ENABLED = "true";

  const providerCalls = [];
  const { server, base, messagesFile, conversationsFile, auditFile, v2StateFile, cleanup } = await createTestServer({
    provider: {
      name: "meta-test-provider",
      status: () => ({ provider: "meta-test-provider", configured: true }),
      sendText: async (input) => {
        providerCalls.push(input);
        return { ok: true, sent: true, status: "sent_by_provider" };
      }
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551777777777",
        id: "wamid-v2-observe-only",
        type: "text",
        text: { body: "oi" }
      }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.handled, true);
    assert.equal(body.engine, "v2");
    assert.equal(body.mode, "operational");
    assert.equal(body.reason, "whatsapp_sender_disabled");
    assert.equal(body.automaticReplyCreated, true);
    assert.equal(body.sent, false);
    assert.equal(body.aiCalled, false);
    assert.equal(body.senderCalled, false);
    assert.equal(body.outboxCreated, true);
    assert.equal(providerCalls.length, 0);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 2);
    assert.equal(messages.filter((message) => message.direction === "out").length, 1);
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 1);
    assert.equal(conversations.conversas[0].mensagens.length, 2);
    assert.equal(conversations.conversas[0].mensagens.some((message) => message.direction === "out"), true);
    const v2State = JSON.parse(await readFile(v2StateFile, "utf8"));
    assert.equal(v2State.states["5551777777777"].activeMenu, "portal_main_menu");
    assert.equal(v2State.states["5551777777777"].history.length, 1);

    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.equal(audit.filter((event) => event.type === "whatsapp_v2_operational_reply_not_sent").length, 1);
    assert.equal(audit.some((event) => event.type === "intent_detected"), false);
    assert.equal(audit.some((event) => event.type === "operation_router"), false);
    assert.equal(audit.some((event) => event.type === "whatsapp_cloud_auto_reply"), false);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSend);
    restoreEnv("WHATSAPP_AI_ENABLED", previousAi);
    restoreEnv("WHATSAPP_AUTO_REPLY_ENABLED", previousAutoReply);
  }
});

test("POST /webhook/whatsapp V2 operacional ignora duplicata antes do segundo outbound", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  const previousAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  const previousSend = process.env.WHATSAPP_SEND_ENABLED;
  process.env.WHATSAPP_V2_ENABLED = "true";
  process.env.WHATSAPP_AUTO_REPLY_ENABLED = "true";
  process.env.WHATSAPP_SEND_ENABLED = "false";
  const { server, base, messagesFile, conversationsFile, auditFile, cleanup } = await createTestServer();
  try {
    const payload = metaPayload({
      from: "5551666666666",
      id: "wamid-v2-duplicate-observe",
      type: "text",
      text: { body: "oi" }
    });
    const first = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const second = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const firstBody = await first.json();
    const secondBody = await second.json();

    assert.equal(firstBody.engine, "v2");
    assert.equal(firstBody.mode, "operational");
    assert.equal(second.status, 200);
    assert.equal(secondBody.ok, true);
    assert.equal(secondBody.handled, false);
    assert.equal(secondBody.duplicate, true);
    assert.equal(secondBody.reason, "duplicate_message");
    assert.equal(secondBody.automaticReplyCreated, false);
    assert.equal(secondBody.sent, false);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 2);
    assert.equal(messages.filter((message) => message.direction === "out").length, 1);
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas[0].mensagens.length, 2);
    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.equal(audit.filter((event) => event.type === "whatsapp_v2_operational_reply_not_sent").length, 1);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
    restoreEnv("WHATSAPP_AUTO_REPLY_ENABLED", previousAutoReply);
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSend);
  }
});

test("POST /webhook/whatsapp V2 operacional com sender habilitado chama provider e salva providerMessageId", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  const previousSend = process.env.WHATSAPP_SEND_ENABLED;
  const previousAi = process.env.WHATSAPP_AI_ENABLED;
  const previousAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const previousWhatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_V2_ENABLED = "true";
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.WHATSAPP_AI_ENABLED = "false";
  process.env.WHATSAPP_AUTO_REPLY_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "token-teste";
  process.env.META_PHONE_NUMBER_ID = "1234567890";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const providerCalls = [];
  const { server, base, messagesFile, conversationsFile, cleanup } = await createTestServer({
    provider: {
      name: "meta",
      status: () => ({ provider: "meta", configured: true }),
      sendMessage: async (input) => {
        providerCalls.push(input);
        return { ok: true, sent: true, status: "sent", providerMessageId: "wamid-provider-v2", response: { messages: [{ id: "wamid-provider-v2" }] }, metaMessageType: input.message?.type || "text" };
      }
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551555555555",
        id: "wamid-v2-send-operational",
        type: "text",
        text: { body: "oi" }
      }, { phoneNumberId: "phone-id-from-webhook" }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.engine, "v2");
    assert.equal(body.mode, "operational");
    assert.equal(body.sent, true);
    assert.equal(body.senderCalled, true);
    assert.equal(body.providerMessageId, "wamid-provider-v2");
    assert.equal(body.outboundCommand.conversationId, "5551555555555");
    assert.equal(body.outboundCommand.recipient, "5551555555555");
    assert.equal(body.outboundCommand.interactive, null);
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].to, "5551555555555");
    assert.equal(providerCalls[0].message.type, "text");
    assert.equal(providerCalls[0].phoneNumberId, "phone-id-from-webhook");
    assert.match(providerCalls[0].message.text, /^Portal Insano\nEscolha uma area para continuar:/);
    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.find((message) => message.direction === "out").providerMessageId, "wamid-provider-v2");
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas[0].mensagens.find((message) => message.direction === "out").providerMessageId, "wamid-provider-v2");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSend);
    restoreEnv("WHATSAPP_AI_ENABLED", previousAi);
    restoreEnv("WHATSAPP_AUTO_REPLY_ENABLED", previousAutoReply);
    restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
    restoreEnv("META_PHONE_NUMBER_ID", previousPhoneNumberId);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previousWhatsappPhoneNumberId);
  }
});

test("POST /webhook/whatsapp V2 envia para o from bruto da Meta antes de aliases com nono digito", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  const previousSend = process.env.WHATSAPP_SEND_ENABLED;
  const previousAi = process.env.WHATSAPP_AI_ENABLED;
  const previousAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const previousWhatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_V2_ENABLED = "true";
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.WHATSAPP_AI_ENABLED = "false";
  process.env.WHATSAPP_AUTO_REPLY_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "token-teste";
  process.env.META_PHONE_NUMBER_ID = "1234567890";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const providerCalls = [];
  const { server, base, conversationsFile, cleanup } = await createTestServer({
    provider: {
      name: "meta",
      status: () => ({ provider: "meta", configured: true }),
      sendMessage: async (input) => {
        providerCalls.push(input);
        return { ok: true, sent: true, status: "sent", providerMessageId: "wamid-provider-raw-from", response: { messages: [{ id: "wamid-provider-raw-from" }] }, metaMessageType: "interactive_list" };
      }
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "555181675115",
        id: "wamid-v2-raw-from-send",
        type: "text",
        text: { body: "oi" }
      }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.sent, true);
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].to, "555181675115");
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas[0].telefone, "5551981675115");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSend);
    restoreEnv("WHATSAPP_AI_ENABLED", previousAi);
    restoreEnv("WHATSAPP_AUTO_REPLY_ENABLED", previousAutoReply);
    restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
    restoreEnv("META_PHONE_NUMBER_ID", previousPhoneNumberId);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previousWhatsappPhoneNumberId);
  }
});

test("POST /webhook/whatsapp V2 operacional com Meta sem config retorna erro explicito", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  const previousSend = process.env.WHATSAPP_SEND_ENABLED;
  const previousAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const previousWhatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_V2_ENABLED = "true";
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.WHATSAPP_AUTO_REPLY_ENABLED = "true";
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  const { server, base, messagesFile, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551444444444",
        id: "wamid-v2-meta-missing",
        type: "text",
        text: { body: "oi" }
      }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.reason, "meta_configuration_incomplete");
    assert.equal(body.sent, false);
    assert.equal(body.automaticReplyCreated, true);
    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.find((message) => message.direction === "out").status, "meta_configuration_incomplete");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSend);
    restoreEnv("WHATSAPP_AUTO_REPLY_ENABLED", previousAutoReply);
    restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
    restoreEnv("META_PHONE_NUMBER_ID", previousPhoneNumberId);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previousWhatsappPhoneNumberId);
  }
});

test("POST /webhook/whatsapp V2 operacional salva failed quando provider Meta rejeita", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  const previousSend = process.env.WHATSAPP_SEND_ENABLED;
  const previousAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const previousWhatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_V2_ENABLED = "true";
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.WHATSAPP_AUTO_REPLY_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "token-teste";
  process.env.META_PHONE_NUMBER_ID = "1234567890";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
  const { server, base, messagesFile, conversationsFile, cleanup } = await createTestServer({
    provider: {
      name: "meta",
      status: () => ({ provider: "meta", configured: true }),
      sendMessage: async () => ({ ok: false, sent: false, status: "meta_error", httpStatus: 400, response: { error: { message: "rejected" } }, metaMessageType: "interactive_list" })
    }
  });
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551333333333",
        id: "wamid-v2-meta-failed",
        type: "text",
        text: { body: "oi" }
      }))
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.reason, "meta_send_failed");
    assert.equal(body.sent, false);
    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.find((message) => message.direction === "out").status, "meta_error");
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas[0].mensagens.find((message) => message.direction === "out").status, "meta_error");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSend);
    restoreEnv("WHATSAPP_AUTO_REPLY_ENABLED", previousAutoReply);
    restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
    restoreEnv("META_PHONE_NUMBER_ID", previousPhoneNumberId);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previousWhatsappPhoneNumberId);
  }
});

test("POST /webhook/whatsapp status Meta nao entra na V2 operacional", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  process.env.WHATSAPP_V2_ENABLED = "true";
  const { server, base, messagesFile, conversationsFile, auditFile, cleanup } = await createTestServer();
  try {
    await writeFile(messagesFile, JSON.stringify([{
      id: "out_1",
      direction: "out",
      provider: "meta",
      phone: "5551999999999",
      providerMessageId: "wamid-status-only",
      text: "Resposta manual",
      status: "sent",
      response: { messages: [{ id: "wamid-status-only" }] },
      createdAt: "2026-07-03T10:00:00.000Z"
    }]), "utf8");
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_5551999999999",
        telefone: "5551999999999",
        mensagens: [{ id: "msg_out_1", direction: "out", providerMessageId: "wamid-status-only", response: { messages: [{ id: "wamid-status-only" }] }, status: "sent" }]
      }]
    }), "utf8");

    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(statusPayload())
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.reason, "meta_status_callback");
    const audit = JSON.parse(await readFile(auditFile, "utf8"));
    assert.equal(audit.some((event) => event.type === "whatsapp_v2_operational_reply_sent"), false);
    assert.equal(audit.some((event) => event.type === "whatsapp_v2_operational_reply_not_sent"), false);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
  }
});

test("WhatsApp V2 operacional final: idempotencia, HUMANO, manual, status e automatico", async () => {
  const previousV2 = process.env.WHATSAPP_V2_ENABLED;
  const previousSend = process.env.WHATSAPP_SEND_ENABLED;
  const previousAi = process.env.WHATSAPP_AI_ENABLED;
  const previousAutoReply = process.env.WHATSAPP_AUTO_REPLY_ENABLED;
  const previousAccessToken = process.env.META_ACCESS_TOKEN;
  const previousPhoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const previousWhatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_V2_ENABLED = "true";
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.WHATSAPP_AI_ENABLED = "false";
  process.env.WHATSAPP_AUTO_REPLY_ENABLED = "true";
  process.env.META_ACCESS_TOKEN = "token-teste";
  process.env.META_PHONE_NUMBER_ID = "1234567890";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

  const providerCalls = [];
  let providerSeq = 0;
  const { server, base, messagesFile, conversationsFile, v2StateFile, cleanup } = await createTestServer({
    provider: {
      name: "meta",
      status: () => ({ provider: "meta", configured: true, sendEnabled: true, phoneNumberIdConfigured: true, accessTokenConfigured: true, verifyTokenConfigured: true }),
      sendMessage: async (input) => {
        providerCalls.push({ method: "sendMessage", input });
        providerSeq += 1;
        return { ok: true, sent: true, status: "sent", providerMessageId: `wamid-provider-auto-${providerSeq}`, response: { messages: [{ id: `wamid-provider-auto-${providerSeq}` }] }, metaMessageType: input.message?.type || "text" };
      },
      sendText: async (input) => {
        providerCalls.push({ method: "sendText", input });
        providerSeq += 1;
        return { ok: true, sent: true, status: "sent", providerMessageId: `wamid-provider-manual-${providerSeq}`, response: { messages: [{ id: `wamid-provider-manual-${providerSeq}` }] }, metaMessageType: "text" };
      }
    }
  });
  try {
    const duplicated = metaPayload({ from: "555180413745", id: "wamid-final-dup", type: "text", text: { body: "oi" } });
    const [first, duplicate] = await Promise.all([
      fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(duplicated) }),
      fetch(`${base}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(duplicated) })
    ]);
    const firstBody = await first.json();
    const duplicateBody = await duplicate.json();
    const sentBody = firstBody.outboundCommand ? firstBody : duplicateBody;
    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal([firstBody.duplicate, duplicateBody.duplicate].filter(Boolean).length, 1);
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].method, "sendMessage");
    assert.equal(providerCalls[0].input.to, "555180413745");
    assert.deepEqual(providerCalls[0].input.message, {
      type: "text",
      text: "Portal Insano\nEscolha uma area para continuar:\n1. Insano Food Truck\n2. Xeriffe Obirici\n3. Granja Aguas da Lagoa\n4. Desenvolvimento de Tecnologias\n5. Atendimento Humano"
    });
    assert.equal(sentBody.outboundCommand.recipient, "555180413745");
    assert.equal(sentBody.outboundCommand.interactive, null);
    assert.equal(sentBody.outboundCommand.correlationId, "wa-v2-reply:wamid-final-dup");

    let conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 1);
    assert.equal(conversations.conversas[0].telefone, "5551980413745");
    assert.equal(conversations.conversas[0].mensagens.filter((message) => message.direction === "in").length, 1);
    assert.equal(conversations.conversas[0].mensagens.filter((message) => message.direction === "out").length, 1);

    await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({ from: "555180413745", id: "wamid-final-human", type: "text", text: { body: "humano" } }))
    });
    const callsAfterHumanCommand = providerCalls.length;
    const humanFollowup = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({ from: "555180413745", id: "wamid-final-human-followup", type: "text", text: { body: "preciso de alguem" } }))
    });
    const humanFollowupBody = await humanFollowup.json();
    assert.equal(humanFollowupBody.reason, "human_state_blocks_automation");
    assert.equal(providerCalls.length, callsAfterHumanCommand);

    const v2State = JSON.parse(await readFile(v2StateFile, "utf8"));
    assert.equal(v2State.states["5551980413745"].serviceState, "HUMANO");

    const manual = await fetch(`${base}/api/conversas/wa_5551980413745/responder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Atendimento manual confirmado." })
    });
    const manualBody = await manual.json();
    assert.equal(manual.status, 200);
    assert.equal(manualBody.enviado, true);
    assert.match(manualBody.message.providerMessageId, /^wamid-provider-manual-/);
    assert.equal(manualBody.conversa.status, "humano");

    const providerMessageId = manualBody.message.providerMessageId;
    for (const status of ["sent", "delivered", "read", "failed"]) {
      const callback = await fetch(`${base}/webhook/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          object: "whatsapp_business_account",
          entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: providerMessageId, status, timestamp: "1782214373", recipient_id: "555180413745" }] } }] }]
        })
      });
      assert.equal(callback.status, 200);
    }

    const automatic = await fetch(`${base}/api/conversas/wa_555180413745/automatico`, { method: "POST" });
    assert.equal(automatic.status, 200);
    const automaticState = JSON.parse(await readFile(v2StateFile, "utf8"));
    assert.equal(automaticState.states["5551980413745"].serviceState, "AUTOMATICO");

    await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({ from: "555180413745", id: "wamid-final-after-auto", type: "text", text: { body: "oi" } }))
    });
    assert.equal(providerCalls.filter((call) => call.method === "sendMessage").length, 3);
    assert.equal(providerCalls.filter((call) => call.method === "sendText").length, 1);
    assert.ok(providerCalls.filter((call) => call.method === "sendMessage").every((call) => call.input.message.type === "text"));

    const status = await (await fetch(`${base}/admin/whatsapp/status`)).json();
    assert.equal(status.engine, "v2");
    assert.equal(status.aiEnabled, false);
    assert.equal(status.autoReplyEnabled, true);
    assert.equal(status.provider, "meta");

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.ok(messages.some((message) => message.providerMessageId === providerMessageId && message.status === "failed"));
    conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    const manualMessage = conversations.conversas[0].mensagens.find((message) => message.providerMessageId === providerMessageId);
    assert.equal(manualMessage.status, "failed");
    assert.equal(conversations.conversas[0].mensagens.filter((message) => message.id === "wamid-final-dup").length, 1);
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("WHATSAPP_V2_ENABLED", previousV2);
    restoreEnv("WHATSAPP_SEND_ENABLED", previousSend);
    restoreEnv("WHATSAPP_AI_ENABLED", previousAi);
    restoreEnv("WHATSAPP_AUTO_REPLY_ENABLED", previousAutoReply);
    restoreEnv("META_ACCESS_TOKEN", previousAccessToken);
    restoreEnv("META_PHONE_NUMBER_ID", previousPhoneNumberId);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previousWhatsappPhoneNumberId);
  }
});

test("POST /webhook/whatsapp processa multiplas entries, changes e mensagens na ordem", async () => {
  const { server, base, messagesFile, conversationsFile, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(multiMessagePayload())
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.messages, 4);
    assert.equal(body.statuses, 0);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.length, 4);
    assert.deepEqual(messages.map((message) => message.messageId).reverse(), [
      "wamid-multi-1",
      "wamid-multi-2",
      "wamid-multi-3",
      "wamid-multi-4"
    ]);
    const conversations = JSON.parse(await readFile(conversationsFile, "utf8"));
    assert.equal(conversations.conversas.length, 4);
  } finally {
    await close(server);
    await cleanup();
  }
});

test("POST /webhook/whatsapp processa mensagens e statuses sem transformar status em mensagem", async () => {
  const { server, base, messagesFile, conversationsFile, cleanup } = await createTestServer();
  try {
    await writeFile(messagesFile, JSON.stringify([{
      id: "out_status_mix",
      direction: "out",
      provider: "meta",
      phone: "5551999999999",
      providerMessageId: "wamid-status-mixed",
      text: "Resposta anterior",
      status: "sent",
      response: { messages: [{ id: "wamid-status-mixed" }] },
      createdAt: "2026-07-03T10:00:00.000Z"
    }]), "utf8");
    await writeFile(conversationsFile, JSON.stringify({
      conversas: [{
        id: "wa_5551999999999",
        telefone: "5551999999999",
        mensagens: [{ id: "msg_out_status_mix", direction: "out", providerMessageId: "wamid-status-mixed", status: "sent" }]
      }]
    }), "utf8");

    const response = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mixedMessageStatusPayload())
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.messages, 1);
    assert.equal(body.statuses, 1);
    assert.equal(body.updated, 1);

    const messages = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(messages.filter((message) => message.direction === "in").length, 1);
    assert.equal(messages.find((message) => message.providerMessageId === "wamid-status-mixed").status, "read");
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

test("/health retorna versao e commit do build", async () => {
  const previousAppVersion = process.env.APP_VERSION;
  const previousCommit = process.env.RENDER_GIT_COMMIT;
  process.env.APP_VERSION = "whatsapp-v1-removed";
  process.env.RENDER_GIT_COMMIT = "commit-health-test";
  const { server, base, cleanup } = await createTestServer();
  try {
    const response = await fetch(`${base}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "sambah");
    assert.equal(body.commit, "commit-health-test");
    assert.equal(body.version, "whatsapp-v1-removed");
  } finally {
    await close(server);
    await cleanup();
    restoreEnv("APP_VERSION", previousAppVersion);
    restoreEnv("RENDER_GIT_COMMIT", previousCommit);
  }
});

async function createTestServer({ provider = new MockWhatsAppProvider({ logger: { info: () => {} } }), whatsappSendFetch = globalThis.fetch } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambha-wa-maintenance-"));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
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
    whatsappProvider: provider,
    runtimeConfig: getRuntimeConfig(),
    whatsappSendFetch
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    auditFile: join(dir, "audit.json"),
    messagesFile: join(dir, "messages.json"),
    v2StateFile: join(dir, "whatsapp-v2-state.json"),
    conversationsFile,
    cleanup: async () => {
      restoreEnv("DATA_DIR", previousDataDir);
      await rm(dir, { recursive: true, force: true });
    }
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

function statusPayload() {
  return {
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
  };
}

function multiMessagePayload() {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          contacts: [{ profile: { name: "Cliente Um" }, wa_id: "5551999999905" }],
          messages: [
            { from: "5551999999905", id: "wamid-multi-1", type: "text", text: { body: "primeira" } },
            { from: "5551999999906", id: "wamid-multi-2", type: "text", text: { body: "segunda" } }
          ]
        }
      }, {
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          contacts: [{ profile: { name: "Cliente Tres" }, wa_id: "5551999999907" }],
          messages: [{ from: "5551999999907", id: "wamid-multi-3", type: "text", text: { body: "terceira" } }]
        }
      }]
    }, {
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          contacts: [{ profile: { name: "Cliente Quatro" }, wa_id: "5551999999908" }],
          messages: [{ from: "5551999999908", id: "wamid-multi-4", type: "text", text: { body: "quarta" } }]
        }
      }]
    }]
  };
}

function mixedMessageStatusPayload() {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          contacts: [{ profile: { name: "Cliente Mix" }, wa_id: "5551999999909" }],
          messages: [{ from: "5551999999909", id: "wamid-mixed-message", type: "text", text: { body: "oi" } }],
          statuses: [{
            id: "wamid-status-mixed",
            status: "read",
            timestamp: "1782214373",
            recipient_id: "5551999999999"
          }]
        }
      }]
    }]
  };
}

function signMetaBody(raw, secret) {
  return `sha256=${crypto.createHmac("sha256", secret).update(Buffer.from(raw)).digest("hex")}`;
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

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
