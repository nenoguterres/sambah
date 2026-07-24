import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../src/auditService.js";
import { SambahAuthService } from "../src/auth/authService.js";
import { CrmService } from "../src/crmService.js";
import { createApp } from "../src/server.js";
import { createSambahPayModule } from "../src/sambahPay/index.js";
import { createRepositoryFactory } from "../src/sambahPay/database/repositoryFactory.js";
import { PostgresRepositoryAdapter } from "../src/sambahPay/database/postgresRepositoryAdapter.js";

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

async function withServer(fn, { authMode = "mock" } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambah-pay-"));
  const audit = new AuditService({ filePath: join(dir, "audit-logs.json") });
  const sambahPayModule = createSambahPayModule({ dataDir: dir, auditService: audit });
  const authService = new SambahAuthService({ secret: "test-secret" });
  const server = createApp({ auditService: audit, crmService: tempCrm(dir), sambahPayModule, authService, authMode });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    return await fn({ baseUrl: `http://127.0.0.1:${port}`, module: sambahPayModule, audit });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

async function requestJson(baseUrl, path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json();
  return { response, json };
}

async function loginCookie(baseUrl, username = "admin", password = "admin123") {
  const result = await requestJson(baseUrl, "/api/auth/login", { method: "POST", body: { username, password } });
  return { ...result, cookie: result.response.headers.get("set-cookie")?.split(";")[0] || "" };
}

test("SamBah Pay expoe health e status sem quebrar health existente", async () => {
  await withServer(async ({ baseUrl }) => {
    const health = await requestJson(baseUrl, "/api/sambah-pay/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.mode, "simulated");

    const existingHealth = await requestJson(baseUrl, "/health");
    assert.equal(existingHealth.response.status, 200);
    assert.equal(existingHealth.json.ok, true);
  });
});

test("Auth interna faz login valido sem expor senha", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await loginCookie(baseUrl, "admin", "admin123");
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.user.username, "admin");
    assert.equal(result.json.user.role, "ADMIN");
    assert.equal(result.json.user.password, undefined);
    assert.match(result.response.headers.get("set-cookie") || "", /HttpOnly/);
  }, { authMode: "session" });
});

test("Auth interna recusa login invalido", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/auth/login", { method: "POST", body: { username: "admin", password: "errada" } });
    assert.equal(result.response.status, 401);
    assert.equal(result.json.error, "invalid_credentials");
    assert.equal(JSON.stringify(result.json).includes("admin123"), false);
  }, { authMode: "session" });
});

test("Auth interna /me exige sessao e retorna usuario logado", async () => {
  await withServer(async ({ baseUrl }) => {
    const anonymous = await requestJson(baseUrl, "/api/auth/me");
    assert.equal(anonymous.response.status, 401);

    const login = await loginCookie(baseUrl, "admin", "admin123");
    const me = await requestJson(baseUrl, "/api/auth/me", { headers: { cookie: login.cookie } });
    assert.equal(me.response.status, 200);
    assert.equal(me.json.user.username, "admin");
    assert.equal(me.json.user.role, "ADMIN");
    assert.equal(me.json.user.passwordHash, undefined);
  }, { authMode: "session" });
});

test("Auth interna logout encerra sessao", async () => {
  await withServer(async ({ baseUrl }) => {
    const login = await loginCookie(baseUrl, "admin", "admin123");
    const logout = await requestJson(baseUrl, "/api/auth/logout", { method: "POST", headers: { cookie: login.cookie } });
    assert.equal(logout.response.status, 200);
    assert.match(logout.response.headers.get("set-cookie") || "", /Max-Age=0/);

    const me = await requestJson(baseUrl, "/api/auth/me", { headers: { cookie: login.cookie } });
    assert.equal(me.response.status, 401);
  }, { authMode: "session" });
});

test("Auth interna protege paginas administrativas", async () => {
  await withServer(async ({ baseUrl }) => {
    for (const path of ["/admin", "/admin/permissoes", "/admin/usuarios", "/admin/auditoria", "/sambah-voice-pay", "/conversas"]) {
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      assert.equal(response.status, 302);
      assert.match(response.headers.get("location") || "", /^\/login\?next=/);
    }
    const login = await loginCookie(baseUrl, "admin", "admin123");
    const conversations = await fetch(`${baseUrl}/conversas`, { headers: { cookie: login.cookie } });
    assert.equal(conversations.status, 200);
  }, { authMode: "session" });
});

test("Auth interna usa perfil ADMIN da sessao em acao critica", async () => {
  await withServer(async ({ baseUrl }) => {
    const login = await loginCookie(baseUrl, "admin", "admin123");
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/checkout", {
      method: "POST",
      headers: { cookie: login.cookie },
      body: { session_id: "session-admin-checkout", amount: 22, confirmed: true }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
  }, { authMode: "session" });
});

test("Auth interna nega acao critica sem sessao mesmo com header mockado", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/checkout", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { session_id: "no-session", amount: 22, confirmed: true }
    });
    assert.equal(result.response.status, 401);
    assert.equal(result.json.error, "auth_required");
  }, { authMode: "session" });
});

test("Auth interna bloqueia ATENDENTE e audita operador real", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const login = await loginCookie(baseUrl, "atendente", "atendente123");
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/wallet-topup", {
      method: "POST",
      headers: { cookie: login.cookie },
      body: { customer_id: "cliente-atendente", amount: 10, confirmed: true }
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.json.error, "permission_denied");
    const logs = await module.repositories.auditLogs.all();
    const denied = logs.find((log) => log.type === "sambah_permission_denied" && log.context?.username === "atendente");
    assert.equal(denied.context.role, "ATENDENTE");
    assert.equal(denied.context.source, "session");
  }, { authMode: "session" });
});

test("Device Controller cadastra device, produto e heartbeat simulado", async () => {
  await withServer(async ({ baseUrl }) => {
    const created = await requestJson(baseUrl, "/api/sambah-pay/devices", {
      method: "POST",
      body: { name: "Chopeira 1", type: "beer_tap", location: "Balcao", control_mode: "volume_based" }
    });
    assert.equal(created.response.status, 200);
    assert.equal(created.json.ok, true);
    const deviceId = created.json.device.id;

    const product = await requestJson(baseUrl, `/api/sambah-pay/devices/${deviceId}/products`, {
      method: "POST",
      body: { product_id: "chopp-300", name: "Chopp 300ml", price: 12, quantity_per_release: 300, unit: "ml", initial_quantity: 3000 }
    });
    assert.equal(product.response.status, 200);
    assert.equal(product.json.ok, true);

    const heartbeat = await requestJson(baseUrl, `/api/sambah-pay/devices/${deviceId}/heartbeat`, { method: "POST", body: { status: "online" } });
    assert.equal(heartbeat.response.status, 200);
    assert.equal(heartbeat.json.device.status, "online");
  });
});

test("AutoServe faz checkout, libera produto uma vez e registra eventos", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const device = await requestJson(baseUrl, "/api/sambah-pay/devices", {
      method: "POST",
      body: { name: "Geladeira", type: "smart_fridge", location: "Salao", control_mode: "unit_based" }
    });
    const deviceId = device.json.device.id;
    await requestJson(baseUrl, `/api/sambah-pay/devices/${deviceId}/products`, {
      method: "POST",
      body: { product_id: "agua", name: "Agua", price: 5, quantity_per_release: 1, unit: "unidade", initial_quantity: 5 }
    });

    const session = await requestJson(baseUrl, "/api/sambah-pay/autoserve/session", { method: "POST", body: { customer_id: "cliente-1" } });
    const sessionId = session.json.session.id;
    const cart = await requestJson(baseUrl, "/api/sambah-pay/autoserve/cart", { method: "POST", body: { session_id: sessionId, product_id: "agua", device_id: deviceId, quantity: 1 } });
    assert.equal(cart.json.ok, true);

    const checkout = await requestJson(baseUrl, "/api/sambah-pay/autoserve/checkout", { method: "POST", body: { session_id: sessionId } });
    assert.equal(checkout.response.status, 200);
    assert.equal(checkout.json.payment.status, "paid");
    assert.equal(checkout.json.release_tokens.length, 1);
    const token = checkout.json.release_tokens[0].token;

    const started = await requestJson(baseUrl, `/api/sambah-pay/releases/${token}/start`, { method: "POST", body: {} });
    assert.equal(started.json.ok, true);

    const completed = await requestJson(baseUrl, `/api/sambah-pay/releases/${token}/complete`, { method: "POST", body: {} });
    assert.equal(completed.json.ok, true);
    assert.equal(completed.json.status, "delivered");

    const reused = await requestJson(baseUrl, `/api/sambah-pay/releases/${token}/validate`, { method: "POST", body: {} });
    assert.equal(reused.response.status, 400);
    assert.equal(reused.json.error, "release_token_already_used");

    const attempts = await module.repositories.releaseAttempts.all();
    const deliveries = await module.repositories.deliveryEvents.all();
    assert.ok(attempts.length >= 3);
    assert.equal(deliveries.length, 1);
  });
});

test("Falha simulada gera machine_alert e pagamento em manual_review", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const device = await requestJson(baseUrl, "/api/sambah-pay/devices", {
      method: "POST",
      body: { name: "Dispenser", type: "soda_dispenser", location: "Balcao", control_mode: "volume_based" }
    });
    const deviceId = device.json.device.id;
    await requestJson(baseUrl, `/api/sambah-pay/devices/${deviceId}/products`, {
      method: "POST",
      body: { product_id: "refri-300", price: 8, quantity_per_release: 300, unit: "ml", initial_quantity: 1000 }
    });
    const payment = await requestJson(baseUrl, "/api/sambah-pay/payments", { method: "POST", body: { amount: 8, status: "paid" } });
    const release = await requestJson(baseUrl, "/api/sambah-pay/releases/create", {
      method: "POST",
      body: { payment_id: payment.json.payment.id, product_id: "refri-300", device_id: deviceId, session_id: "manual-session", quantity: 300, unit: "ml" }
    });
    const token = release.json.release_token.token;
    const failed = await requestJson(baseUrl, `/api/sambah-pay/releases/${token}/fail`, { method: "POST", body: { error_message: "Falha simulada" } });
    assert.equal(failed.json.ok, true);

    const alerts = await module.repositories.machineAlerts.all();
    const updatedPayment = await module.services.coreService.getPayment(payment.json.payment.id);
    assert.equal(alerts.length, 1);
    assert.equal(updatedPayment.status, "manual_review");
  });
});

test("BI dashboard responde com indicadores simulados", async () => {
  await withServer(async ({ baseUrl }) => {
    const dashboard = await requestJson(baseUrl, "/api/sambah-pay/bi/dashboard");
    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.json.ok, true);
    assert.equal(dashboard.json.mode, "simulated");
  });
});


