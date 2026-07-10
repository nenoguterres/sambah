import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AuditService, maskSensitive } from "../src/auditService.js";
import { CrmService } from "../src/crmService.js";
import { createApp } from "../src/server.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

function tempCrm(dir) {
  return new CrmService({
    files: {
      clientes: join(dir, "clientes.json"),
      leads: join(dir, "leads.json"),
      atendimentos: join(dir, "atendimentos.json"),
      eventos: join(dir, "eventos.json"),
      precomandas: join(dir, "precomandas.json")
    }
  });
}

async function withAudit(fn) {
  const dir = await mkdtemp(join(tmpdir(), "sambha-audit-"));
  const filePath = join(dir, "audit-logs.json");
  try {
    return await fn(new AuditService({ filePath }), filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("mascara telefones, tokens e e-mails antes de persistir", async () => {
  await withAudit(async (audit, filePath) => {
    await audit.record({
      type: "webhook_received",
      status: "info",
      message: "Cliente +55 11 99999-1234 token=abc123 email pessoa@sambha.local",
      context: { phone: "11999991234", nested: { text: "11987654321" } }
    });
    const raw = await readFile(filePath, "utf8");
    assert.match(raw, /\*\*\*1234|\[masked\]/);
    assert.doesNotMatch(raw, /99999-1234|abc123|11999991234|11987654321|pessoa@sambha\.local/);
  });
});

test("gera estatisticas e consulta logs com limite ampliado", async () => {
  await withAudit(async (audit) => {
    for (let index = 0; index < 75; index += 1) {
      await audit.record({ type: "webhook_processed", status: "success", message: `Evento ${index}` });
    }
    const logs = await audit.listLogs({ limit: 100 });
    const stats = await audit.stats();
    assert.equal(logs.total, 75);
    assert.equal(logs.items.length, 75);
    assert.equal(stats.byType.webhook_processed, 75);
    assert.equal(stats.byStatus.success, 75);
  });
});

test("nao duplica processing_error com mesma chave operacional", async () => {
  await withAudit(async (audit) => {
    const first = await audit.record({
      type: "processing_error",
      status: "error",
      message: "Falha ao processar webhook",
      context: { eventId: "evt-1" },
      error: new Error("timeout"),
      dedupeKey: "evt-1"
    });
    const second = await audit.record({
      type: "processing_error",
      status: "error",
      message: "Falha ao processar webhook",
      context: { eventId: "evt-1" },
      error: new Error("timeout"),
      dedupeKey: "evt-1"
    });
    const logs = await audit.listLogs({ limit: 100 });
    assert.equal(first.duplicated, false);
    assert.equal(second.duplicated, true);
    assert.equal(logs.total, 1);
  });
});

test("endpoints HTTP de auditoria respondem stats e logs", async () => {
  await withAudit(async (audit, filePath) => {
    await audit.record({ type: "system_event", status: "info", message: "Servidor iniciado" });
    const server = createApp({ auditService: audit, crmService: tempCrm(dirname(filePath)) });
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    try {
      const statsResponse = await fetch(`http://127.0.0.1:${port}/admin/audit/stats`);
      const logsResponse = await fetch(`http://127.0.0.1:${port}/admin/audit/logs?limit=100`);
      assert.equal(statsResponse.status, 200);
      assert.equal(logsResponse.status, 200);
      assert.equal((await statsResponse.json()).total, 1);
      assert.equal((await logsResponse.json()).items.length, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("webhook registra uma falha operacional sem duplicar erro", async () => {
  await withAudit(async (audit, filePath) => {
    const server = createApp({ auditService: audit, crmService: tempCrm(dirname(filePath)) });
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    try {
      const payload = { eventId: "evt-error-1", from: "11999990000", triggerError: true };
      for (let index = 0; index < 2; index += 1) {
        await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
      }
      const errors = await audit.listLogs({ status: "error", limit: 100 });
      assert.equal(errors.total, 1);
      assert.equal(errors.items[0].type, "processing_error");
      assert.deepEqual(maskSensitive({ phone: "11999990000" }), { phone: "[masked]" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("webhook site nao derruba servidor com auditoria corrompida, body vazio ou JSON invalido", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-webhook-hardening-"));
  const auditFile = join(dir, "audit-logs.json");
  await writeFile(auditFile, "[\n  {}\n]\n\"broken\"", "utf8");
  const audit = new AuditService({ filePath: auditFile });
  const server = createApp({
    auditService: audit,
    crmService: tempCrm(dir),
    whatsappConversationService: new WhatsAppConversationService({ filePath: join(dir, "whatsapp-conversas.json") })
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const validSiteResponse = await fetch(`http://127.0.0.1:${port}/webhook/site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "site-hardening-1",
        source: "site",
        name: "Cliente Site",
        phone: "51999990000",
        message: "quero falar com pessoa"
      })
    });
    assert.equal(validSiteResponse.status, 202);
    assert.equal((await validSiteResponse.json()).ok, true);

    const emptyResponse = await fetch(`http://127.0.0.1:${port}/webhook/site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: ""
    });
    assert.equal(emptyResponse.status, 400);
    assert.equal((await emptyResponse.json()).error, "empty_body");

    const invalidJsonResponse = await fetch(`http://127.0.0.1:${port}/webhook/site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    assert.equal(invalidJsonResponse.status, 400);
    assert.equal((await invalidJsonResponse.json()).error, "invalid_json");

    const homeResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(homeResponse.status, 200);

    const whatsappResponse = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "whatsapp-after-site-error",
        source: "whatsapp",
        from: "51999990000",
        message: "quero falar com pessoa"
      })
    });
    assert.equal(whatsappResponse.status, 200);
    const whatsappBody = await whatsappResponse.json();
    assert.equal(whatsappBody.ok, true);
    assert.equal(whatsappBody.reason, "whatsapp_v2_disabled");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Conversas recebe texto e audio do WhatsApp sem envio automatico", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-whatsapp-ai-"));
  const previousVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const previousSendEnabled = process.env.WHATSAPP_SEND_ENABLED;
  const previousAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const previousVoiceEnabled = process.env.VOICE_REPLY_ENABLED;
  process.env.WHATSAPP_VERIFY_TOKEN = "token-teste";
  process.env.WHATSAPP_SEND_ENABLED = "false";
  process.env.WHATSAPP_ACCESS_TOKEN = "";
  process.env.VOICE_REPLY_ENABLED = "false";

  const auditFile = join(dir, "audit.json");
  const audit = new AuditService({ filePath: auditFile });
  const crmService = tempCrm(dir);
  const whatsappConversationService = new WhatsAppConversationService({
    filePath: join(dir, "whatsapp-conversas.json"),
    now: () => new Date("2026-06-13T12:00:00.000Z")
  });
  const server = createApp({ auditService: audit, crmService, whatsappConversationService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const verifyResponse = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token-teste&hub.challenge=abc123`);
    assert.equal(verifyResponse.status, 200);
    assert.equal(await verifyResponse.text(), "abc123");

    const textResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551980413745",
        id: "wamid-text-1",
        type: "text",
        text: { body: "quero pedir um lanche" }
      }))
    });
    const textBody = await textResponse.json();
    assert.equal(textResponse.status, 200);
    assert.equal(textBody.ok, true);
    assert.equal(textBody.engine, "disabled");
    assert.equal(textBody.reason, "whatsapp_v2_disabled");
    assert.equal(textBody.automaticReplyCreated, false);
    assert.equal(textBody.sent, false);

    const audioResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551980413745",
        id: "wamid-audio-1",
        type: "audio",
        audio: { id: "media-audio-1", mime_type: "audio/ogg" }
      }))
    });
    const audioBody = await audioResponse.json();
    assert.equal(audioResponse.status, 200);
    assert.equal(audioBody.ok, true);
    assert.equal(audioBody.engine, "disabled");
    assert.equal(audioBody.conversa.status, "aguardando_equipe");

    const conversations = await fetch(`${base}/api/conversas`).then((response) => response.json());
    assert.equal(conversations.ok, true);
    assert.equal(conversations.count, 1);
    assert.equal(conversations.items[0].telefone, "5551980413745");
    assert.equal(conversations.items[0].respostaSugerida, "");
    assert.equal(conversations.items[0].whatsappEngine, "disabled");

    const detail = await fetch(`${base}/api/conversas/${encodeURIComponent(conversations.items[0].id)}`).then((response) => response.json());
    assert.equal(detail.ok, true);
    assert.equal(detail.conversa.mensagens[1].mediaId, "media-audio-1");

    const reply = await fetch(`${base}/api/conversas/${encodeURIComponent(conversations.items[0].id)}/responder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Perfeito. Vou te ajudar." })
    }).then((response) => response.json());
    assert.equal(reply.ok, true);
    assert.equal(reply.enviado, false);
    assert.equal(reply.reason, "registrada_sem_envio");

    const humanResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551980413000",
        id: "wamid-human-1",
        type: "text",
        text: { body: "quero falar com humano" }
      }))
    }).then((response) => response.json());
    assert.equal(humanResponse.engine, "disabled");
    assert.equal(humanResponse.sent, false);

    const eventResponse = await fetch(`${base}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metaPayload({
        from: "5551980413999",
        id: "wamid-event-1",
        type: "text",
        text: { body: "tenho evento para 80 pessoas" }
      }))
    }).then((response) => response.json());
    assert.equal(eventResponse.engine, "disabled");
    assert.equal(eventResponse.automaticReplyCreated, false);
    assert.equal(eventResponse.conversa.currentModule, undefined);
    assert.equal(eventResponse.conversa.nextAction, undefined);

    const auditEvents = JSON.parse(await readFile(auditFile, "utf8"));
    assert.ok(auditEvents.some((event) => event.type === "whatsapp_v2_disabled"));
    assert.equal(auditEvents.some((event) => event.type === "intent_detected"), false);
    assert.equal(auditEvents.some((event) => event.type === "operation_router"), false);
    assert.equal(auditEvents.some((event) => event.type === "whatsapp_cloud_auto_reply"), false);

    const page = await fetch(`${base}/conversas`);
    assert.equal(page.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousVerifyToken === undefined) delete process.env.WHATSAPP_VERIFY_TOKEN;
    else process.env.WHATSAPP_VERIFY_TOKEN = previousVerifyToken;
    if (previousSendEnabled === undefined) delete process.env.WHATSAPP_SEND_ENABLED;
    else process.env.WHATSAPP_SEND_ENABLED = previousSendEnabled;
    if (previousAccessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = previousAccessToken;
    if (previousVoiceEnabled === undefined) delete process.env.VOICE_REPLY_ENABLED;
    else process.env.VOICE_REPLY_ENABLED = previousVoiceEnabled;
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Conversas exige ADMIN para excluir mensagem", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-admin-delete-"));
  const filePath = join(dir, "whatsapp-conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551980413745",
      nome: "Cliente Teste",
      telefone: "5551980413745",
      status: "aguardando_equipe",
      mensagens: [{ id: "msg-admin-delete", direction: "in", type: "text", text: "Apagar", createdAt: "2026-06-30T10:00:00.000Z" }],
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:00:00.000Z"
    }]
  }), "utf8");
  const audit = new AuditService({ filePath: join(dir, "audit.json") });
  const whatsappConversationService = new WhatsAppConversationService({ filePath });

  const sessionServer = createApp({
    auditService: audit,
    crmService: tempCrm(dir),
    whatsappConversationService,
    authMode: "session"
  });
  await new Promise((resolve) => sessionServer.listen(0, resolve));
  const sessionBase = `http://127.0.0.1:${sessionServer.address().port}`;
  try {
    const blocked = await fetch(`${sessionBase}/api/conversas/wa_5551980413745/mensagens/msg-admin-delete`, { method: "DELETE" });
    const blockedBody = await blocked.json();
    assert.equal(blocked.status, 401);
    assert.equal(blockedBody.error, "auth_required");
  } finally {
    await new Promise((resolve) => sessionServer.close(resolve));
  }

  const adminServer = createApp({
    auditService: audit,
    crmService: tempCrm(dir),
    whatsappConversationService,
    authMode: "mock"
  });
  await new Promise((resolve) => adminServer.listen(0, resolve));
  const adminBase = `http://127.0.0.1:${adminServer.address().port}`;
  try {
    const deleted = await fetch(`${adminBase}/api/conversas/wa_5551980413745/mensagens/msg-admin-delete`, { method: "DELETE" });
    const deletedBody = await deleted.json();
    assert.equal(deleted.status, 200);
    assert.equal(deletedBody.ok, true);
    assert.equal(deletedBody.removed.text, undefined);
    const saved = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(saved.conversas[0].mensagens.length, 0);
    const auditEvents = JSON.parse(await readFile(join(dir, "audit.json"), "utf8"));
    assert.ok(auditEvents.some((event) => event.type === "whatsapp_conversation_message_deleted"));
  } finally {
    await new Promise((resolve) => adminServer.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Conversas exclui conversa sem uso somente com ADMIN", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-delete-"));
  const filePath = join(dir, "whatsapp-conversas.json");
  const auditFile = join(dir, "audit.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [
      {
        id: "wa_empty",
        nome: "Conversa Vazia",
        telefone: "5551000000000",
        status: "aguardando_equipe",
        mensagens: [],
        createdAt: "2026-06-30T10:00:00.000Z",
        updatedAt: "2026-06-30T10:00:00.000Z"
      },
      {
        id: "wa_active",
        nome: "Conversa Ativa",
        telefone: "5551999999999",
        status: "aguardando_equipe",
        currentModule: "mesa",
        nextAction: "start_order",
        mensagens: [{ id: "msg-active", direction: "in", type: "text", text: "Quero pizza", createdAt: "2026-06-30T10:01:00.000Z" }],
        createdAt: "2026-06-30T10:01:00.000Z",
        updatedAt: "2026-06-30T10:01:00.000Z"
      }
    ]
  }), "utf8");
  const audit = new AuditService({ filePath: auditFile });
  const whatsappConversationService = new WhatsAppConversationService({ filePath });
  const server = createApp({
    auditService: audit,
    crmService: tempCrm(dir),
    whatsappConversationService,
    authMode: "session"
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const atendente = await loginCookie(base, "atendente", "atendente123");
    const blocked = await fetch(`${base}/api/conversas/wa_empty`, {
      method: "DELETE",
      headers: { cookie: atendente.cookie }
    });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).error, "admin_required");

    const admin = await loginCookie(base, "admin", "admin123");
    const active = await fetch(`${base}/api/conversas/wa_active`, {
      method: "DELETE",
      headers: { cookie: admin.cookie }
    });
    const activeBody = await active.json();
    assert.equal(active.status, 409);
    assert.equal(activeBody.error, "conversation_not_deletable");

    const missing = await fetch(`${base}/api/conversas/wa_missing`, {
      method: "DELETE",
      headers: { cookie: admin.cookie }
    });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, "conversation_not_found");

    const deleted = await fetch(`${base}/api/conversas/wa_empty`, {
      method: "DELETE",
      headers: { cookie: admin.cookie }
    });
    const deletedBody = await deleted.json();
    assert.equal(deleted.status, 200);
    assert.equal(deletedBody.ok, true);
    assert.equal(deletedBody.reason, "sem_mensagens");
    const saved = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(saved.conversas.some((item) => item.id === "wa_empty"), false);
    assert.equal(saved.conversas.some((item) => item.id === "wa_active"), true);
    const auditEvents = JSON.parse(await readFile(auditFile, "utf8"));
    const event = auditEvents.find((item) => item.type === "conversation_deleted");
    assert.ok(event);
    assert.equal(event.context.conversationId, "wa_empty");
    assert.equal(event.context.adminUser, "admin");
    assert.equal(event.context.phone, undefined);
    assert.equal(event.context.text, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

async function loginCookie(base, username, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return {
    response,
    json: await response.json(),
    cookie: (response.headers.get("set-cookie") || "").split(";")[0]
  };
}

function metaPayload(message) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: "Cliente Teste" }, wa_id: message.from }],
          messages: [message]
        }
      }]
    }]
  };
}
