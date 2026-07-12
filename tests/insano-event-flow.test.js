import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../src/auditService.js";
import { CrmService } from "../src/crmService.js";
import { EventEmailAlertService } from "../src/eventEmailAlertService.js";
import { EventScheduleService } from "../src/eventScheduleService.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { OrderDraftService } from "../src/orderDraftService.js";
import { createApp } from "../src/server.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

function crmFiles(dir) {
  return {
    clientes: join(dir, "clientes.json"),
    leads: join(dir, "leads.json"),
    atendimentos: join(dir, "atendimentos.json"),
    eventos: join(dir, "eventos.json"),
    precomandas: join(dir, "precomandas.json")
  };
}

async function makeServer({ smtpClient = null, env = {}, whatsappProvider = null, runtimeConfig = null } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambha-insano-event-"));
  const eventService = new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "services.json") });
  const eventEmailAlertService = new EventEmailAlertService({
    filePath: join(dir, "event-email-alerts.json"),
    env,
    smtpClient
  });
  const whatsappConversationService = new WhatsAppConversationService({ filePath: join(dir, "conversas.json") });
  const server = createApp({
    auditService: new AuditService({ filePath: join(dir, "audit.json") }),
    menuService: new MenuSyncService({ cacheFile: join(dir, "menu.json") }),
    draftService: new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") }),
    mesaService: new MesaIntegrationService({ queueFile: join(dir, "mesa.json") }),
    crmService: new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745" }),
    eventService,
    eventEmailAlertService,
    whatsappConversationService,
    ...(whatsappProvider ? { whatsappProvider } : {}),
    ...(runtimeConfig ? { runtimeConfig } : {})
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return {
    dir,
    base: `http://127.0.0.1:${server.address().port}`,
    server,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  };
}

function validPayload(patch = {}) {
  return {
    conversationId: "wa_5551987654321",
    submissionId: "event_form_test_1",
    telefoneOriginal: "5551987654321",
    telefone: "51987654321",
    nome: "Cliente Evento",
    data: "25/08/2026",
    local: "Salao da Associacao",
    cidade: "Porto Alegre",
    pessoas: "100",
    horarioInicio: "18:00",
    horarioTermino: "23:00",
    observacoes: "Gostaria de churrasco e comida de boteco.",
    ...patch
  };
}

test("fluxo final Evento valida campos, registra uma solicitação e preserva conversa", async () => {
  const smtpCalls = [];
  const app = await makeServer({
    env: {
      EVENT_SMTP_HOST: "smtp.test",
      EVENT_SMTP_PORT: "587",
      EVENT_SMTP_USER: "sambah@test.local",
      EVENT_SMTP_PASSWORD: "secret-password",
      EVENT_EMAIL_FROM: "sambah@test.local",
      EVENT_EMAIL_TO: "chefnenogutterres@gmail.com"
    },
    smtpClient: async (message) => {
      smtpCalls.push(message);
      return "smtp-message-1";
    }
  });
  const post = async (body) => {
    const response = await fetch(`${app.base}/api/site/insano/evento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    assert.equal((await post(validPayload({ nome: "" }))).status, 400);
    assert.equal((await post(validPayload({ data: "01/01/2026" }))).body.errors.some((item) => item.error === "past_date"), true);
    assert.equal((await post(validPayload({ pessoas: "0" }))).body.errors.some((item) => item.field === "publicoPrevisto"), true);
    assert.equal((await post(validPayload({ horarioTermino: "" }))).body.errors.some((item) => item.field === "horarioTermino"), true);

    const created = await post(validPayload());
    assert.equal(created.status, 201);
    assert.equal(created.body.ok, true);
    assert.equal(created.body.status, "AGUARDANDO_ANALISE");
    assert.equal(created.body.conversationId, "wa_5551987654321");
    assert.equal(created.body.emailAlert.status, "SENT");
    assert.equal(smtpCalls.length, 1);
    assert.equal(smtpCalls[0].to, "chefnenogutterres@gmail.com,kdoiegutterresgastronomia@gmail.com");
    assert.match(smtpCalls[0].subject, /\[NOVO EVENTO\] 25\/08\/2026 — Porto Alegre — 100 pessoas/);

    const duplicate = await post(validPayload());
    assert.equal(duplicate.status, 201);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(smtpCalls.length, 1);

    const leads = JSON.parse(await readFile(join(app.dir, "event-leads.json"), "utf8"));
    assert.equal(leads.length, 1);
    assert.equal(leads[0].id, "event_form_test_1");
    assert.equal(leads[0].status, "AGUARDANDO_ANALISE");
    assert.equal(leads[0].conversationId, "wa_5551987654321");
    assert.equal(leads[0].telefoneOriginal, "5551987654321");
    assert.equal(leads[0].telefoneContato, "51987654321");
    assert.equal(leads[0].origin, "WHATSAPP_PORTAL_INSANO_FOODTRUCK_EVENTO");

    const alerts = JSON.parse(await readFile(join(app.dir, "event-email-alerts.json"), "utf8"));
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].status, "SENT");
    assert.equal(alerts[0].eventRequestId, "event_form_test_1");
    assert.equal(alerts[0].to, "chefnenogutterres@gmail.com,kdoiegutterresgastronomia@gmail.com");
    assert.match(alerts[0].body, /ABRIR CONVERSA NO SAMBAH/);
    assert.match(alerts[0].conversationUrl, /conversationId=wa_5551987654321/);

    const conversations = JSON.parse(await readFile(join(app.dir, "conversas.json"), "utf8"));
    const conversa = conversations.conversas.find((item) => item.id === "wa_5551987654321");
    assert.ok(conversa);
    assert.ok(conversa.mensagens.some((item) => item.text.includes("Nova solicitacao de evento")));
    assert.ok(conversa.mensagens.some((item) => item.text.includes("Recebemos tua solicitacao de evento.")));
  } finally {
    await app.close();
  }
});

test("falha de SMTP preserva solicitação e marca alerta como FAILED sem duplicar SENT", async () => {
  const app = await makeServer({
    env: {
      EVENT_SMTP_HOST: "smtp.test",
      EVENT_SMTP_PORT: "587",
      EVENT_SMTP_USER: "sambah@test.local",
      EVENT_SMTP_PASSWORD: "secret-password",
      EVENT_EMAIL_FROM: "sambah@test.local"
    },
    smtpClient: async () => {
      throw new Error("smtp secret-password failure");
    }
  });
  try {
    const response = await fetch(`${app.base}/api/site/insano/evento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload({ submissionId: "event_form_test_failed" }))
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.emailAlert.status, "FAILED");
    const leads = JSON.parse(await readFile(join(app.dir, "event-leads.json"), "utf8"));
    assert.equal(leads.length, 1);
    const alerts = JSON.parse(await readFile(join(app.dir, "event-email-alerts.json"), "utf8"));
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].status, "FAILED");
    assert.doesNotMatch(alerts[0].error, /secret-password/);
  } finally {
    await app.close();
  }
});