test("SamBah Voice Pay processa audio WhatsApp com transcricao, intent e resposta", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const result = await requestJson(baseUrl, "/api/sambah-voice/webhook/whatsapp", {
      method: "POST",
      body: {
        message_id: "voice-1",
        from: "51999990000",
        media_url: "mock://audio/pedido.ogg",
        transcript: "quero fazer um pedido e pagar pelo SamBah Pay"
      }
    });

    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.transcription.text, "quero fazer um pedido e pagar pelo SamBah Pay");
    assert.equal(result.json.intent.intent, "pagar_conta");
    assert.equal(result.json.intent.confirmation_required, true);
    assert.ok(result.json.response.audio_url.startsWith("mock://tts/"));

    assert.equal((await module.repositories.voiceMessages.all()).length, 1);
    assert.equal((await module.repositories.voiceTranscriptions.all()).length, 1);
    assert.equal((await module.repositories.voiceIntents.all()).length, 1);
    assert.equal((await module.repositories.voiceResponses.all()).length, 1);
  });
});

test("SamBah Voice Pay exige confirmacao para checkout critico", async () => {
  await withServer(async ({ baseUrl }) => {
    const blocked = await requestJson(baseUrl, "/api/sambah-pay/voice/checkout", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { session_id: "voice-session-1", amount: 30 }
    });
    assert.equal(blocked.response.status, 400);
    assert.equal(blocked.json.error, "voice_confirmation_required");

    const confirmed = await requestJson(baseUrl, "/api/sambah-pay/voice/checkout", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { session_id: "voice-session-1", amount: 30, confirmed: true }
    });
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.json.payment.status, "paid");
    assert.equal(confirmed.json.voice_payment_link.type, "checkout");
  });
});

test("SamBah Voice Pay simula compra de credito wallet por voz", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/wallet-topup", {
      method: "POST",
      headers: { "x-sambah-role": "CAIXA" },
      body: { session_id: "voice-wallet-1", customer_id: "cliente-voz", amount: 45, confirmed: true }
    });

    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.wallet.balance, 45);
    assert.equal(result.json.movement.type, "credit");
  });
});

test("SamBah Voice Pay simula compra AutoServe por voz sem liberar audio direto", async () => {
  await withServer(async ({ baseUrl }) => {
    const device = await requestJson(baseUrl, "/api/sambah-pay/devices", {
      method: "POST",
      body: { name: "Geladeira Voz", type: "smart_fridge", location: "Salao", control_mode: "unit_based" }
    });
    const deviceId = device.json.device.id;
    await requestJson(baseUrl, `/api/sambah-pay/devices/${deviceId}/products`, {
      method: "POST",
      body: { product_id: "agua", name: "Agua", price: 6, quantity_per_release: 1, unit: "unidade", initial_quantity: 3 }
    });

    const blocked = await requestJson(baseUrl, "/api/sambah-pay/voice/autoserve-release", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { product_id: "agua", device_id: deviceId, quantity: 1 }
    });
    assert.equal(blocked.response.status, 400);
    assert.equal(blocked.json.error, "voice_confirmation_required");

    const confirmed = await requestJson(baseUrl, "/api/sambah-pay/voice/autoserve-release", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { product_id: "agua", device_id: deviceId, quantity: 1, confirmed: true }
    });
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.json.ok, true);
    assert.equal(confirmed.json.release_tokens.length, 1);
  });
});

test("SamBah Voice Pay registra handoff humano simulado", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const handoff = await requestJson(baseUrl, "/api/sambah-voice/handoff", {
      method: "POST",
      body: { session_id: "voice-human-1", reason: "cliente pediu humano" }
    });
    assert.equal(handoff.response.status, 200);
    assert.equal(handoff.json.ok, true);
    assert.equal(handoff.json.handoff.status, "queued");
    assert.equal((await module.repositories.voiceHandoffLogs.all()).length, 1);
  });
});


test("Painel SamBah Voice Pay carrega HTML e assets principais", async () => {
  await withServer(async ({ baseUrl }) => {
    const html = await fetch(`${baseUrl}/sambah-voice-pay`).then((response) => response.text());
    assert.match(html, /SamBah Pay/);
    assert.match(html, /Central SamBah Pay/);
    assert.match(html, /pay-command-center/);
    assert.match(html, /data-pay-mode="operacao"/);
    assert.match(html, /data-pay-mode="laboratorio"/);
    assert.match(html, /data-panel-mode="operacao"/);
    assert.match(html, /data-panel-mode="laboratorio"/);
    assert.match(html, /Dashboard SamBah Pay/);
    assert.match(html, /sambah-pay-logo\.png/);
    assert.match(html, /Simulador WhatsApp Voz/);
    assert.match(html, /Checkout por Voz/);

    const js = await fetch(`${baseUrl}/voice-pay.js`).then((response) => response.text());
    assert.match(js, /voiceWebhookForm/);
    assert.match(js, /api\/sambah-voice\/webhook\/whatsapp/);
    assert.match(js, /renderCommandCenter/);
    assert.match(js, /setPanelMode/);

    const css = await fetch(`${baseUrl}/voice-pay.css`).then((response) => response.text());
    assert.match(css, /voice-shell/);
    assert.match(css, /metrics-grid/);
    assert.match(css, /pay-hero-brand/);
    assert.match(css, /pay-action-grid/);
    assert.match(css, /mode-switch/);
  });
});

test("Painel Voice Pay expoe dashboard, listas e auditoria mockada", async () => {
  await withServer(async ({ baseUrl }) => {
    await requestJson(baseUrl, "/api/sambah-voice/webhook/whatsapp", {
      method: "POST",
      body: { from: "51999990001", transcript: "quero falar com humano", media_url: "mock://audio/humano.ogg" }
    });
    await requestJson(baseUrl, "/api/sambah-voice/handoff", {
      method: "POST",
      body: { session_id: "voice-panel-audit", reason: "teste painel" }
    });

    const dashboard = await requestJson(baseUrl, "/api/sambah-pay/voice/dashboard");
    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.json.ok, true);
    assert.ok(dashboard.json.totals.voice_messages >= 1);
    assert.ok(dashboard.json.totals.transcriptions >= 1);
    assert.ok(dashboard.json.totals.intents >= 1);
    assert.ok(dashboard.json.totals.responses >= 1);
    assert.ok(dashboard.json.totals.handoffs >= 1);

    const transcriptions = await requestJson(baseUrl, "/api/sambah-pay/voice/transcriptions");
    const intents = await requestJson(baseUrl, "/api/sambah-pay/voice/intents");
    const audit = await requestJson(baseUrl, "/api/sambah-pay/voice/audit", { headers: { "x-sambah-role": "ADMIN" } });
    assert.ok(transcriptions.json.items.length >= 1);
    assert.ok(intents.json.items.length >= 1);
    assert.ok(audit.json.items.length >= 1);
  });
});

test("Painel Voice Pay suporta transcricao, intent e resposta diretas", async () => {
  await withServer(async ({ baseUrl }) => {
    const transcription = await requestJson(baseUrl, "/api/sambah-voice/transcribe", {
      method: "POST",
      body: { session_id: "voice-direct", transcript: "quero comprar credito na wallet" }
    });
    assert.equal(transcription.response.status, 200);
    assert.equal(transcription.json.transcription.text, "quero comprar credito na wallet");

    const intent = await requestJson(baseUrl, "/api/sambah-voice/intent", {
      method: "POST",
      body: { session_id: "voice-direct", transcription_id: transcription.json.transcription.id, text: transcription.json.transcription.text }
    });
    assert.equal(intent.response.status, 200);
    assert.equal(intent.json.intent.intent, "comprar_credito_wallet");
    assert.equal(intent.json.intent.confirmation_required, true);

    const response = await requestJson(baseUrl, "/api/sambah-voice/respond", {
      method: "POST",
      body: { session_id: "voice-direct", intent_id: intent.json.intent.id }
    });
    assert.equal(response.response.status, 200);
    assert.ok(response.json.response.audio_url.startsWith("mock://tts/"));
  });
});


test("SamBah Weight Control registra leitura de peso simples", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/reading", {
      method: "POST",
      body: { device_id: "scale-1", product_id: "buffet", expected_weight: 500, actual_weight: 502, unit: "g", tolerance_percent: 5 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.reading.device_id, "scale-1");
    assert.equal(result.json.reading.status, "weight_ok");
  });
});

test("SamBah Weight Control painel abre", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/sambah-weight`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /SamBah Weight Control/);
    assert.match(html, /sambah-weight\.js/);
  });
});

test("SamBah Weight Control Central contem link para painel", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/sambah-central`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /href="\/sambah-weight"/);
    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.ok(status.json.cards.some((card) => card.key === "weight_control" && card.href === "/sambah-weight"));
  });
});

test("SamBah Weight Control valida weight_ok", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: "scale-ok", expected_weight: 400, actual_weight: 410, unit: "g", tolerance_percent: 5 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_ok");
  });
});

test("SamBah Weight Control valida weight_under", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: "scale-under", expected_weight: 400, actual_weight: 350, unit: "g", tolerance_percent: 5 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_under");
  });
});

test("SamBah Weight Control valida weight_over", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: "scale-over", expected_weight: 400, actual_weight: 430, unit: "g", tolerance_percent: 5 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_over");
  });
});

test("SamBah Weight Control valida weight_missing", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: "scale-missing", expected_weight: 400, product_detected: false, unit: "g", tolerance_percent: 5 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_missing");
  });
});

test("SamBah Weight Control valida weight_unstable", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: "scale-unstable", expected_weight: 400, actual_weight: 401, stable: false, unit: "g", tolerance_percent: 5 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_unstable");
    assert.equal(result.json.validation.action_required, true);
  });
});

test("SamBah Weight Control valida weight_fraud_suspected", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: "scale-fraud-status", expected_weight: 400, actual_weight: 650, unit: "g", tolerance_percent: 5, payment_confirmed: true, force_fraud: true }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_fraud_suspected");
    assert.equal(result.json.validation.severity, "high");
  });
});

test("SamBah Weight Control divergencia critica gera machine_alert e audit_log", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: "scale-fraud", expected_weight: 400, actual_weight: 650, unit: "g", tolerance_percent: 5, payment_confirmed: true, force_fraud: true }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_fraud_suspected");
    assert.equal(result.json.machine_alert.type, "weight_fraud_suspected");
    const auditLogs = await module.repositories.auditLogs.all();
    assert.ok(auditLogs.some((log) => log.type === "sambah_weight_critical_divergence"));
  });
});

test("SamBah Weight Control lista eventos e calibracao simulada", async () => {
  await withServer(async ({ baseUrl }) => {
    const calibration = await requestJson(baseUrl, "/api/sambah-pay/weight/calibrate", {
      method: "POST",
      body: { device_id: "scale-calibration", reference_weight: 1000, unit: "g" }
    });
    assert.equal(calibration.response.status, 200);
    assert.equal(calibration.json.calibration.status, "calibrated");
    const events = await requestJson(baseUrl, "/api/sambah-pay/weight/events");
    assert.equal(events.response.status, 200);
    assert.ok(events.json.items.some((event) => event.type === "weight_calibration_completed"));
  });
});

