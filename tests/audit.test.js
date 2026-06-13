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
  const server = createApp({ auditService: audit, crmService: tempCrm(dir) });
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
    assert.equal(whatsappResponse.status, 202);
    assert.equal((await whatsappResponse.json()).ok, true);
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

  const audit = new AuditService({ filePath: join(dir, "audit.json") });
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
    assert.equal(textBody.intent, "pedido");
    assert.match(textBody.respostaSugerida, /delivery/);
    assert.equal(textBody.enviado, false);

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
    assert.equal(audioBody.conversa.status, "pendente_configuracao");

    const conversations = await fetch(`${base}/api/conversas`).then((response) => response.json());
    assert.equal(conversations.ok, true);
    assert.equal(conversations.count, 1);
    assert.equal(conversations.items[0].telefone, "5551980413745");
    assert.ok(conversations.items[0].respostaSugerida);

    const detail = await fetch(`${base}/api/conversas/${encodeURIComponent(conversations.items[0].id)}`).then((response) => response.json());
    assert.equal(detail.ok, true);
    assert.equal(detail.conversa.audio.mediaId, "media-audio-1");

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
    assert.equal(humanResponse.intent, "humano");
    assert.match(humanResponse.respostaSugerida, /encaminhar/);

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
    assert.equal(eventResponse.intent, "evento");

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