test("falha no retorno WhatsApp nao bloqueia email do formulario Evento", async () => {
  const smtpCalls = [];
  const app = await makeServer({
    env: {
      EVENT_SMTP_HOST: "smtp.test",
      EVENT_SMTP_PORT: "587",
      EVENT_SMTP_USER: "sambah@test.local",
      EVENT_SMTP_PASSWORD: "secret-password",
      EVENT_EMAIL_FROM: "sambah@test.local"
    },
    smtpClient: async (message) => {
      smtpCalls.push(message);
      return "smtp-message-whatsapp-failed";
    },
    whatsappProvider: {
      sendMessage: async () => {
        throw new Error("Meta Bearer SECRET_TOKEN_123456789012345678901234 failure");
      }
    },
    runtimeConfig: {
      whatsappBusiness: { sendEnabled: true },
      whatsappNumber: "5551980413745",
      publicBaseUrl: "https://sambah.onrender.com"
    }
  });
  try {
    const response = await fetch(`${app.base}/api/site/insano/evento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload({ submissionId: "event_form_test_whatsapp_failed" }))
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.emailAlert.status, "SENT");
    assert.equal(body.emailAlert.to, "chefnenogutterres@gmail.com,kdoiegutterresgastronomia@gmail.com");
    assert.equal(body.emailSend.ok, true);
    assert.equal(body.whatsappSent, false);
    assert.equal(smtpCalls.length, 1);
    assert.equal(smtpCalls[0].to, "chefnenogutterres@gmail.com,kdoiegutterresgastronomia@gmail.com");

    const conversations = JSON.parse(await readFile(join(app.dir, "conversas.json"), "utf8"));
    const conversa = conversations.conversas.find((item) => item.id === "wa_5551987654321");
    const returnMessage = conversa.mensagens.find((item) => item.correlationId === "insano-event-return:event_form_test_whatsapp_failed");
    assert.ok(returnMessage);
    assert.equal(returnMessage.status, "whatsapp_return_failed");
    assert.doesNotMatch(returnMessage.errorMessage, /SECRET_TOKEN/);
  } finally {
    await app.close();
  }
});

test("formulario publico do Evento nao expoe shell operacional do SamBah", async () => {
  const app = await makeServer();
  try {
    const response = await fetch(`${app.base}/evento/insano?conversationId=wa_5551987654321&phone=5551987654321`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Solicitacao de evento - Insano Food Truck/);
    assert.match(html, /platform\.js/);
    assert.doesNotMatch(html, /renderSambahShell/);
    assert.doesNotMatch(html, /admin\/assets\/sambah-shell/);
    assert.doesNotMatch(html, /Abrir CRM/);
    assert.doesNotMatch(html, /Cardapio Xeriffe/);
    assert.doesNotMatch(html, /QR Codes/);
    assert.doesNotMatch(html, /Garcom/);
    assert.doesNotMatch(html, /Cozinha/);

    const script = await fetch(`${app.base}/platform.js`).then((item) => item.text());
    assert.match(script, /Nome do contato/);
    assert.match(script, /Telefone de contato/);
    assert.match(script, /Data do evento/);
    assert.match(script, /Publico previsto/);
    assert.match(script, /ENVIAR SOLICITACAO/);
    assert.doesNotMatch(script, /Conferir dados/);
    assert.doesNotMatch(script, /ENVIAR PARA ANALISE/);
    assert.doesNotMatch(script, /CORRIGIR DADOS/);
  } finally {
    await app.close();
  }
});