test("SamBah Weight Control integra release_token com delivery_event", async () => {
  await withServer(async ({ baseUrl }) => {
    const device = await requestJson(baseUrl, "/api/sambah-pay/devices", {
      method: "POST",
      body: { name: "Geladeira Peso", type: "smart_fridge", location: "Loja", control_mode: "weight_based" }
    });
    const deviceId = device.json.device.id;
    await requestJson(baseUrl, `/api/sambah-pay/devices/${deviceId}/products`, {
      method: "POST",
      body: { product_id: "agua-500", name: "Agua 500", price: 7, quantity_per_release: 1, unit: "unidade", initial_quantity: 10 }
    });
    const session = await requestJson(baseUrl, "/api/sambah-pay/autoserve/session", { method: "POST", body: { customer_id: "cliente-peso" } });
    await requestJson(baseUrl, "/api/sambah-pay/autoserve/cart", { method: "POST", body: { session_id: session.json.session.id, product_id: "agua-500", device_id: deviceId } });
    const checkout = await requestJson(baseUrl, "/api/sambah-pay/autoserve/checkout", { method: "POST", body: { session_id: session.json.session.id } });
    const release = checkout.json.release_tokens[0];
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: deviceId, product_id: "agua-500", release_token_id: release.id, expected_weight: 520, actual_weight: 520, unit: "g", tolerance_percent: 5 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.release_token_id, release.id);
    assert.equal(result.json.delivery_event.event_type, "weight_confirmed");
  });
});

test("SamBah Weight Control simula self-service por kg", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/simulate-self-service", { method: "POST", body: { actual_weight: 455 } });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.use_type, "self_service_by_weight");
    assert.equal(result.json.validation.status, "weight_ok");
  });
});

test("SamBah Weight Control simula bebida por peso", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/simulate-beverage", { method: "POST", body: { actual_weight: 380 } });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.use_type, "beverage_cup_weight");
  });
});

test("SamBah Weight Control simula geladeira inteligente por peso", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/simulate-smart-fridge", { method: "POST", body: { actual_weight: 520 } });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.use_type, "smart_fridge_shelf_weight");
  });
});

test("SamBah Weight Control prepara evento futuro para i9ACAO Security", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/simulate-pickup", {
      method: "POST",
      body: { expected_weight: 400, actual_weight: 650, payment_confirmed: true, force_fraud: true }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.i9acao_event.source, "sambah-pay");
    assert.equal(result.json.i9acao_event.module, "weight-control");
    assert.equal(result.json.i9acao_event.eventType, "weight_fraud_suspected");
    const events = await module.repositories.i9acaoSecurityEvents.all();
    assert.equal(events.length, 1);
    assert.equal(events[0].sent, false);
  });
});

test("SamBah Weight Control locker confirma picked_up com peso dentro da tolerancia", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    const item = items[0];
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: session.device_id, zone_id: item.zone_id, product_id: item.product_id, pickup_session_id: session.id, pickup_item_id: item.id, use_case: "locker_zone_weight", expected_weight: item.expected_weight, actual_weight: item.expected_weight, tolerance_percent: item.tolerance_percent }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_ok");
    assert.equal(result.json.locker.item.status, "picked_up");
  });
});

test("SamBah Weight Control locker marca not_picked_up quando peso nao muda", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    const item = items[0];
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: session.device_id, zone_id: item.zone_id, product_id: item.product_id, pickup_session_id: session.id, pickup_item_id: item.id, use_case: "locker_zone_weight", expected_weight: item.expected_weight, actual_weight: 0, tolerance_percent: item.tolerance_percent }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_missing");
    assert.equal(result.json.locker.item.status, "not_picked_up");
  });
});

test("SamBah Weight Control locker marca extra_quantity_suspected quando peso excede autorizado", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    const item = items[0];
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: session.device_id, zone_id: item.zone_id, product_id: item.product_id, pickup_session_id: session.id, pickup_item_id: item.id, use_case: "locker_zone_weight", expected_weight: item.expected_weight, actual_weight: item.expected_weight * 2, tolerance_percent: item.tolerance_percent }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.status, "weight_fraud_suspected");
    assert.equal(result.json.locker.item.status, "extra_quantity_suspected");
    assert.equal(result.json.locker.session.status, "fraud_suspected");
  });
});

test("SamBah Weight Control estoque por peso detecta divergencia", async () => {
  await withServer(async ({ baseUrl, module }) => {
    await requestJson(baseUrl, "/api/sambah-pay/locker/bootstrap", { method: "POST" });
    const zones = await requestJson(baseUrl, "/api/sambah-pay/locker/zones");
    const zone = zones.json.items.find((item) => item.product_id === "agua");
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: zone.device_id, zone_id: zone.zone_id, product_id: zone.product_id, use_case: "stock_inventory_weight", expected_weight: zone.current_weight, actual_weight: zone.expected_unit_weight * 2, unit_weight: zone.expected_unit_weight, logical_quantity: zone.stock_quantity }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.stock.mismatch, true);
    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_weight_inventory_mismatch"));
  });
});

test("SamBah Weight Control estoque zerado marca product_unavailable", async () => {
  await withServer(async ({ baseUrl }) => {
    await requestJson(baseUrl, "/api/sambah-pay/locker/bootstrap", { method: "POST" });
    const zones = await requestJson(baseUrl, "/api/sambah-pay/locker/zones");
    const zone = zones.json.items.find((item) => item.product_id === "agua");
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/validate", {
      method: "POST",
      body: { device_id: zone.device_id, zone_id: zone.zone_id, product_id: zone.product_id, use_case: "stock_inventory_weight", expected_weight: zone.current_weight, actual_weight: 0, unit_weight: zone.expected_unit_weight, logical_quantity: zone.stock_quantity }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.stock.zone.status, "empty");
    assert.equal(result.json.stock.zone.product_availability, "product_unavailable");
  });
});

test("SamBah Weight Control prepara eventos under_delivery e over_delivery", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const under = await requestJson(baseUrl, "/api/sambah-pay/weight/simulate-beverage", {
      method: "POST",
      body: { expected_weight: 400, actual_weight: 250 }
    });
    const over = await requestJson(baseUrl, "/api/sambah-pay/weight/simulate-beverage", {
      method: "POST",
      body: { expected_weight: 400, actual_weight: 650 }
    });
    assert.equal(under.response.status, 200);
    assert.equal(over.response.status, 200);
    const events = await module.repositories.i9acaoSecurityEvents.all();
    assert.ok(events.some((event) => event.eventType === "under_delivery"));
    assert.ok(events.some((event) => event.eventType === "over_delivery"));
  });
});

test("SamBah Weight Control simulacao locker por zona funciona", async () => {
  await withServer(async ({ baseUrl }) => {
    await requestJson(baseUrl, "/api/sambah-pay/locker/bootstrap", { method: "POST" });
    const result = await requestJson(baseUrl, "/api/sambah-pay/weight/simulate-locker-zone", {
      method: "POST",
      body: { zone_id: "Z01", expected_weight: 520, actual_weight: 520 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.validation.use_case, "locker_zone_weight");
    assert.equal(result.json.validation.status, "weight_ok");
  });
});


test("SamBah Voice Pay admin contem link para painel", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /href="\/sambah-voice-pay"/);
    assert.match(html, /SamBah Pay/);
    assert.match(html, /href="\/admin\/permissoes"/);
    assert.match(html, /Permiss&otilde;es SamBah/);
    assert.match(html, /href="\/admin\/usuarios"/);
    assert.match(html, /Usu&aacute;rios SamBah/);
    assert.match(html, /href="\/admin\/auditoria"/);
    assert.match(html, /Auditoria SamBah/);
  });
});

test("Auditoria administrativa exige sessao no endpoint", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/admin/auditoria");
    assert.equal(result.response.status, 401);
    assert.equal(result.json.error, "auth_required");
  }, { authMode: "session" });
});

test("Auditoria administrativa abre pagina com sessao", async () => {
  await withServer(async ({ baseUrl }) => {
    const login = await loginCookie(baseUrl, "admin", "admin123");
    const response = await fetch(`${baseUrl}/admin/auditoria`, { headers: { cookie: login.cookie } });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Auditoria SamBah/);
    assert.match(html, /admin-auditoria\.js/);
  }, { authMode: "session" });
});

test("Auditoria administrativa retorna lista publica com sessao", async () => {
  await withServer(async ({ baseUrl, audit }) => {
    await audit.record({
      type: "sambah_permission_denied",
      status: "warning",
      source: "sambah-pay",
      message: "Tentativa bloqueada por permissao da sessao",
      context: { username: "atendente", role: "ATENDENTE", source: "session", action: "voice_checkout", path: "/api/sambah-pay/voice/checkout", method: "POST", reason: "perfil sem permissao" }
    });
    const login = await loginCookie(baseUrl, "admin", "admin123");
    const result = await requestJson(baseUrl, "/api/admin/auditoria", { headers: { cookie: login.cookie } });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.ok(Array.isArray(result.json.items));
    const denied = result.json.items.find((item) => item.event === "sambah_permission_denied");
    assert.ok(denied);
    assert.equal(denied.username, "atendente");
    assert.equal(denied.role, "ATENDENTE");
    assert.equal(denied.source, "session");
    assert.equal(denied.action, "voice_checkout");
    assert.equal(denied.route, "/api/sambah-pay/voice/checkout");
    assert.equal(denied.method, "POST");
  }, { authMode: "session" });
});

test("Auditoria administrativa nao expoe dados sensiveis", async () => {
  await withServer(async ({ baseUrl, audit }) => {
    await audit.record({
      type: "password_hash_salt_cookie_token_secret_senha_segredo",
      status: "warning",
      source: "auth",
      message: "senha password token secret segredo",
      context: {
        username: "admin",
        role: "ADMIN",
        password: "admin123",
        passwordHash: "abc",
        salt: "def",
        cookie: "ghi",
        token: "jkl",
        secret: "mno",
        senha: "pqr",
        segredo: "stu",
        action: "password_token"
      }
    });
    const login = await loginCookie(baseUrl, "admin", "admin123");
    const result = await requestJson(baseUrl, "/api/admin/auditoria", { headers: { cookie: login.cookie } });
    assert.equal(result.response.status, 200);
    const raw = JSON.stringify(result.json).toLowerCase();
    for (const word of ["password", "senha", "hash", "salt", "cookie", "token", "secret", "segredo", "admin123"]) {
      assert.equal(raw.includes(word), false, `auditoria nao deve conter ${word}`);
    }
  }, { authMode: "session" });
});

test("Auditoria administrativa ordena eventos do mais recente para o mais antigo", async () => {
  await withServer(async ({ baseUrl, audit }) => {
    await audit.record({ type: "sambah_old_event", status: "info", source: "test", message: "antigo" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await audit.record({ type: "sambah_new_event", status: "info", source: "test", message: "novo" });
    const login = await loginCookie(baseUrl, "admin", "admin123");
    const result = await requestJson(baseUrl, "/api/admin/auditoria", { headers: { cookie: login.cookie } });
    assert.equal(result.response.status, 200);
    const newEvent = result.json.items.find((item) => item.event === "sambah_new_event");
    const oldEvent = result.json.items.find((item) => item.event === "sambah_old_event");
    assert.ok(newEvent);
    assert.ok(oldEvent);
    assert.ok(Date.parse(newEvent.timestamp) >= Date.parse(oldEvent.timestamp));
  }, { authMode: "session" });
});

test("Tela administrativa de auditoria abre HTML e assets", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/auditoria`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Auditoria SamBah/);
    assert.match(html, /admin-auditoria\.js/);
    assert.match(html, /auditEventsBody/);

    const js = await fetch(`${baseUrl}/admin-auditoria.js`).then((asset) => asset.text());
    assert.match(js, /api\/admin\/auditoria/);
    assert.match(js, /sambah_permission_denied/);
    assert.match(js, /Nenhum evento de auditoria encontrado/);

    const css = await fetch(`${baseUrl}/admin-auditoria.css`).then((asset) => asset.text());
    assert.match(css, /audit-table/);
    assert.match(css, /audit-row-denied/);
  });
});

test("Auth interna lista usuarios publicos sem credenciais", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/auth/users");
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.total, 3);
    assert.deepEqual(result.json.users.map((user) => user.username), ["atendente", "gerente", "admin"]);
    assert.equal(JSON.stringify(result.json).includes("passwordHash"), false);
    assert.equal(JSON.stringify(result.json).includes("salt"), false);
    assert.equal(JSON.stringify(result.json).includes("admin123"), false);
  });
});

test("Auth interna ADMIN gerencia ciclo de vida de usuario local", async () => {
  await withServer(async ({ baseUrl }) => {
    const admin = await loginCookie(baseUrl, "admin", "admin123");
    const created = await requestJson(baseUrl, "/api/auth/users", {
      method: "POST",
      headers: { cookie: admin.cookie },
      body: { username: "operador-teste", displayName: "Operador Teste", role: "OPERADOR", password: "operador123" }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.json.user.username, "operador-teste");
    assert.equal(created.json.user.active, true);
    assert.equal(JSON.stringify(created.json).includes("passwordHash"), false);

    const updated = await requestJson(baseUrl, "/api/auth/users/operador-teste", {
      method: "PATCH",
      headers: { cookie: admin.cookie },
      body: { displayName: "Caixa Teste", role: "CAIXA" }
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.json.user.displayName, "Caixa Teste");
    assert.equal(updated.json.user.role, "CAIXA");

    const password = await requestJson(baseUrl, "/api/auth/users/operador-teste/password", {
      method: "POST",
      headers: { cookie: admin.cookie },
      body: { password: "novaSenha123" }
    });
    assert.equal(password.response.status, 200);

    const login = await loginCookie(baseUrl, "operador-teste", "novaSenha123");
    assert.equal(login.response.status, 200);
    assert.equal(login.json.user.role, "CAIXA");

    const disabled = await requestJson(baseUrl, "/api/auth/users/operador-teste/status", {
      method: "POST",
      headers: { cookie: admin.cookie },
      body: { active: false }
    });
    assert.equal(disabled.response.status, 200);
    assert.equal(disabled.json.user.active, false);

    const deniedLogin = await requestJson(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: "operador-teste", password: "novaSenha123" }
    });
    assert.equal(deniedLogin.response.status, 401);
  }, { authMode: "session" });
});

test("Auth interna permite PIN local de 4 digitos para administrador", async () => {
  await withServer(async ({ baseUrl }) => {
    const admin = await loginCookie(baseUrl, "admin", "admin123");
    const created = await requestJson(baseUrl, "/api/auth/users", {
      method: "POST",
      headers: { cookie: admin.cookie },
      body: { username: "neno.gutterres", displayName: "Neno Gutterres", role: "ADMIN", password: "6318" }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.json.user.role, "ADMIN");

    for (const username of ["neno.gutterres", "neno,gutterres", "Neno Gutterres"]) {
      const login = await loginCookie(baseUrl, username, "6318");
      assert.equal(login.response.status, 200);
      assert.equal(login.json.user.displayName, "Neno Gutterres");
      assert.equal(login.json.user.role, "ADMIN");
    }
  }, { authMode: "session" });
});

test("Auth interna restringe gestao de usuarios ao ADMIN", async () => {
  await withServer(async ({ baseUrl }) => {
    const atendente = await loginCookie(baseUrl, "atendente", "atendente123");
    const result = await requestJson(baseUrl, "/api/auth/users", {
      method: "POST",
      headers: { cookie: atendente.cookie },
      body: { username: "sem-permissao", role: "OPERADOR", password: "operador123" }
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.json.error, "admin_required");
  }, { authMode: "session" });
});

test("Login SamBah permite mostrar e ocultar senha digitada", async () => {
  await withServer(async ({ baseUrl }) => {
    const html = await fetch(`${baseUrl}/login`).then((response) => response.text());
    const js = await fetch(`${baseUrl}/login.js`).then((response) => response.text());
    const css = await fetch(`${baseUrl}/login.css`).then((response) => response.text());
    assert.match(html, /id="passwordInput"/);
    assert.match(html, /id="togglePassword"/);
    assert.match(html, /aria-label="Mostrar senha"/);
    assert.match(js, /passwordInput\.type = showing \? "password" : "text"/);
    assert.match(js, /togglePassword\.textContent = showing \? "Mostrar" : "Ocultar"/);
    assert.match(css, /\.password-field/);
    assert.match(css, /\.password-toggle/);
  });
});

test("Tela administrativa de usuarios abre HTML e assets", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/usuarios`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Usu&aacute;rios SamBah/);
    assert.match(html, /Usu&aacute;rios internos/);
    assert.match(html, /admin-usuarios\.js/);

    const js = await fetch(`${baseUrl}/admin-usuarios.js`).then((asset) => asset.text());
    assert.match(js, /api\/auth\/users/);
    assert.match(js, /permissions\/matrix/);
    assert.match(js, /data-user-update/);
    assert.match(js, /data-user-password/);
    assert.match(js, /data-user-status/);

    const css = await fetch(`${baseUrl}/admin-usuarios.css`).then((asset) => asset.text());
    assert.match(css, /users-grid/);
    assert.match(css, /user-card/);
    assert.match(css, /user-form/);
  });
});

test("SamBah Voice Pay expoe matriz administrativa de permissoes", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/permissions/matrix");
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.mode, "internal");
    assert.deepEqual(result.json.roles, ["ADMIN", "GERENTE", "CAIXA", "OPERADOR", "ATENDENTE", "AUDITOR"]);
    assert.deepEqual(result.json.actions.map((action) => action.key), ["checkout", "wallet", "autoserve", "audit", "settings", "bootstrap", "lgpd", "critical_logs"]);
    assert.equal(result.json.matrix.ATENDENTE.checkout, "Bloqueado");
    assert.equal(result.json.matrix.ATENDENTE.wallet, "Bloqueado");
    assert.equal(result.json.matrix.ATENDENTE.autoserve, "Bloqueado");
    assert.notEqual(result.json.matrix.ATENDENTE.settings, "Liberado");
    assert.equal(result.json.matrix.ATENDENTE.lgpd, "Bloqueado");
    assert.equal(result.json.matrix.ADMIN.checkout, "Liberado");
    assert.equal(result.json.matrix.ADMIN.wallet, "Liberado");
    assert.equal(result.json.matrix.ADMIN.autoserve, "Liberado");
    assert.equal(result.json.matrix.ADMIN.audit, "Liberado");
    assert.equal(result.json.matrix.ADMIN.settings, "Liberado");
    assert.equal(result.json.matrix.ADMIN.lgpd, "Liberado");
  });
});

test("Tela administrativa de permissoes abre HTML e assets", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/admin/permissoes`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Permiss&otilde;es SamBah/);
    assert.match(html, /Matriz administrativa de permiss&otilde;es/);
    assert.match(html, /admin-permissoes\.js/);

    const js = await fetch(`${baseUrl}/admin-permissoes.js`).then((asset) => asset.text());
    assert.match(js, /permissions\/matrix/);
    assert.match(js, /state-pill/);

    const css = await fetch(`${baseUrl}/admin-permissoes.css`).then((asset) => asset.text());
    assert.match(css, /permissions-table/);
    assert.match(css, /state-allowed/);
  });
});

test("SamBah Voice Pay rota direta continua abrindo com seletor de perfil", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/sambah-voice-pay`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /voiceRoleSelect/);
    assert.match(html, /data-permission="voice_checkout"/);
  });
});

test("SamBah Voice Pay ADMIN executa acao critica", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/checkout", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { session_id: "admin-checkout", amount: 22, confirmed: true }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
  });
});

test("SamBah Voice Pay CAIXA consegue checkout por voz", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/checkout", {
      method: "POST",
      headers: { "x-sambah-role": "CAIXA" },
      body: { session_id: "caixa-checkout", amount: 18, confirmed: true }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
  });
});

test("SamBah Voice Pay OPERADOR nao consegue wallet topup", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/wallet-topup", {
      method: "POST",
      headers: { "x-sambah-role": "OPERADOR" },
      body: { customer_id: "cliente-operador", amount: 10, confirmed: true }
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.json.error, "permission_denied");
  });
});

test("SamBah Voice Pay ATENDENTE nao consegue autoserve release", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/autoserve-release", {
      method: "POST",
      headers: { "x-sambah-role": "ATENDENTE" },
      body: { product_id: "agua", device_id: "device-mock", quantity: 1, confirmed: true }
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.json.error, "permission_denied");
  });
});

test("SamBah Voice Pay AUDITOR ve auditoria mas nao executa acao operacional", async () => {
  await withServer(async ({ baseUrl }) => {
    const audit = await requestJson(baseUrl, "/api/sambah-pay/voice/audit", { headers: { "x-sambah-role": "AUDITOR" } });
    assert.equal(audit.response.status, 200);
    const checkout = await requestJson(baseUrl, "/api/sambah-pay/voice/checkout", {
      method: "POST",
      headers: { "x-sambah-role": "AUDITOR" },
      body: { session_id: "auditor-checkout", amount: 10, confirmed: true }
    });
    assert.equal(checkout.response.status, 403);
    assert.equal(checkout.json.error, "permission_denied");
  });
});

test("SamBah Voice Pay sem header assume ATENDENTE", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/checkout", {
      method: "POST",
      body: { session_id: "default-role", amount: 10, confirmed: true }
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.json.role, "ATENDENTE");
  });
});

test("SamBah Voice Pay negativa de permissao gera audit_log", async () => {
  await withServer(async ({ baseUrl, module }) => {
    await requestJson(baseUrl, "/api/sambah-pay/voice/wallet-topup", {
      method: "POST",
      headers: { "x-sambah-role": "OPERADOR" },
      body: { customer_id: "cliente-negado", amount: 10, confirmed: true }
    });
    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_permission_denied" && log.context?.role === "OPERADOR"));
  });
});

test("SamBah Voice Pay JS possui bloqueio visual de botoes por permissao", async () => {
  await withServer(async ({ baseUrl }) => {
    const js = await fetch(`${baseUrl}/voice-pay.js`).then((response) => response.text());
    assert.match(js, /data-permission/);
    assert.match(js, /node\.disabled = !allowed/);
    assert.match(js, /x-sambah-role/);
  });
});


test("SamBah Ecossistema abre rotas visuais principais", async () => {
  await withServer(async ({ baseUrl }) => {
    for (const route of ["/login", "/sambah-central", "/sambah-pay", "/sambah-autoserve", "/sambah-devices", "/sambah-voice-pay", "/sambah-locker", "/sambah-weight", "/sambah-events", "/sambah-observability", "/sambah-security", "/sambah-lgpd", "/sambah-database", "/sambah-messaging"]) {
      const response = await fetch(`${baseUrl}${route}`);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.notEqual(response.status, 404);
      assert.match(html, /SamBah/);
    }
  });
});

test("SamBah Ecossistema Central contem link visivel para Locker Frio", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/sambah-central`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /href="\/sambah-locker"/);
    assert.match(html, /Locker Frio/);

    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.ok(status.json.cards.some((card) => card.title === "Locker Frio" && card.href === "/sambah-locker"));
  });
});

test("SamBah Central contem links para Event Bus e Cockpit Operacional", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/sambah-central`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /href="\/sambah-events"/);
    assert.match(html, /href="\/sambah-observability"/);

    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.ok(status.json.cards.some((card) => card.key === "event_bus" && card.href === "/sambah-events"));
    assert.ok(status.json.cards.some((card) => card.key === "cockpit" && card.href === "/sambah-observability"));
  });
});

test("SamBah Central painel operacional contem missao, alertas e demo guiado", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/sambah-central`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Missao operacional/);
    assert.match(html, /Fluxo demo guiado/);
    assert.match(html, /Alertas criticos/);
    assert.match(html, /Auditoria recente/);
    assert.match(html, /data-permission="guided_demo"/);
    assert.match(html, /Caminhos operacionais/);
    assert.match(html, /href="http:\/\/127\.0\.0\.1:4173\/"/);
    assert.match(html, /href="\/sambah-crm"/);
    assert.match(html, /href="\/sambah-pay"/);
    assert.match(html, /href="\/perola"/);

    const js = await fetch(`${baseUrl}/sambah-central.js`).then((asset) => asset.text());
    assert.match(js, /secure-pickup\/create/);
    assert.match(js, /open-authorized-zones/);
    assert.match(js, /weight\/validate/);
    assert.match(js, /rolePermissions/);
    assert.match(js, /\/admin\/mesa\/status/);
    assert.match(js, /\/api\/crm\/resumo/);
    assert.match(js, /\/api\/perola\/operational-status/);
    assert.match(js, /function alertCard/);
    assert.match(js, /map\(alertCard\)/);
    assert.doesNotMatch(js, /criticalAlerts[\s\S]*row\("Alerta critico"/);
  });
});

test("SamBah Central status expõe cards operacionais consolidados", async () => {
  await withServer(async ({ baseUrl }) => {
    await requestJson(baseUrl, "/api/sambah-pay/locker/bootstrap", { method: "POST" });
    await requestJson(baseUrl, "/api/sambah-pay/weight/simulate-beverage", {
      method: "POST",
      body: { expected_weight: 400, actual_weight: 650, payment_confirmed: true, force_fraud: true }
    });
    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.equal(status.response.status, 200);
    assert.ok(status.json.cards.some((card) => card.key === "weight_control" && card.href === "/sambah-weight"));
    assert.ok(status.json.cards.some((card) => card.key === "locker" && card.href === "/sambah-locker"));
    assert.ok(Array.isArray(status.json.samples.alerts));
    assert.ok(Array.isArray(status.json.samples.audit));
    assert.ok(status.json.totals.open_alerts >= 1);
    assert.ok(status.json.totals.weight_alerts >= 1);
    assert.ok(status.json.totals.weight_fraud_suspected >= 1);
  });
});

test("SamBah Ecossistema bootstrap cria dados demo", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/demo/bootstrap", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.ok(result.json.status.totals.devices >= 2);
    assert.ok(result.json.status.totals.wallets >= 1);
    assert.ok(result.json.status.totals.payments >= 1);
  });
});

test("SamBah Ecossistema cria device demo por rota dedicada", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/devices/demo", {
      method: "POST",
      body: { kind: "voice_autoserve", product_id: "agua" }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.product.product_id, "agua");
    assert.ok(result.json.device.id);
  });
});

test("SamBah Ecossistema AutoServe por voz com device_id funciona", async () => {
  await withServer(async ({ baseUrl }) => {
    const demo = await requestJson(baseUrl, "/api/sambah-pay/devices/demo", {
      method: "POST",
      body: { kind: "voice_autoserve", product_id: "agua" }
    });
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/autoserve-release", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { product_id: "agua", device_id: demo.json.device.id, quantity: 1, confirmed: true }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.release_tokens.length, 1);
  });
});

test("SamBah Ecossistema AutoServe por voz sem device_id retorna mensagem amigavel", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/voice/autoserve-release", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { product_id: "agua", quantity: 1, confirmed: true }
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.json.error, "voice_autoserve_device_required");
    assert.equal(result.json.message, "Crie ou selecione um device antes da compra AutoServe.");
    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_voice_autoserve_missing_device"));
  });
});

test("SamBah Ecossistema permissao ADMIN acessa bootstrap e ATENDENTE nao", async () => {
  await withServer(async ({ baseUrl }) => {
    const denied = await requestJson(baseUrl, "/api/sambah-pay/demo/bootstrap", { method: "POST" });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.json.role, "ATENDENTE");
    const allowed = await requestJson(baseUrl, "/api/sambah-pay/demo/bootstrap", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" }
    });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.json.ok, true);
  });
});

test("SamBah Ecossistema negativa de permissao aparece na auditoria", async () => {
  await withServer(async ({ baseUrl, module }) => {
    await requestJson(baseUrl, "/api/sambah-pay/demo/bootstrap", { method: "POST" });
    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_permission_denied" && log.context?.action === "demo_bootstrap"));
    const audit = await requestJson(baseUrl, "/api/sambah-pay/voice/audit", { headers: { "x-sambah-role": "ADMIN" } });
    assert.equal(audit.response.status, 200);
    assert.ok(Array.isArray(audit.json.items));
  });
});

test("SamBah Ecossistema central mostra status dos modulos", async () => {
  await withServer(async ({ baseUrl }) => {
    await requestJson(baseUrl, "/api/sambah-pay/demo/bootstrap", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" }
    });
    await requestJson(baseUrl, "/api/sambah-pay/locker/bootstrap", { method: "POST" });
    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.equal(status.response.status, 200);
    assert.equal(status.json.ok, true);
    assert.ok(status.json.cards.some((card) => card.key === "voice_pay"));
    assert.ok(status.json.cards.some((card) => card.key === "security"));
    assert.ok(status.json.cards.some((card) => card.key === "locker" && card.href === "/sambah-locker"));
  });
});

test("SamBah Ecossistema contrato i9ACAO futuro retorna estrutura valida", async () => {
  await withServer(async ({ baseUrl }) => {
    const security = await requestJson(baseUrl, "/api/sambah-pay/security/events");
    assert.equal(security.response.status, 200);
    assert.equal(security.json.ok, true);
    assert.ok(security.json.event_types.includes("weight_fraud_suspected"));
    assert.ok(Array.isArray(security.json.items));
  });
});

async function createPaidLockerPayment(baseUrl, amount = 30) {
  const result = await requestJson(baseUrl, "/api/sambah-pay/payments", {
    method: "POST",
    body: { amount, method: "manual_simulated", status: "paid", customer_id: "cliente-locker" }
  });
  assert.equal(result.response.status, 200);
  return result.json.payment;
}

async function prepareLockerSession(baseUrl, overrides = {}) {
  await requestJson(baseUrl, "/api/sambah-pay/locker/bootstrap", { method: "POST" });
  const zonesResult = await requestJson(baseUrl, "/api/sambah-pay/locker/zones");
  const zones = zonesResult.json.items || zonesResult.json.zones;
  const agua = zones.find((zone) => zone.product_id === "agua");
  const refri = zones.find((zone) => zone.product_id === "refri");
  assert.ok(agua);
  assert.ok(refri);
  const payment = await createPaidLockerPayment(baseUrl);
  const create = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/create", {
    method: "POST",
    body: {
      payment_id: payment.id,
      order_id: "pedido-locker-demo",
      customer_id: "cliente-locker",
      phone: "+5500000000000",
      items: [
        { product_id: "agua", zone_id: agua.zone_id, quantity: 1, expected_weight: agua.expected_unit_weight },
        { product_id: "refri", zone_id: refri.zone_id, quantity: 1, expected_weight: refri.expected_unit_weight }
      ],
      ...overrides
    }
  });
  assert.equal(create.response.status, 200);
  assert.equal(create.json.ok, true);
  return { payment, session: create.json.session, items: create.json.items, pin: create.json.pin, zones, agua, refri };
}

test("SamBah Locker Frio abre painel visual e asset dedicado", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/sambah-locker`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /SamBah Locker Frio/);
    assert.match(html, /sambah-locker\.js/);

    const js = await fetch(`${baseUrl}/sambah-locker.js`).then((asset) => asset.text());
    assert.match(js, /secure-pickup\/create/);
    assert.match(js, /open-authorized-zones/);
  });
});

test("SamBah Locker Frio bootstrap cria aproximadamente quarenta portas simuladas", async () => {
  await withServer(async ({ baseUrl }) => {
    const result = await requestJson(baseUrl, "/api/sambah-pay/locker/bootstrap", { method: "POST" });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.ok(result.json.zones.length >= 40);
    assert.ok(result.json.zones.some((zone) => zone.zone_id === "Z01"));
    assert.ok(result.json.zones.every((zone) => zone.door_status));
  });
});

test("SamBah Secure Pickup cria um PIN para pedido pago com dois itens", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items, pin } = await prepareLockerSession(baseUrl);
    assert.equal(session.status, "valid");
    assert.equal(items.length, 2);
    assert.ok(pin);
    assert.ok(items.every((item) => item.pickup_session_id === session.id));
  });
});

test("SamBah Secure Pickup recusa sessao sem pagamento confirmado", async () => {
  await withServer(async ({ baseUrl }) => {
    await requestJson(baseUrl, "/api/sambah-pay/locker/bootstrap", { method: "POST" });
    const payment = await requestJson(baseUrl, "/api/sambah-pay/payments", {
      method: "POST",
      body: { amount: 10, status: "pending", customer_id: "cliente-locker" }
    });
    const result = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/create", {
      method: "POST",
      body: { payment_id: payment.json.payment.id, items: [{ product_id: "agua", zone_id: "Z01", quantity: 1 }] }
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.json.error, "payment_not_confirmed");
  });
});

test("SamBah Secure Pickup valida PIN correto antes de liberar fluxo", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, pin } = await prepareLockerSession(baseUrl);
    const result = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/validate-pin", {
      method: "POST",
      body: { session_id: session.id, pin }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.items.length, 2);
  });
});

test("SamBah Secure Pickup abre somente zonas autorizadas pelo pedido", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, pin, items } = await prepareLockerSession(baseUrl);
    const result = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/open-authorized-zones", {
      method: "POST",
      body: { session_id: session.id, pin }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.opened_zones.length, 2);
    assert.deepEqual(new Set(result.json.opened_zones.map((zone) => zone.zone_id)), new Set(items.map((item) => item.zone_id)));
  });
});

test("SamBah Secure Pickup nega tentativa de abrir zona nao autorizada", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const { session, items, zones } = await prepareLockerSession(baseUrl);
    const wrongZone = zones.find((zone) => !items.some((item) => item.zone_id === zone.zone_id));
    const result = await requestJson(baseUrl, `/api/sambah-pay/locker/zones/${wrongZone.zone_id}/open`, {
      method: "POST",
      body: { session_id: session.id }
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.json.error, "zone_not_authorized");
    const events = await module.repositories.securePickupEvents.all();
    assert.ok(events.some((event) => event.type === "wrong_zone_attempt" && event.pickup_session_id === session.id));
  });
});

test("SamBah Secure Pickup conclui retirada completa de todos os itens", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, pin, items } = await prepareLockerSession(baseUrl);
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/open-authorized-zones", { method: "POST", body: { session_id: session.id, pin } });
    for (const item of items) {
      const confirmed = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
        method: "POST",
        body: { pickup_session_id: session.id, item_id: item.id, actual_weight: item.expected_weight }
      });
      assert.equal(confirmed.response.status, 200);
      assert.equal(confirmed.json.item.status, "picked_up");
    }
    const complete = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/complete", { method: "POST", body: { session_id: session.id } });
    assert.equal(complete.response.status, 200);
    assert.equal(complete.json.session.status, "completed");
  });
});

test("SamBah Secure Pickup identifica retirada parcial", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[0].id, actual_weight: items[0].expected_weight }
    });
    const complete = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/complete", { method: "POST", body: { session_id: session.id } });
    assert.equal(complete.response.status, 200);
    assert.equal(complete.json.session.status, "partial_pickup");
    assert.ok(complete.json.items.some((item) => item.status === "pending"));
  });
});

test("SamBah Secure Pickup registra item nao retirado quando peso removido e zero", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    const result = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[0].id, actual_weight: 0 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.item.status, "not_picked_up");
    const complete = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/complete", { method: "POST", body: { session_id: session.id } });
    assert.equal(complete.json.session.status, "partial_pickup");
  });
});

test("SamBah Secure Pickup marca suspeita quando retirada passa do peso esperado", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    const result = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[0].id, actual_weight: items[0].expected_weight * 2 }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.item.status, "extra_quantity_suspected");
    assert.equal(result.json.session.status, "fraud_suspected");
  });
});

test("SamBah Secure Pickup gera machine_alert em divergencia critica", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[0].id, actual_weight: items[0].expected_weight * 2 }
    });
    const alerts = await module.repositories.machineAlerts.all();
    assert.ok(alerts.some((alert) => alert.type === "extra_quantity_suspected" && alert.device_id === session.device_id));
  });
});

test("SamBah Secure Pickup audita divergencia critica", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[0].id, actual_weight: items[0].expected_weight * 2 }
    });
    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_secure_pickup_critical_divergence" && log.context?.session_id === session.id));
  });
});

test("SamBah Secure Pickup bloqueia PIN apos tentativas invalidas", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session } = await prepareLockerSession(baseUrl, { max_attempts: 2 });
    const first = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/validate-pin", {
      method: "POST",
      body: { session_id: session.id, pin: "000000" }
    });
    assert.equal(first.response.status, 400);
    assert.equal(first.json.error, "invalid_pin");

    const second = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/validate-pin", {
      method: "POST",
      body: { session_id: session.id, pin: "111111" }
    });
    assert.equal(second.response.status, 400);
    assert.equal(second.json.error, "pin_blocked");
    assert.equal(second.json.session.status, "blocked");
  });
});

test("SamBah Secure Pickup expira PIN e registra tentativa", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const { session, pin } = await prepareLockerSession(baseUrl, { ttl_ms: -1 });
    const result = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/validate-pin", {
      method: "POST",
      body: { session_id: session.id, pin }
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.json.error, "pin_expired");
    const attempts = await module.repositories.securePickupAttempts.all();
    assert.ok(attempts.some((attempt) => attempt.pickup_session_id === session.id && attempt.reason === "expired"));
  });
});

test("SamBah Secure Pickup cria novo PIN para itens pendentes", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[0].id, actual_weight: items[0].expected_weight }
    });
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/complete", { method: "POST", body: { session_id: session.id } });
    const pending = await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/create-pending", {
      method: "POST",
      body: { session_id: session.id }
    });
    assert.equal(pending.response.status, 200);
    assert.equal(pending.json.ok, true);
    assert.equal(pending.json.items.length, 1);
    assert.notEqual(pending.json.session.id, session.id);
  });
});

test("SamBah Secure Pickup prepara evento futuro i9ACAO em suspeita de fraude", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const { session, items } = await prepareLockerSession(baseUrl);
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[0].id, actual_weight: items[0].expected_weight * 2 }
    });
    const events = await module.repositories.i9acaoSecurityEvents.all();
    assert.ok(events.some((event) => event.module === "secure-pickup-locker" && event.eventType === "security_violation"));
  });
});

test("SamBah Event Bus publica evento e registra outbox, trace e auditoria", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const published = await requestJson(baseUrl, "/api/sambah-events/publish", {
      method: "POST",
      body: { type: "wallet.credited", aggregateId: "wallet-test", payload: { amount: 10 }, correlationId: "corr-wallet-test" }
    });
    assert.equal(published.response.status, 200);
    assert.equal(published.json.ok, true);
    assert.equal(published.json.event.type, "wallet.credited");

    const outbox = await requestJson(baseUrl, "/api/sambah-events/outbox");
    assert.ok(outbox.json.items.some((item) => item.id === published.json.event.id && item.status === "pending"));

    const traces = await requestJson(baseUrl, "/api/sambah-observability/traces");
    assert.ok(traces.json.items.some((item) => item.event_id === published.json.event.id && item.stage === "published"));

    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_event_published" && log.context?.event_type === "wallet.credited"));
  });
});

test("SamBah Event Bus processa outbox e mantem consumidores idempotentes", async () => {
  await withServer(async ({ baseUrl, module }) => {
    await requestJson(baseUrl, "/api/sambah-events/publish", {
      method: "POST",
      body: { id: "evt-idempotent-test", type: "autoserve.checkout.completed", correlationId: "corr-idempotent" }
    });
    const first = await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 10 } });
    assert.equal(first.response.status, 200);
    assert.equal(first.json.processed, 1);

    const second = await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 10 } });
    assert.equal(second.response.status, 200);
    assert.equal(second.json.processed, 0);

    const state = await module.repositories.eventConsumerState.all();
    const consumerKeys = state.filter((item) => item.event_id === "evt-idempotent-test").map((item) => item.id);
    assert.equal(new Set(consumerKeys).size, consumerKeys.length);
  });
});

test("SamBah Event Bus simula pagamento confirmado e gera sincronizacao ERP futura", async () => {
  await withServer(async ({ baseUrl }) => {
    const payment = await requestJson(baseUrl, "/api/sambah-events/simulate-payment-confirmed", {
      method: "POST",
      body: { payment_id: "payment-event-test", amount: 99 }
    });
    assert.equal(payment.response.status, 200);
    assert.equal(payment.json.event.type, "payment.confirmed");

    await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 20 } });
    const events = await requestJson(baseUrl, "/api/sambah-events");
    assert.ok(events.json.items.some((item) => item.type === "erp.sync.requested" && item.correlationId === payment.json.event.correlationId));

    await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 20 } });
    const completed = await requestJson(baseUrl, "/api/sambah-events");
    assert.ok(completed.json.items.some((item) => item.type === "erp.sync.completed" && item.correlationId === payment.json.event.correlationId));
    const requested = completed.json.items.find((item) => item.type === "erp.sync.requested" && item.correlationId === payment.json.event.correlationId);
    const erpCompleted = completed.json.items.find((item) => item.type === "erp.sync.completed" && item.correlationId === payment.json.event.correlationId);
    assert.equal(requested.causationId, payment.json.event.id);
    assert.equal(erpCompleted.causationId, requested.id);
  });
});

test("SamBah Event Bus recebe eventos financeiros de wallet, pagamento failed e AutoServe checkout", async () => {
  await withServer(async ({ baseUrl }) => {
    await requestJson(baseUrl, "/api/sambah-pay/payments", {
      method: "POST",
      body: { id: "payment-failed-event-test", amount: 12, method: "manual_simulated", status: "failed" }
    });
    await requestJson(baseUrl, "/api/sambah-pay/wallets/cliente-eventos/add-credit", {
      method: "POST",
      body: { amount: 30, reason: "event_bus_test" }
    });
    await requestJson(baseUrl, "/api/sambah-pay/wallets/cliente-eventos/debit", {
      method: "POST",
      body: { amount: 5, reason: "event_bus_test" }
    });

    const device = await requestJson(baseUrl, "/api/sambah-pay/devices", {
      method: "POST",
      body: { name: "AutoServe Eventos", type: "smart_fridge", location: "Teste", control_mode: "unit_based" }
    });
    await requestJson(baseUrl, `/api/sambah-pay/devices/${device.json.device.id}/products`, {
      method: "POST",
      body: { product_id: "agua", name: "Agua", price: 5, quantity_per_release: 1, unit: "unidade", initial_quantity: 3 }
    });
    const session = await requestJson(baseUrl, "/api/sambah-pay/autoserve/session", {
      method: "POST",
      body: { customer_id: "cliente-eventos" }
    });
    await requestJson(baseUrl, "/api/sambah-pay/autoserve/cart", {
      method: "POST",
      body: { session_id: session.json.session.id, product_id: "agua", device_id: device.json.device.id, quantity: 1 }
    });
    await requestJson(baseUrl, "/api/sambah-pay/autoserve/checkout", {
      method: "POST",
      body: { session_id: session.json.session.id }
    });

    const events = await requestJson(baseUrl, "/api/sambah-events");
    for (const type of ["payment.failed", "wallet.credited", "wallet.debited", "autoserve.checkout.completed"]) {
      assert.ok(events.json.items.some((item) => item.type === type), `${type} deveria estar publicado`);
    }
  });
});

test("SamBah Event Bus gera erp.sync.failed, retry e dead letter apos falhas simuladas", async () => {
  await withServer(async ({ baseUrl }) => {
    const simulated = await requestJson(baseUrl, "/api/sambah-events/simulate-erp-failure", {
      method: "POST",
      body: { payment_id: "payment-erp-failure-test" }
    });
    const correlationId = simulated.json.event.correlationId;
    await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 20 } });

    let events = await requestJson(baseUrl, "/api/sambah-events");
    let erpRequested = events.json.items.find((item) => item.type === "erp.sync.requested" && item.correlationId === correlationId);
    assert.ok(erpRequested);

    await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 20 } });
    events = await requestJson(baseUrl, "/api/sambah-events");
    assert.ok(events.json.items.some((item) => item.type === "erp.sync.failed" && item.correlationId === correlationId));

    const retry = await requestJson(baseUrl, `/api/sambah-events/retry/${erpRequested.id}`, { method: "POST" });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.json.event.status, "pending");

    await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 20 } });
    await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 20 } });
    await requestJson(baseUrl, "/api/sambah-events/process", { method: "POST", body: { limit: 20 } });

    const deadLetter = await requestJson(baseUrl, "/api/sambah-events/dead-letter");
    assert.ok(deadLetter.json.items.some((item) => item.id === erpRequested.id && item.type === "erp.sync.requested"));

    const alerts = await requestJson(baseUrl, "/api/sambah-observability/alerts");
    assert.ok(alerts.json.items.some((item) => item.type === "erp.failure.threshold" && item.correlationId === correlationId));
  });
});

test("SamBah Observability expoe metricas, health, correlacao e resolve alerta", async () => {
  await withServer(async ({ baseUrl }) => {
    const alert = await requestJson(baseUrl, "/api/sambah-observability/simulate-critical-alert", {
      method: "POST",
      body: { type: "critical.test", severity: "high", message: "Teste critico" }
    });
    assert.equal(alert.response.status, 200);
    assert.equal(alert.json.alert.status, "open");

    const health = await requestJson(baseUrl, "/api/sambah-observability/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.json.mode, "simulated");

    const metrics = await requestJson(baseUrl, "/api/sambah-observability/metrics");
    assert.equal(metrics.response.status, 200);
    assert.ok(Object.hasOwn(metrics.json, "events_by_type"));
    assert.ok(Object.hasOwn(metrics.json, "consumers_status"));

    const resolved = await requestJson(baseUrl, `/api/sambah-observability/alerts/${alert.json.alert.id}/resolve`, {
      method: "POST",
      body: { resolved_by: "test" }
    });
    assert.equal(resolved.response.status, 200);
    assert.equal(resolved.json.alert.status, "resolved");
  });
});

test("SamBah Event Bus recebe eventos de Locker, Device heartbeat e machine_alert", async () => {
  await withServer(async ({ baseUrl }) => {
    const device = await requestJson(baseUrl, "/api/sambah-pay/devices", {
      method: "POST",
      body: { name: "Device Eventos", type: "smart_fridge", location: "Teste", control_mode: "unit_based" }
    });
    await requestJson(baseUrl, `/api/sambah-pay/devices/${device.json.device.id}/heartbeat`, {
      method: "POST",
      body: { status: "online" }
    });
    await requestJson(baseUrl, "/api/sambah-pay/scale/reading", {
      method: "POST",
      body: { device_id: device.json.device.id, weight: 10, expected_weight: 5 }
    });

    const { session, items } = await prepareLockerSession(baseUrl);
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[0].id, actual_weight: items[0].expected_weight }
    });
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: session.id, item_id: items[1].id, actual_weight: items[1].expected_weight }
    });
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/complete", {
      method: "POST",
      body: { session_id: session.id }
    });
    const fraud = await prepareLockerSession(baseUrl);
    await requestJson(baseUrl, "/api/sambah-pay/secure-pickup/confirm-item", {
      method: "POST",
      body: { pickup_session_id: fraud.session.id, item_id: fraud.items[0].id, actual_weight: fraud.items[0].expected_weight * 2 }
    });

    const events = await requestJson(baseUrl, "/api/sambah-events");
    assert.ok(events.json.items.some((item) => item.type === "device.heartbeat.received"));
    assert.ok(events.json.items.some((item) => item.type === "machine_alert.created"));
    assert.ok(events.json.items.some((item) => item.type === "locker.pickup.created"));
    assert.ok(events.json.items.some((item) => item.type === "locker.pickup.completed"));
    assert.ok(events.json.items.some((item) => item.type === "locker.pickup.fraud_suspected"));
  });
});

test("SamBah Event Bus e Cockpit abrem assets visuais", async () => {
  await withServer(async ({ baseUrl }) => {
    const eventsPage = await fetch(`${baseUrl}/sambah-events`);
    const eventsHtml = await eventsPage.text();
    assert.equal(eventsPage.status, 200);
    assert.match(eventsHtml, /SamBah Event Bus/);
    assert.match(eventsHtml, /sambah-events\.js/);

    const cockpitPage = await fetch(`${baseUrl}/sambah-observability`);
    const cockpitHtml = await cockpitPage.text();
    assert.equal(cockpitPage.status, 200);
    assert.match(cockpitHtml, /Cockpit Operacional/);
    assert.match(cockpitHtml, /sambah-observability\.js/);
  });
});

test("SamBah Security abre painel visual e Central contem link i9ACAO", async () => {
  await withServer(async ({ baseUrl }) => {
    const page = await fetch(`${baseUrl}/sambah-security`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Security \/ i9ACAO/);
    assert.match(html, /sambah-security\.js/);

    const central = await fetch(`${baseUrl}/sambah-central`).then((response) => response.text());
    assert.match(central, /href="\/sambah-security"/);
    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.ok(status.json.cards.some((card) => card.key === "security_bridge" && card.href === "/sambah-security"));
  });
});

test("SamBah Security cria incidente simulado com correlationId, audit_log e evento no Event Bus", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const result = await requestJson(baseUrl, "/api/sambah-security/simulate/door-open-without-payment", {
      method: "POST",
      body: { deviceId: "locker-01", zoneId: "door-08", customerId: "cliente-seguro" }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.incident.severity, "critical");
    assert.ok(result.json.incident.correlationId);
    assert.ok(result.json.incident.causationId);

    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_security_incident_created" && log.context?.incident_id === result.json.incident.id));

    const events = await module.repositories.events.all();
    assert.ok(events.some((event) => event.type === "security.incident.created" && event.aggregateId === result.json.incident.id));
  });
});

test("SamBah Security transforma eventos criticos do Event Bus em incidentes", async () => {
  await withServer(async ({ baseUrl }) => {
    const criticalEvents = [
      { type: "locker.pickup.fraud_suspected", payload: { device_id: "locker-1", zone_id: "door-1", customer_id: "cliente-a" } },
      { type: "locker.pickup.partial", payload: { device_id: "locker-1", zone_id: "door-2", customer_id: "cliente-b" } },
      { type: "weight.fraud_suspected", payload: { device_id: "scale-1", zone_id: "door-3" } },
      { type: "weight.inventory_mismatch", payload: { device_id: "scale-1", zone_id: "door-4" } },
      { type: "door_open_without_payment", payload: { device_id: "locker-2", zone_id: "door-5" } }
    ];
    for (const event of criticalEvents) {
      const published = await requestJson(baseUrl, "/api/sambah-events/publish", {
        method: "POST",
        body: { ...event, correlationId: `corr-${event.type}` }
      });
      assert.equal(published.response.status, 200);
    }
    const incidents = await requestJson(baseUrl, "/api/sambah-security/incidents");
    for (const event of criticalEvents) {
      assert.ok(incidents.json.items.some((incident) => incident.eventType === event.type), `${event.type} deveria gerar incidente`);
    }
  });
});

test("SamBah Security cria incidente para zona nao autorizada real do Locker", async () => {
  await withServer(async ({ baseUrl }) => {
    const { session, items, zones } = await prepareLockerSession(baseUrl);
    const wrongZone = zones.find((zone) => !items.some((item) => item.zone_id === zone.zone_id));
    const result = await requestJson(baseUrl, `/api/sambah-pay/locker/zones/${wrongZone.zone_id}/open`, {
      method: "POST",
      body: { session_id: session.id }
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.json.error, "zone_not_authorized");
    const incidents = await requestJson(baseUrl, "/api/sambah-security/incidents");
    const incident = incidents.json.items.find((item) => item.eventType === "zone_not_authorized" && item.pickupSessionId === session.id);
    assert.ok(incident);
    assert.equal(incident.severity, "high");
  });
});

test("SamBah Security cria incidente para device offline critico e machine_alert alta", async () => {
  await withServer(async ({ baseUrl }) => {
    const device = await requestJson(baseUrl, "/api/sambah-pay/devices", {
      method: "POST",
      body: { name: "Locker Critico", type: "cold_locker", location: "Teste", control_mode: "unit_based" }
    });
    await requestJson(baseUrl, `/api/sambah-pay/devices/${device.json.device.id}/heartbeat`, {
      method: "POST",
      body: { status: "offline" }
    });
    await requestJson(baseUrl, "/api/sambah-events/publish", {
      method: "POST",
      body: { type: "machine_alert.created", payload: { severity: "high", device_id: device.json.device.id, type: "delivery_failed" } }
    });
    const incidents = await requestJson(baseUrl, "/api/sambah-security/incidents");
    assert.ok(incidents.json.items.some((incident) => incident.eventType === "device.offline" && incident.deviceId === device.json.device.id));
    assert.ok(incidents.json.items.some((incident) => incident.eventType === "machine_alert.created" && incident.deviceId === device.json.device.id));
  });
});

test("SamBah Security executa acknowledge, resolve, dismiss, escalate e acao mockada", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const created = await requestJson(baseUrl, "/api/sambah-security/simulate/locker-fraud", { method: "POST", body: { deviceId: "locker-action" } });
    const id = created.json.incident.id;
    for (const action of ["acknowledge", "resolve", "dismiss", "escalate", "block_device_mock"]) {
      const result = await requestJson(baseUrl, `/api/sambah-security/incidents/${id}/${action}`, {
        method: "POST",
        body: { actor: "tester" }
      });
      assert.equal(result.response.status, 200);
      assert.equal(result.json.ok, true);
    }
    const actions = await module.repositories.securityActions.all();
    assert.ok(actions.some((action) => action.incidentId === id && action.action === "block_device_mock"));
    const events = await module.repositories.events.all();
    assert.ok(events.some((event) => event.type === "security.action.mocked" && event.aggregateId === id));
    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_security_incident_block_device_mock" && log.context?.incident_id === id));
  });
});

test("SamBah Security expoe metricas no Cockpit e contrato futuro i9ACAO", async () => {
  await withServer(async ({ baseUrl }) => {
    const created = await requestJson(baseUrl, "/api/sambah-security/simulate/door-open-without-payment", {
      method: "POST",
      body: { deviceId: "locker-contract", zoneId: "door-99" }
    });
    const metrics = await requestJson(baseUrl, "/api/sambah-observability/metrics");
    assert.ok(metrics.json.security_incidents_open >= 1);
    assert.ok(metrics.json.security_incidents_critical >= 1);
    assert.ok(metrics.json.security_incidents_by_module.locker >= 1);

    const incident = await requestJson(baseUrl, `/api/sambah-security/incidents/${created.json.incident.id}`);
    assert.equal(incident.json.future_contract.target, "i9acao-security");
    assert.equal(incident.json.future_contract.eventType, "security.incident.created");
    assert.equal(incident.json.future_contract.deviceId, "locker-contract");
  });
});

test("SamBah LGPD abre painel visual e Central contem link", async () => {
  await withServer(async ({ baseUrl }) => {
    const page = await fetch(`${baseUrl}/sambah-lgpd`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /LGPD e Logs Criticos/);
    assert.match(html, /sambah-lgpd\.js/);

    const central = await fetch(`${baseUrl}/sambah-central`).then((response) => response.text());
    assert.match(central, /href="\/sambah-lgpd"/);
    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.ok(status.json.cards.some((card) => card.key === "lgpd_logs" && card.href === "/sambah-lgpd"));
  });
});

test("SamBah LGPD dashboard agrega logs criticos e exporta auditoria mascarada", async () => {
  await withServer(async ({ baseUrl, module }) => {
    await module.services.audit.record({
      type: "sambah_payment_sensitive_test",
      status: "error",
      message: "Falha para cliente teste@example.com token=abc123",
      context: { phone: "11999998888", email: "cliente@example.com", password: "segredo" }
    });
    const dashboard = await requestJson(baseUrl, "/api/sambah-lgpd/dashboard", { headers: { "x-sambah-role": "ADMIN" } });
    assert.equal(dashboard.response.status, 200);
    assert.ok(dashboard.json.totals.critical_logs >= 1);
    assert.ok(dashboard.json.totals.policies >= 1);

    const exported = await requestJson(baseUrl, "/api/sambah-lgpd/audit/export?limit=20", { headers: { "x-sambah-role": "AUDITOR" } });
    assert.equal(exported.response.status, 200);
    const raw = JSON.stringify(exported.json);
    assert.equal(raw.includes("abc123"), false);
    assert.equal(raw.includes("11999998888"), false);
    assert.match(raw, /masked|\*\*\*/);
  });
});

test("SamBah LGPD cria e atualiza solicitacao de privacidade com permissao", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const blocked = await requestJson(baseUrl, "/api/sambah-lgpd/privacy-requests", {
      method: "POST",
      headers: { "x-sambah-role": "ATENDENTE" },
      body: { request_type: "access", requester: "cliente@example.com" }
    });
    assert.equal(blocked.response.status, 403);
    assert.equal(blocked.json.error, "permission_denied");

    const created = await requestJson(baseUrl, "/api/sambah-lgpd/privacy-requests", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { request_type: "access", requester: "cliente@example.com", customer_id: "cliente-lgpd" }
    });
    assert.equal(created.response.status, 200);
    assert.equal(created.json.request.status, "open");
    assert.equal(JSON.stringify(created.json).includes("cliente@example.com"), false);

    const updated = await requestJson(baseUrl, `/api/sambah-lgpd/privacy-requests/${created.json.request.id}`, {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { status: "fulfilled", actor: "admin" }
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.json.request.status, "fulfilled");

    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "sambah_lgpd_privacy_request_created"));
    assert.ok(logs.some((log) => log.type === "sambah_lgpd_privacy_request_updated"));
  });
});

test("SamBah LGPD cria politica de retencao customizada", async () => {
  await withServer(async ({ baseUrl }) => {
    const created = await requestJson(baseUrl, "/api/sambah-lgpd/retention-policies", {
      method: "POST",
      headers: { "x-sambah-role": "ADMIN" },
      body: { key: "custom_test", label: "Politica Teste", retention_days: 45, classification: "operational" }
    });
    assert.equal(created.response.status, 200);
    assert.equal(created.json.policy.retention_days, 45);

    const policies = await requestJson(baseUrl, "/api/sambah-lgpd/retention-policies", { headers: { "x-sambah-role": "ADMIN" } });
    assert.ok(policies.json.items.some((item) => item.key === "custom_test"));
  });
});

test("SamBah Database abre painel visual e Central contem link", async () => {
  await withServer(async ({ baseUrl }) => {
    const page = await fetch(`${baseUrl}/sambah-database`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Banco \/ PostgreSQL/);
    assert.match(html, /sambah-database\.js/);

    const central = await fetch(`${baseUrl}/sambah-central`).then((response) => response.text());
    assert.match(central, /href="\/sambah-database"/);
    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.ok(status.json.cards.some((card) => card.key === "database" && card.href === "/sambah-database"));
  });
});

test("SamBah Database health e config preservam JSON padrao e mascaram DATABASE_URL", async () => {
  await withServer(async ({ baseUrl }) => {
    const health = await requestJson(baseUrl, "/api/sambah-database/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.json.mode, "json");
    assert.equal(health.json.json.status, "active");

    const config = await requestJson(baseUrl, "/api/sambah-database/config");
    assert.equal(config.response.status, 200);
    assert.equal(config.json.mode, "json");
    assert.equal(JSON.stringify(config.json).includes("password"), false);
  });

  const factory = createRepositoryFactory({
    env: { DATABASE_MODE: "postgres", DATABASE_URL: "postgres://user:password@localhost:5432/sambah" }
  });
  assert.equal(factory.info().databaseUrl, "postgres://user:[masked]@localhost:5432/sambah");
});

test("SamBah Database repositoryFactory usa JSON por padrao e Postgres adapter e opcional", async () => {
  const jsonFactory = createRepositoryFactory({ env: {} });
  assert.equal(jsonFactory.config.mode, "json");
  assert.equal(jsonFactory.adapter.mode, "json");
  assert.equal(typeof jsonFactory.repository("payments").all, "function");

  const postgres = new PostgresRepositoryAdapter();
  const health = await postgres.health();
  assert.equal(health.ok, false);
  assert.equal(health.status, "not_configured");
});

test("SamBah Database migrations dry-run lista SQL, tabelas e indices essenciais", async () => {
  await withServer(async ({ baseUrl }) => {
    const migrations = await requestJson(baseUrl, "/api/sambah-database/migrations");
    assert.equal(migrations.response.status, 200);
    assert.equal(migrations.json.total, 7);
    assert.ok(migrations.json.items.some((item) => item.name === "002_create_events.sql" && item.tables.includes("events")));
    const allIndexes = migrations.json.items.flatMap((item) => item.indexes);
    for (const indexName of ["idx_events_correlation_id", "idx_events_causation_id", "idx_security_incidents_severity", "idx_critical_logs_created_at"]) {
      assert.ok(allIndexes.includes(indexName), `${indexName} deveria existir`);
    }

    const dryRun = await requestJson(baseUrl, "/api/sambah-database/migrations/dry-run", { method: "POST" });
    assert.equal(dryRun.response.status, 200);
    assert.equal(dryRun.json.executed, false);
    assert.equal(dryRun.json.migrations.length, 7);
  });
});

test("SamBah Database seed demo e repositorios planejados respondem sem banco real", async () => {
  await withServer(async ({ baseUrl }) => {
    const seed = await requestJson(baseUrl, "/api/sambah-database/seed/demo", { method: "POST" });
    assert.equal(seed.response.status, 200);
    assert.equal(seed.json.ok, true);
    assert.equal(seed.json.executed, false);

    const repositories = await requestJson(baseUrl, "/api/sambah-database/repositories");
    assert.equal(repositories.response.status, 200);
    assert.ok(repositories.json.plannedTables.includes("audit_logs"));
    assert.ok(repositories.json.plannedTables.includes("metrics_snapshots"));
  });
});

test("SamBah Messaging abre painel visual e Central contem link", async () => {
  await withServer(async ({ baseUrl }) => {
    const page = await fetch(`${baseUrl}/sambah-messaging`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /SamBah Mensageria/);
    assert.match(html, /sambah-messaging\.js/);

    const central = await fetch(`${baseUrl}/sambah-central`).then((response) => response.text());
    assert.match(central, /href="\/sambah-messaging"/);
    const status = await requestJson(baseUrl, "/api/sambah-pay/ecosystem/status");
    assert.ok(status.json.cards.some((card) => card.key === "messaging" && card.href === "/sambah-messaging"));
  });
});

test("SamBah Messaging config e health preservam internal padrao e mascaram URLs", async () => {
  await withServer(async ({ baseUrl }) => {
    const config = await requestJson(baseUrl, "/api/sambah-messaging/config");
    assert.equal(config.response.status, 200);
    assert.equal(config.json.messageBroker, "internal");
    assert.equal(JSON.stringify(config.json).includes("password"), false);

    const health = await requestJson(baseUrl, "/api/sambah-messaging/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.json.broker, "internal");
    assert.equal(health.json.brokers.internal.status, "active");
    assert.ok(["not_configured", "mock_ready"].includes(health.json.brokers.redis_streams.status));
    assert.ok(["not_configured", "mock_ready"].includes(health.json.brokers.rabbitmq.status));
    assert.equal(health.json.brokers.kafka_future.status, "future_documented");
  });
});

test("SamBah Messaging lista contratos, topicos e rotas planejadas", async () => {
  await withServer(async ({ baseUrl }) => {
    const contracts = await requestJson(baseUrl, "/api/sambah-messaging/contracts");
    assert.equal(contracts.response.status, 200);
    assert.equal(contracts.json.total, 11);
    assert.ok(contracts.json.topics.includes("sambah.payments"));
    assert.ok(contracts.json.items.some((item) => item.type === "payment.confirmed" && item.topic === "sambah.payments"));
    assert.ok(contracts.json.items.some((item) => item.type === "locker.pickup.fraud_suspected" && item.topic === "sambah.security"));
    assert.ok(contracts.json.items.some((item) => item.type === "pay.perola.signal.created" && item.topic === "sambah.perola"));

    const routes = await requestJson(baseUrl, "/api/sambah-messaging/routes");
    assert.equal(routes.response.status, 200);
    assert.ok(routes.json.items.some((item) => item.routingKey === "machine_alert.created"));
  });
});

test("SamBah Messaging publish-test publica no Event Bus e preserva correlacao", async () => {
  await withServer(async ({ baseUrl }) => {
    const published = await requestJson(baseUrl, "/api/sambah-messaging/publish-test", {
      method: "POST",
      body: { correlationId: "corr-msg-test", causationId: "evt-cause-test", payload: { value: 42 } }
    });
    assert.equal(published.response.status, 200);
    assert.equal(published.json.message.correlationId, "corr-msg-test");
    assert.equal(published.json.message.causationId, "evt-cause-test");
    assert.equal(published.json.event.type, "messaging.test.published");
    assert.equal(published.json.event.correlationId, "corr-msg-test");
    assert.equal(published.json.event.causationId, "evt-cause-test");

    const events = await requestJson(baseUrl, "/api/sambah-events");
    assert.ok(events.json.items.some((item) => item.type === "messaging.test.published" && item.correlationId === "corr-msg-test"));
    assert.ok(events.json.items.some((item) => item.type === "messaging.contract.validated" && item.correlationId === "corr-msg-test"));
  });
});

test("SamBah Messaging falha simulada gera operational_alert e audit_log", async () => {
  await withServer(async ({ baseUrl, module }) => {
    const failure = await requestJson(baseUrl, "/api/sambah-messaging/simulate-broker-failure", {
      method: "POST",
      body: { broker: "redis_streams", correlationId: "corr-broker-fail-test" }
    });
    assert.equal(failure.response.status, 200);
    assert.equal(failure.json.failure.type, "messaging.broker.failed");
    assert.equal(failure.json.alert.type, "messaging.broker.failed");

    const alerts = await requestJson(baseUrl, "/api/sambah-observability/alerts");
    assert.ok(alerts.json.items.some((item) => item.type === "messaging.broker.failed" && item.correlationId === "corr-broker-fail-test"));

    const logs = await module.repositories.auditLogs.all();
    assert.ok(logs.some((log) => log.type === "messaging_broker_failed" && log.context?.correlationId === "corr-broker-fail-test"));
  });
});

test("SamBah Messaging replay por correlationId responde estrutura valida", async () => {
  await withServer(async ({ baseUrl }) => {
    await requestJson(baseUrl, "/api/sambah-messaging/publish-test", {
      method: "POST",
      body: { correlationId: "corr-replay-test" }
    });
    const replay = await requestJson(baseUrl, "/api/sambah-messaging/replay/corr-replay-test", { method: "POST", body: { actor: "tester" } });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.json.ok, true);
    assert.equal(replay.json.correlationId, "corr-replay-test");
    assert.ok(replay.json.replayed >= 1);
    assert.equal(replay.json.completed.type, "messaging.replay.completed");

    const metrics = await requestJson(baseUrl, "/api/sambah-observability/metrics");
    assert.equal(metrics.json.messaging_broker_current, "internal");
    assert.ok(metrics.json.messaging_replays >= 1);
    assert.equal(metrics.json.messaging_contracts_count, 10);
    assert.equal(metrics.json.messaging_topics_count, 11);
  });
});
