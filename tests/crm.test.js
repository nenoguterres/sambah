import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../src/auditService.js";
import { CrmService } from "../src/crmService.js";
import { EventScheduleService } from "../src/eventScheduleService.js";
import { EventEmailAlertService } from "../src/eventEmailAlertService.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { OrderDraftService } from "../src/orderDraftService.js";
import { OrderTrackingService } from "../src/orderTrackingService.js";
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

test("CRM salva atendimento de evento, cliente, lead e link WhatsApp", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-crm-service-"));
  try {
    const crm = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551999999999" });
    const result = await crm.registrarAtendimentoComercial({
      nome: "Cliente Evento",
      whatsapp: "51 98888-7777",
      origem: "site",
      message: "Quero food truck para confraternizacao de empresa para 80 pessoas mes que vem"
    });

    assert.equal(result.ok, true);
    assert.equal(result.interesse, "festa_confraternizacao");
    assert.ok(result.cliente.id);
    assert.ok(result.lead.id);
    assert.ok(result.evento.id);
    assert.equal(result.evento.quantidade_pessoas, 80);
    assert.ok(result.atendimento.id);
    assert.match(result.whatsappUrl, /^https:\/\/wa\.me\/5551999999999/);

    const resumo = await crm.resumo();
    assert.equal(resumo.clientes, 1);
    assert.equal(resumo.leads, 1);
    assert.equal(resumo.eventos, 1);
    assert.equal(resumo.atendimentos, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("site pedido canonico cria pedido e valida payload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-site-pedido-"));
  const previousNumber = process.env.INSANO_WHATSAPP_NUMBER;
  const previousToken = process.env.SITE_PUBLIC_TOKEN;
  const previousEnabled = process.env.SITE_ORDERS_ENABLED;
  process.env.INSANO_WHATSAPP_NUMBER = "5551980413745";
  process.env.SITE_PUBLIC_TOKEN = "";
  process.env.SITE_ORDERS_ENABLED = "true";

  const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745" });
  const server = createApp({ crmService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const post = async (body) => {
    const response = await fetch(`${base}/api/site/pedido`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const cardapioResponse = await fetch(`${base}/api/site/cardapio`);
    const cardapio = await cardapioResponse.json();
    assert.equal(cardapioResponse.status, 200);
    assert.equal(cardapio.ok, true);
    assert.ok(Array.isArray(cardapio.categorias));
    assert.ok(cardapio.categorias.includes("Burgers"));
    assert.ok(Array.isArray(cardapio.produtos));
    const burguerInsano = cardapio.produtos.find((produto) => produto.nome === "Burguer Insano");
    assert.ok(burguerInsano);
    assert.equal(burguerInsano.preco, null);
    assert.equal(cardapio.produtos.every((produto) => produto.preco === null), true);

    const valid = await post({
      nome: "Cliente Wix",
      telefone: "51999999999",
      origem: "site-insano",
      tipo: "pedido",
      itens: [{ nome: "Burguer Insano", quantidade: 1, preco: 30, observacao: "sem cebola" }],
      formaEntrega: "retirada",
      endereco: "",
      formaPagamento: "pix",
      observacoes: "opcional",
      totalEstimado: 30
    });

    assert.equal(valid.status, 201);
    assert.equal(valid.body.ok, true);
    assert.ok(valid.body.pedidoId);
    assert.equal(valid.body.status, "novo");
    assert.match(valid.body.whatsappMessage, /Olá, equipe Insano/);
    assert.match(valid.body.whatsappMessage, /Sou o SamBah e organizei um novo atendimento pelo Portal Insano/);
    assert.match(valid.body.whatsappMessage, /ID:/);
    assert.match(valid.body.whatsappMessage, /Cliente: Cliente Wix/);
    assert.match(valid.body.whatsappMessage, /WhatsApp: 51999999999/);
    assert.match(valid.body.whatsappMessage, /Tipo de atendimento: Retirar/);
    assert.match(valid.body.whatsappMessage, /- 1x Burguer Insano/);
    assert.match(valid.body.whatsappMessage, /Status: aguardando confirmação da equipe/);
    assert.match(valid.body.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);
    assert.ok(valid.body.statusUrl);
    assert.equal(valid.body.confirmation.title, "✅ Pedido recebido pelo SamBah");

    const mesaPedidos = await fetch(`${base}/api/mesa/pedidos-site?status=novo`).then((response) => response.json());
    assert.equal(mesaPedidos.ok, true);
    assert.ok(mesaPedidos.items.some((item) => item.id === valid.body.pedidoId && item.whatsapp === "51999999999"));

    const mesaBloqueio = await fetch(`${base}/api/mesa/pedidos-site/${encodeURIComponent(valid.body.pedidoId)}/bloqueio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "estoque_turno",
        message: "Conferir/liberar estoque do turno antes de importar.",
        mesaStatus: "bloqueado_estoque"
      })
    }).then((response) => response.json());
    assert.equal(mesaBloqueio.ok, true);
    assert.equal(mesaBloqueio.status, "bloqueado_estoque");

    const mesaBloqueados = await fetch(`${base}/api/mesa/pedidos-site?status=bloqueado_estoque`).then((response) => response.json());
    assert.equal(mesaBloqueados.ok, true);
    assert.ok(mesaBloqueados.items.some((item) => item.id === valid.body.pedidoId && item.status === "bloqueado_estoque"));

    const mesaTodos = await fetch(`${base}/api/mesa/pedidos-site?status=todos`).then((response) => response.json());
    assert.equal(mesaTodos.ok, true);
    assert.ok(mesaTodos.items.some((item) => item.id === valid.body.pedidoId));

    const mesaStatus = await fetch(`${base}/api/mesa/pedidos-site/${encodeURIComponent(valid.body.pedidoId)}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "aceito", observacao: "Importado pelo Mesa do Xeriffe", origemAtualizacao: "mesa-xeriffe" })
    }).then((response) => response.json());
    assert.equal(mesaStatus.ok, true);
    assert.equal(mesaStatus.status, "aceito");

    const statusPage = await fetch(`${base}${valid.body.statusUrl}`);
    const statusHtml = await statusPage.text();
    assert.equal(statusPage.status, 200);
    assert.match(statusHtml, /Pedido recebido/);
    assert.match(statusHtml, /Aguardando confirmação/);

    const withoutName = await post({ telefone: "51999999999", itens: [{ nome: "Burguer", quantidade: 1 }] });
    assert.equal(withoutName.status, 400);
    assert.equal(withoutName.body.ok, false);

    const withoutPhone = await post({ nome: "Cliente", itens: [{ nome: "Burguer", quantidade: 1 }] });
    assert.equal(withoutPhone.status, 400);
    assert.equal(withoutPhone.body.ok, false);

    const withoutItems = await post({ nome: "Cliente", telefone: "51999999999", itens: [] });
    assert.equal(withoutItems.status, 400);
    assert.equal(withoutItems.body.ok, false);

    const withoutItemName = await post({ nome: "Cliente", telefone: "51999999999", itens: [{ quantidade: 1 }] });
    assert.equal(withoutItemName.status, 400);
    assert.equal(withoutItemName.body.ok, false);

    const invalidQuantity = await post({ nome: "Cliente", telefone: "51999999999", itens: [{ nome: "Burguer", quantidade: 0 }] });
    assert.equal(invalidQuantity.status, 400);
    assert.equal(invalidQuantity.body.ok, false);
  } finally {
    server.close();
    if (previousNumber === undefined) delete process.env.INSANO_WHATSAPP_NUMBER;
    else process.env.INSANO_WHATSAPP_NUMBER = previousNumber;
    if (previousToken === undefined) delete process.env.SITE_PUBLIC_TOKEN;
    else process.env.SITE_PUBLIC_TOKEN = previousToken;
    if (previousEnabled === undefined) delete process.env.SITE_ORDERS_ENABLED;
    else process.env.SITE_ORDERS_ENABLED = previousEnabled;
    await rm(dir, { recursive: true, force: true });
  }
});

test("storage status usa DATA_DIR persistente e mantem pedido apos reinicio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-storage-"));
  const previousDataDir = process.env.DATA_DIR;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousNumber = process.env.INSANO_WHATSAPP_NUMBER;
  const previousEnabled = process.env.SITE_ORDERS_ENABLED;
  process.env.DATA_DIR = dir;
  process.env.NODE_ENV = "production";
  process.env.INSANO_WHATSAPP_NUMBER = "5551980413745";
  process.env.SITE_ORDERS_ENABLED = "true";

  let server;
  let restartedServer;
  try {
    const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745" });
    server = createApp({ crmService });
    await new Promise((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const createdResponse = await fetch(`${base}/api/site/pedido`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "Cliente Persistente",
        telefone: "51999990000",
        origem: "site-insano",
        tipo: "pedido",
        itens: [{ nome: "Burguer Insano", quantidade: 1 }],
        formaEntrega: "retirada",
        formaPagamento: "pix"
      })
    });
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 201);
    assert.equal(created.ok, true);
    assert.ok(created.pedidoId);

    const beforeRestart = await fetch(`${base}/api/admin/storage-status`).then((response) => response.json());
    assert.equal(beforeRestart.ok, true);
    assert.equal(beforeRestart.dataDir, dir);
    assert.equal(beforeRestart.persistenciaConfigurada, true);
    assert.equal(beforeRestart.totais.precomandas, 1);
    assert.equal(beforeRestart.totais.pedidosSite, 1);
    assert.ok(beforeRestart.arquivosEncontrados.some((file) => file.name === "precomandas.json"));

    await new Promise((resolve) => server.close(resolve));
    server = null;

    const crmServiceAfterRestart = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745" });
    restartedServer = createApp({ crmService: crmServiceAfterRestart });
    await new Promise((resolve) => restartedServer.listen(0, resolve));
    const restartedBase = `http://127.0.0.1:${restartedServer.address().port}`;

    const afterRestart = await fetch(`${restartedBase}/api/admin/storage-status`).then((response) => response.json());
    assert.equal(afterRestart.ok, true);
    assert.equal(afterRestart.dataDir, dir);
    assert.equal(afterRestart.totais.precomandas, 1);
    assert.equal(afterRestart.totalPrecomandas, 1);

    const statusPage = await fetch(`${restartedBase}/pedido/${encodeURIComponent(created.pedidoId)}/status`);
    assert.equal(statusPage.status, 200);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (restartedServer) await new Promise((resolve) => restartedServer.close(resolve));
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousNumber === undefined) delete process.env.INSANO_WHATSAPP_NUMBER;
    else process.env.INSANO_WHATSAPP_NUMBER = previousNumber;
    if (previousEnabled === undefined) delete process.env.SITE_ORDERS_ENABLED;
    else process.env.SITE_ORDERS_ENABLED = previousEnabled;
    await rm(dir, { recursive: true, force: true });
  }
});

test("plataformas externas, cardapios, mesa, garcom e cozinha respondem", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-platforms-"));
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({
    queueFile: join(dir, "queue.json"),
    mesaBaseUrl: "http://127.0.0.1:9"
  });
  const eventService = new EventScheduleService({
    leadsFile: join(dir, "event-leads.json"),
    servicesFile: join(dir, "insano-services.json")
  });
  const eventEmailAlertService = new EventEmailAlertService({ filePath: join(dir, "event-email-alerts.json") });
  const whatsappConversationService = new WhatsAppConversationService({ filePath: join(dir, "whatsapp-conversas.json") });
  const trackingService = new OrderTrackingService({ filePath: join(dir, "tracking.json") });
  const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745" });
  const server = createApp({ auditService, menuService, draftService, mesaService, eventService, eventEmailAlertService, whatsappConversationService, trackingService, crmService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).then((response) => response.json());
  try {
    const config = await fetch(`${base}/api/config`).then((response) => response.json());
    assert.equal(config.baseApi, "http://localhost:3000");
    assert.equal(config.endpoints.eventQuote, "/api/site/orcamento-evento");

    const lead = await post("/api/site/lead", {
      nome: "Lead Insano Site",
      whatsapp: "51970000001",
      operation: "Insano",
      message: "Quero atendimento do Insano"
    });
    assert.equal(lead.ok, true);
    assert.equal(lead.operation, "Insano");
    assert.match(lead.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    const quote = await post("/api/site/orcamento-evento", {
      nome: "Orcamento Xeriffe",
      whatsapp: "51970000002",
      operation: "Buteco Xeriffe",
      message: "Festa no Xeriffe para 40 pessoas"
    });
    assert.equal(quote.ok, true);
    assert.equal(quote.operation, "Buteco Xeriffe");
    assert.ok(quote.id);

    const quick = await post("/api/site/pedido-rapido", {
      nome: "Pedido Rapido",
      whatsapp: "51970000003",
      operation: "Insano",
      items: [{ name: "Burguer Insano", quantity: 1 }]
    });
    assert.equal(quick.ok, true);
    assert.equal(quick.pipeline, "pedido_rapido");

    const pre = await post("/api/site/precomanda", {
      nome: "Pre Comanda",
      whatsapp: "51970000004",
      operation: "Buteco Xeriffe",
      mesa: "7",
      items: [{ name: "Porcoes", quantity: 2 }],
      customer: { name: "Pre Comanda", phone: "51970000004", serviceType: "mesa", paymentMethod: "pix" }
    });
    assert.equal(pre.ok, true);
    assert.equal(pre.operation, "Buteco Xeriffe");
    assert.match(pre.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);
    assert.match(pre.whatsappMessage, /Olá, equipe Insano/);
    assert.match(pre.whatsappMessage, /Mesa: 7/);
    assert.ok(pre.statusUrl);

    const whatsapp = await post("/api/site/whatsapp", {
      nome: "Contato WhatsApp",
      whatsapp: "51970000006",
      operation: "Insano",
      message: "Quero falar no WhatsApp"
    });
    assert.equal(whatsapp.ok, true);
    assert.ok(whatsapp.atendimento || whatsapp.lead);
    assert.match(whatsapp.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    const insanoLead = await post("/api/site/insano/lead", {
      nome: "Lead Wix Insano",
      whatsapp: "51970000007",
      page: "/",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "agenda-insano",
      message: "Quero conhecer o food truck"
    });
    assert.equal(insanoLead.ok, true);
    assert.equal(insanoLead.operation, "Insano");
    assert.equal(insanoLead.lead.origem, "insanofoodtruck.com.br");
    assert.equal(insanoLead.lead.source, "insanofoodtruck.com.br");
    assert.equal(insanoLead.lead.channel, "site");
    assert.equal(insanoLead.lead.page, "/");
    assert.equal(insanoLead.lead.utm_campaign, "agenda-insano");
    assert.match(insanoLead.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    const insanoPedido = await post("/api/site/insano/pedido", {
      nome: "Pedido Wix Insano",
      whatsapp: "51970000008",
      page: "/online-ordering-1",
      items: [{ name: "Hamburgueria", quantity: 2 }]
    });
    assert.equal(insanoPedido.ok, true);
    assert.equal(insanoPedido.operation, "Insano");
    assert.equal(insanoPedido.pipeline, "pedido_rapido");
    assert.match(insanoPedido.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    const insanoEvento = await post("/api/site/insano/evento", {
      conversationId: "wa_555197000009",
      nome: "Evento Wix Insano",
      telefoneOriginal: "51970000009",
      whatsapp: "51970000009",
      data: "25/08/2026",
      local: "Porto Alegre",
      cidade: "Porto Alegre",
      pessoas: "90",
      horarioInicio: "18:00",
      horarioTermino: "23:00",
      tipo_evento: "executivo",
      page: "/service-page/insano",
      observacoes: "Evento executivo com churrascaria"
    });
    assert.equal(insanoEvento.ok, true);
    assert.equal(insanoEvento.operation, "Insano");
    assert.equal(insanoEvento.pipeline, "food_truck_evento");
    assert.equal(insanoEvento.status, "AGUARDANDO_ANALISE");
    assert.equal(insanoEvento.lead.source, "WHATSAPP_PORTAL_INSANO_FOODTRUCK_EVENTO");
    assert.equal(insanoEvento.crm.lead.origem, "insanofoodtruck.com.br");
    assert.equal(insanoEvento.emailAlert.to, "chefnenogutterres@gmail.com,kdoiegutterresgastronomia@gmail.com");
    assert.match(insanoEvento.emailAlert.subject, /\[NOVO EVENTO\] 25\/08\/2026 — Porto Alegre — 90 pessoas/);
    assert.match(insanoEvento.conversationUrl, /\/conversas\?conversationId=wa_555197000009/);
    assert.match(insanoEvento.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);
    const eventLeads = JSON.parse(await readFile(join(dir, "event-leads.json"), "utf8"));
    assert.equal(eventLeads[0].status, "AGUARDANDO_ANALISE");
    assert.equal(eventLeads[0].conversationId, "wa_555197000009");
    assert.equal(eventLeads[0].event.startsAt, "18:00");
    const emailAlerts = JSON.parse(await readFile(join(dir, "event-email-alerts.json"), "utf8"));
    assert.equal(emailAlerts[0].to, "chefnenogutterres@gmail.com,kdoiegutterresgastronomia@gmail.com");
    assert.match(emailAlerts[0].body, /ABRIR CONVERSA NO SAMBAH/);

    const insanoWhatsapp = await post("/api/site/insano/whatsapp", {
      nome: "WhatsApp Wix Insano",
      whatsapp: "51970000010",
      page: "/menus-novo",
      message: "Quero falar no WhatsApp"
    });
    assert.equal(insanoWhatsapp.ok, true);
    assert.equal(insanoWhatsapp.operation, "Insano");
    assert.equal(insanoWhatsapp.pipeline, "atendimento_humano");
    assert.match(insanoWhatsapp.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    const directPre = await fetch(`${base}/api/precomandas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "Direta",
        whatsapp: "51970000005",
        operacao: "Insano",
        tipo: "retirada",
        pagamento: "pix",
        itens: [{ nome: "Espetinho", quantidade: 1 }]
      })
    }).then((response) => response.json());
    assert.match(directPre.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    for (const path of ["/cardapio/insano", "/cardapio/xeriffe", "/mesa/insano/1", "/mesa/xeriffe/10", "/garcom", "/cozinha", "/admin/qrcodes"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /SamBah/);
    }

    const eventForm = await fetch(`${base}/evento/insano`).then((response) => response.text());
    assert.match(eventForm, /Solicitacao de evento - Insano Food Truck/);
    assert.doesNotMatch(eventForm, /renderSambahShell|Abrir CRM|Cardapio Xeriffe|QR Codes|Garcom|Cozinha/);

    const precomandas = await fetch(`${base}/api/precomandas`).then((response) => response.json());
    assert.ok(precomandas.items.some((item) => item.id === pre.precomanda.id));

    const resumo = await fetch(`${base}/api/crm/resumo`).then((response) => response.json());
    assert.ok(resumo.leadsInsanoSite.some((item) => item.id === insanoLead.id));
    assert.ok(resumo.leadsInsanoSite.some((item) => item.id === insanoEvento.crm.lead.id));

    const crmHtml = await fetch(`${base}/crm.js`).then((response) => response.text());
    assert.match(crmHtml, /Leads vindos do site Insano/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("Portal Insano cria pedidos, eventos, empresas, Xeriffe e WhatsApp sem expor operacao interna", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-portal-"));
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json"), mesaBaseUrl: "http://127.0.0.1:9" });
  const eventService = new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "insano-services.json") });
  const trackingService = new OrderTrackingService({ filePath: join(dir, "tracking.json") });
  const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745", now: () => new Date("2026-06-08T12:00:00.000Z") });
  const server = createApp({ auditService, menuService, draftService, mesaService, eventService, trackingService, crmService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const old = "2026-06-08T08:30:00.000Z";
  const post = (path, body) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).then((response) => response.json());
  try {
    for (const path of ["/", "/pedir", "/eventos", "/empresas", "/xeriffe", "/whatsapp", "/atendimento", "/sambah"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), path === "/sambah" ? /samBah/i : /Portal Insano|portalApp/);
    }

    const home = await fetch(`${base}/`).then((response) => response.text());
    assert.match(home, /PORTAL INSANO/);
    assert.match(home, /portal-topbar/);
    assert.doesNotMatch(home, /sambah-shell\.js|sambah-shell\.css|renderSambahShell/);
    const portalJs = await fetch(`${base}/portal.js`).then((response) => response.text());
    assert.match(portalJs, /Insano Food Truck/);
    assert.match(portalJs, /Xeriffe Obirici/);
    assert.match(portalJs, /Granja/);
    assert.match(portalJs, /Tecnologias/);
    assert.match(portalJs, /Atendimento humano/);
    assert.match(portalJs, /Chef Neno Gutterres/);
    assert.match(portalJs, /Kazuko Doi/);
    assert.doesNotMatch(portalJs, /insano-gastronomia-2026|xeriffe-obirici-original|granja-aguas-da-lagoa|sambah-original|chef-neno-gutterres/);
    assert.match(portalJs, /\/xeriffe\/cardapio/);

    const delivery = await post("/api/site/precomanda", {
      operation: "Insano",
      source: "portal_insano",
      channel: "site",
      type: "delivery",
      customerName: "Portal Delivery",
      nome: "Portal Delivery",
      phone: "51971000001",
      whatsapp: "51971000001",
      pipeline: "pedido_rapido",
      notes: "Bairro Centro | Pix",
      items: [{ name: "Hamburgueria", quantity: 1 }],
      createdAt: old,
      atualizado_em: old,
      status: "novo"
    });
    assert.equal(delivery.ok, true);
    assert.equal(delivery.precomanda.pipeline, "pedido_rapido");
    assert.equal(delivery.precomanda.type, "delivery");
    assert.equal(delivery.precomanda.customerName, "Portal Delivery");

    const retirar = await post("/api/site/precomanda", {
      operation: "Insano",
      source: "portal_insano",
      channel: "site",
      type: "retirar",
      customerName: "Portal Retirar",
      phone: "51971000002",
      pipeline: "pedido_rapido",
      notes: "Retirar 20h",
      items: [{ name: "Pizzaria", quantity: 1 }],
      createdAt: old,
      atualizado_em: old,
      status: "novo"
    });
    assert.equal(retirar.precomanda.type, "retirar");

    const mesa = await post("/api/site/precomanda", {
      operation: "Insano",
      source: "portal_insano",
      channel: "site",
      type: "mesa",
      customerName: "Mesa Portal",
      phone: "51971000003",
      mesa: "12",
      pipeline: "mesa",
      items: [{ name: "PanBagnat / Hot dog / Pancho", quantity: 2 }],
      createdAt: old,
      atualizado_em: old,
      status: "novo"
    });
    assert.equal(mesa.precomanda.pipeline, "mesa");
    const cozinha = await fetch(`${base}/api/precomandas`).then((response) => response.json());
    assert.ok(cozinha.items.some((item) => item.id === mesa.precomanda.id));

    const evento = await post("/api/site/orcamento-evento", {
      operation: "Insano",
      source: "portal_insano",
      channel: "site",
      type: "evento",
      customerName: "Evento Portal",
      nome: "Evento Portal",
      phone: "51971000004",
      whatsapp: "51971000004",
      pipeline: "orcamento_evento",
      data: "20/06/2026",
      local: "Centro",
      quantidade_pessoas: "60",
      notes: "Churrasco",
      createdAt: old,
      atualizado_em: old
    });
    assert.equal(evento.pipeline, "orcamento_evento");

    const empresa = await post("/api/site/insano/evento", {
      source: "portal_insano",
      channel: "site",
      type: "empresa",
      customerName: "Empresa Portal",
      nome: "Empresa Portal",
      telefoneOriginal: "51971000005",
      phone: "51971000005",
      whatsapp: "51971000005",
      data: "25/08/2026",
      local: "Centro de Eventos",
      cidade: "Porto Alegre",
      quantidade_pessoas: "90",
      horarioInicio: "14:00",
      terminoADefinir: true,
      notes: "Coffee break",
      createdAt: old,
      atualizado_em: old
    });
    assert.equal(empresa.pipeline, "food_truck_evento");

    const xeriffe = await post("/api/site/lead", {
      operation: "Buteco Xeriffe",
      source: "portal_insano",
      channel: "site",
      type: "xeriffe",
      customerName: "Xeriffe Portal",
      nome: "Xeriffe Portal",
      phone: "51971000006",
      whatsapp: "51971000006",
      pipeline: "festa_xeriffe",
      notes: "Reservar mesa",
      createdAt: old,
      atualizado_em: old
    });
    assert.equal(xeriffe.operation, "Buteco Xeriffe");
    assert.equal(xeriffe.pipeline, "festa_xeriffe");

    const whatsapp = await post("/api/site/whatsapp", {
      operation: "Insano",
      source: "portal_insano",
      channel: "site",
      type: "whatsapp",
      pipeline: "atendimento_whatsapp",
      notes: "Pedido",
      message: "Quero falar sobre pedido",
      createdAt: old
    });
    assert.equal(whatsapp.pipeline, "atendimento_whatsapp");
    assert.match(whatsapp.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    const oportunidades = await fetch(`${base}/api/oportunidades`).then((response) => response.json());
    assert.ok(oportunidades.items.some((item) => item.recordId === delivery.precomanda.id));
    assert.ok(oportunidades.items.some((item) => item.recordId === retirar.precomanda.id));
    assert.ok(oportunidades.items.some((item) => item.recordId === mesa.precomanda.id));
    assert.ok(oportunidades.items.some((item) => item.recordId === evento.id));
    assert.ok(oportunidades.items.some((item) => item.recordId === empresa.crm.lead.id));
    assert.ok(oportunidades.items.some((item) => item.recordId === xeriffe.id));
    assert.ok(oportunidades.items.some((item) => item.recordId === whatsapp.id));

    assert.doesNotMatch(portalJs, /Pedido enviado para a cozinha\. Continuar no WhatsApp/);
    assert.match(portalJs, /Enviando seu pedido\.\.\./);
    assert.match(portalJs, /replaceFormWithResult/);
    assert.match(portalJs, /Continuar atendimento no WhatsApp/);
    assert.match(portalJs, /Acompanhar pedido/);
    assert.match(portalJs, /Não conseguimos registrar agora/);
    assert.match(portalJs, /Informe a mesa para continuar o atendimento/);
    assert.match(portalJs, /data-form-shell/);    assert.match(portalJs, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Oportunidades classifica parados e atualiza registros originais", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-opportunities-"));
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json"), mesaBaseUrl: "http://127.0.0.1:9" });
  const eventService = new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "insano-services.json") });
  const trackingService = new OrderTrackingService({ filePath: join(dir, "tracking.json") });
  const now = new Date("2026-06-08T12:00:00.000Z");
  const old = new Date("2026-06-07T10:00:00.000Z").toISOString();
  const olderToday = new Date("2026-06-08T08:30:00.000Z").toISOString();
  const veryOldQuote = new Date("2026-06-06T10:00:00.000Z").toISOString();
  const veryOldEvent = new Date("2026-06-05T10:00:00.000Z").toISOString();
  const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745", now: () => now });
  const server = createApp({ auditService, menuService, draftService, mesaService, eventService, trackingService, crmService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const hotLead = await crmService.salvarLead({
      nome: "Lead Quente Parado",
      whatsapp: "51981111111",
      origem: "site",
      operacao: "Insano",
      pipeline: "food_truck_evento",
      interesse: "food_truck",
      message: "food truck para empresa com 120 pessoas em Porto Alegre dia 20/06/2026",
      atualizado_em: olderToday,
      nextFollowUpAt: old
    });
    const quote = await crmService.salvarLead({
      nome: "Orcamento Parado",
      whatsapp: "51982222222",
      origem: "site",
      operacao: "Insano",
      pipeline: "orcamento_corporativo",
      interesse: "orcamento",
      status: "orcamento_solicitado",
      message: "orcamento corporativo para 80 pessoas",
      atualizado_em: veryOldQuote
    });
    const event = await crmService.salvarEvento({
      nome_evento: "Evento Incompleto",
      whatsapp: "51983333333",
      operacao: "Insano",
      pipeline: "orcamento_corporativo",
      tipo_evento: "corporativo",
      local: "Porto Alegre",
      atualizado_em: veryOldEvent
    });
    await crmService.salvarAtendimento({
      id: "atd_whatsapp_parado",
      canal: "site",
      origem: "whatsapp",
      mensagem_cliente: "Quero falar no WhatsApp",
      status: "registrado",
      criado_em: old
    });
    await crmService.salvarPrecomanda({
      nome: "Pedido Novo Parado",
      whatsapp: "51984444444",
      operacao: "Insano",
      itens: [{ nome: "Hamburgueria", quantidade: 1 }],
      status: "novo",
      criado_em: olderToday
    });

    const page = await fetch(`${base}/oportunidades`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Central de Oportunidades/);

    const oportunidades = await fetch(`${base}/api/oportunidades`).then((response) => response.json());
    assert.equal(oportunidades.ok, true);
    assert.ok(oportunidades.groups.acaoAgora.some((item) => item.recordId === hotLead.lead.id));
    assert.ok(oportunidades.groups.acaoAgora.some((item) => item.recordId === quote.lead.id));
    assert.ok(oportunidades.groups.acaoAgora.some((item) => item.recordId === event.evento.id));
    assert.ok(oportunidades.items.some((item) => item.recordId === "atd_whatsapp_parado"));
    assert.ok(oportunidades.items.every((item) => item.whatsappUrl?.startsWith("https://wa.me/")));
    const quoteOpportunity = oportunidades.items.find((item) => item.recordId === quote.lead.id);
    const eventOpportunity = oportunidades.items.find((item) => item.recordId === event.evento.id);
    assert.equal(quoteOpportunity.prioridade, "ALTA");
    assert.equal(quoteOpportunity.alerta, "orcamento_parado_48h");
    assert.match(quoteOpportunity.mensagemSugerida, /orcamento/i);
    assert.equal(eventOpportunity.alerta, "evento_parado_72h");
    assert.ok(oportunidades.items.some((item) => item.mensagemSugerida));

    const returned = await fetch(`${base}/api/oportunidades/${encodeURIComponent(`lead:${hotLead.lead.id}`)}/retornado`, { method: "POST" }).then((response) => response.json());
    assert.equal(returned.ok, true);
    const leadsAfterReturn = await crmService.listarLeads();
    assert.equal(leadsAfterReturn.items.find((item) => item.id === hotLead.lead.id).status_comercial, "retornado");

    const archived = await fetch(`${base}/api/oportunidades/${encodeURIComponent(`lead:${quote.lead.id}`)}/arquivar`, { method: "POST" }).then((response) => response.json());
    assert.equal(archived.ok, true);
    const afterArchive = await fetch(`${base}/api/oportunidades`).then((response) => response.json());
    assert.ok(!afterArchive.items.some((item) => item.recordId === quote.lead.id));

    const js = await fetch(`${base}/oportunidades.js`).then((response) => response.text());
    assert.match(js, /Copiar mensagem/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("operacao diaria completa cobre Insano, evento, festa Xeriffe, mesa e dashboard executivo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-real-operation-"));
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json"), mesaBaseUrl: "http://127.0.0.1:9" });
  const eventService = new EventScheduleService({ leadsFile: join(dir, "event-leads.json"), servicesFile: join(dir, "insano-services.json") });
  const trackingService = new OrderTrackingService({ filePath: join(dir, "tracking.json") });
  const now = new Date("2026-06-08T15:00:00.000Z");
  const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745", now: () => now });
  const server = createApp({ auditService, menuService, draftService, mesaService, eventService, trackingService, crmService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body = {}) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).then((response) => response.json());
  try {
    const insanoLead = await post("/api/site/insano/lead", {
      nome: "Operacao Insano Cliente",
      whatsapp: "51980000001",
      message: "Quero pedir hamburgueria",
      page: "/online-ordering-1"
    });
    assert.equal(insanoLead.ok, true);
    let oportunidades = await fetch(`${base}/api/oportunidades`).then((response) => response.json());
    assert.ok(oportunidades.items.some((item) => item.recordId === insanoLead.id));

    const insanoPedido = await post("/api/site/insano/pedido", {
      nome: "Operacao Insano Cliente",
      whatsapp: "51980000001",
      items: [{ name: "Hamburgueria", quantity: 2 }],
      page: "/cardapio/insano"
    });
    assert.equal(insanoPedido.pipeline, "pedido_rapido");
    const delivered = await fetch(`${base}/api/precomandas/${encodeURIComponent(insanoPedido.precomanda.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "entregue" })
    }).then((response) => response.json());
    assert.equal(delivered.item.status, "entregue");

    const insanoEvento = await post("/api/site/insano/evento", {
      nome: "Operacao Evento Insano",
      telefoneOriginal: "51980000002",
      whatsapp: "51980000002",
      data: "26/08/2026",
      local: "Porto Alegre",
      cidade: "Porto Alegre",
      pessoas: "120",
      horarioInicio: "18:00",
      horarioTermino: "23:00",
      tipo_evento: "executivo",
      observacoes: "Churrasco Insano corporativo",
      valor_estimado: 12000
    });
    assert.equal(insanoEvento.pipeline, "food_truck_evento");
    await post(`/api/crm/leads/${encodeURIComponent(insanoEvento.crm.lead.id)}/mark-quote-sent`);
    const closedInsano = await post(`/api/crm/leads/${encodeURIComponent(insanoEvento.crm.lead.id)}/mark-won`);
    assert.equal(closedInsano.item.status, "fechado");
    assert.equal(closedInsano.item.valorFechado, 12000);

    const xeriffeFesta = await post("/api/site/orcamento-evento", {
      nome: "Operacao Festa Xeriffe",
      whatsapp: "51980000003",
      operation: "Buteco Xeriffe",
      message: "Festa no Xeriffe para 60 pessoas dia 21/06/2026 as 20h",
      valor_estimado: 8000
    });
    assert.equal(xeriffeFesta.pipeline, "festa_xeriffe");
    assert.match(xeriffeFesta.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);
    const closedXeriffe = await post(`/api/crm/leads/${encodeURIComponent(xeriffeFesta.lead.id)}/mark-won`);
    assert.equal(closedXeriffe.item.status, "fechado");

    const mesaPage = await fetch(`${base}/mesa/insano/4`);
    assert.equal(mesaPage.status, 200);
    const mesaOrder = await post("/api/site/precomanda", {
      nome: "Mesa Quatro",
      whatsapp: "51980000004",
      operation: "Insano",
      mesa: "4",
      items: [{ name: "PanBagnat / Hot dog / Pancho", quantity: 1 }],
      customer: { name: "Mesa Quatro", phone: "51980000004", serviceType: "mesa" }
    });
    const mesaDelivered = await fetch(`${base}/api/precomandas/${encodeURIComponent(mesaOrder.precomanda.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "entregue" })
    }).then((response) => response.json());
    assert.equal(mesaDelivered.item.status, "entregue");

    const cozinha = await fetch(`${base}/cozinha`);
    assert.equal(cozinha.status, 200);
    const resumo = await fetch(`${base}/api/crm/resumo`).then((response) => response.json());
    assert.ok(resumo.comercial);
    assert.ok(resumo.executivo);
    assert.equal(resumo.executivo.hoje.leads >= 3, true);
    assert.equal(resumo.executivo.hoje.pedidos >= 2, true);
    assert.equal(resumo.executivo.hoje.conversoes >= 2, true);
    assert.equal(resumo.executivo.ultimos7Dias.length, 7);
    assert.ok(resumo.executivo.comparativoOperacoes.some((item) => item.operacao === "Insano"));
    assert.ok(resumo.executivo.comparativoOperacoes.some((item) => item.operacao === "Buteco Xeriffe"));
    assert.ok(resumo.comercial.operacaoQueMaisVende);
    assert.equal(resumo.comercial.valorFechado >= 20000, true);
    assert.equal(resumo.comercial.valorEmNegociacao >= 0, true);
    assert.ok(resumo.clientesPorTelefone.some((item) => item.telefone === "51980000001" && item.pedidos >= 1 && item.clienteRecorrente));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("CRM v1.1 saneia pessoas, faltantes, cliente unico e converte lead em evento", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-crm-v11-"));
  try {
    const crm = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551999999999" });

    const eventoAno = await crm.salvarEvento({
      cliente_id: "cli_test",
      message: "quero orcamento para 2026"
    });
    assert.equal(eventoAno.evento.quantidade_pessoas, "");
    assert.ok(eventoAno.evento.dados_faltantes.includes("numero de pessoas"));

    const eventoPessoas = await crm.salvarEvento({
      cliente_id: "cli_test",
      message: "evento em 2026 para 80 pessoas"
    });
    assert.equal(eventoPessoas.evento.quantidade_pessoas, 80);

    const direta = await crm.salvarPrecomanda({
      nome: "Cliente Direto",
      whatsapp: "51911112222",
      operacao: "Buteco Xeriffe"
    });
    assert.ok(direta.precomanda.cliente_id);
    assert.ok(direta.precomanda.atendimento_id);
    assert.equal(direta.precomanda.status, "aguardando_dados");
    assert.ok(direta.precomanda.dados_faltantes.includes("itens"));

    await crm.salvarCliente({ nome: "Cliente Direto 2", whatsapp: "51911112222" });
    const clientes = await crm.listarClientes();
    assert.equal(clientes.items.filter((cliente) => cliente.whatsapp === "51911112222").length, 1);

    const leadIncompleto = await crm.salvarLead({
      nome: "Lead Sem Fone",
      interesse: "outro",
      mensagem_original: "preciso de ajuda"
    });
    assert.equal(leadIncompleto.lead.status, "aguardando_dados");
    assert.ok(leadIncompleto.lead.dados_faltantes.includes("whatsapp"));

    const leadEvento = await crm.salvarLead({
      cliente_id: direta.precomanda.cliente_id,
      nome: "Cliente Evento",
      whatsapp: "51911112222",
      interesse: "food_truck",
      mensagem_original: "food truck para 50 pessoas"
    });
    const converted = await crm.converterLeadEmEvento(leadEvento.lead.id);
    assert.equal(converted.ok, true);
    assert.equal(converted.event.lead_id, leadEvento.lead.id);
    assert.equal(converted.lead.status, "orcamento_solicitado");
    assert.ok(converted.lead.historico.some((item) => item.action === "lead_convertido_evento"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CRM v1.2 calcula maquina comercial, retorno, mensagem, fechamento e reativacao", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-crm-v12-"));
  try {
    const crm = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551999999999" });
    const hot = await crm.salvarLead({
      nome: "Empresa Quente",
      whatsapp: "51922223333",
      interesse: "orcamento",
      pipeline: "orcamento_corporativo",
      data: "2026-07-10",
      local: "Porto Alegre",
      quantidade_pessoas: 80,
      mensagem_original: "confraternizacao da empresa com happy hour"
    });
    assert.equal(hot.lead.leadTemperature, "quente");
    assert.ok(hot.lead.leadScore >= 60);
    assert.match(hot.lead.mensagem_whatsapp_sugerida, /SamBah/);

    const waiting = await crm.salvarLead({
      nome: "Lead Faltante",
      interesse: "food_truck",
      pipeline: "food_truck_evento"
    });
    assert.equal(waiting.lead.status, "aguardando_dados");
    assert.equal(waiting.lead.proximo_passo, "Pedir WhatsApp do cliente");
    assert.ok(waiting.lead.nextFollowUpAt);

    const sent = await crm.atualizarLead(hot.lead.id, { status: "orcamento_enviado" });
    assert.equal(sent.item.status, "orcamento_enviado");
    assert.ok(sent.item.nextFollowUpAt);

    const closed = await crm.atualizarLead(hot.lead.id, { status: "fechado" });
    assert.equal(closed.item.status, "fechado");

    const lost = await crm.salvarLead({
      nome: "Lead Perdido",
      whatsapp: "51944445555",
      interesse: "food_truck",
      status: "perdido",
      motivo_perda: "sem_resposta"
    });
    const resumo = await crm.resumo();
    assert.ok(resumo.reativacao.some((item) => item.id === lost.lead.id));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CRM v1.3 classifica festa no Xeriffe e extrai campos comerciais", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-crm-v13-"));
  try {
    const crm = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551999999999" });

    const festa = await crm.registrarAtendimentoComercial({
      nome: "TESTE COMERCIAL Festa",
      whatsapp: "51977770001",
      message: "Quero fazer meu aniversario no Xeriffe em janeiro, umas 35 pessoas."
    });
    assert.equal(festa.lead.pipeline, "festa_xeriffe");
    assert.equal(festa.lead.interesse, "festa_xeriffe");
    assert.equal(festa.lead.quantidade_pessoas, 35);
    assert.equal(festa.lead.eventDateText, "janeiro");
    assert.ok(festa.lead.dados_faltantes.includes("data exata"));
    assert.ok(festa.lead.dados_faltantes.includes("horario"));
    assert.equal(festa.evento.pipeline, "festa_xeriffe");
    assert.equal(festa.evento.quantidade_pessoas, 35);

    const empresa = await crm.registrarAtendimentoComercial({
      nome: "TESTE COMERCIAL Empresa",
      whatsapp: "51977770002",
      message: "Buenas, quero levar o food truck para uma confraternizacao da empresa dia 20/12/2026 para 80 pessoas no bairro Moinhos de Vento."
    });
    assert.equal(empresa.lead.pipeline, "orcamento_corporativo");
    assert.equal(empresa.lead.quantidade_pessoas, 80);
    assert.equal(empresa.lead.eventDate, "2026-12-20");
    assert.equal(empresa.lead.eventDateText, "20/12/2026");
    assert.equal(empresa.lead.eventLocationText, "Moinhos de Vento");
    assert.notEqual(empresa.lead.quantidade_pessoas, 2026);

    const incompleto = await crm.registrarAtendimentoComercial({
      nome: "TESTE COMERCIAL Incompleto",
      whatsapp: "51977770003",
      message: "Quero orcamento para evento."
    });
    assert.equal(incompleto.lead.status, "aguardando_dados");
    assert.ok(incompleto.lead.dados_faltantes.includes("data do evento"));
    assert.ok(incompleto.lead.dados_faltantes.includes("local"));
    assert.ok(incompleto.lead.dados_faltantes.includes("numero de pessoas"));
    assert.match(incompleto.lead.mensagem_whatsapp_sugerida, /data do evento|local|numero de pessoas/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CRM operacao diaria executa fluxo comercial pelos endpoints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-crm-daily-sales-"));
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({
    queueFile: join(dir, "queue.json"),
    mesaBaseUrl: "http://127.0.0.1:9"
  });
  const eventService = new EventScheduleService({
    leadsFile: join(dir, "event-leads.json"),
    servicesFile: join(dir, "insano-services.json")
  });
  const trackingService = new OrderTrackingService({ filePath: join(dir, "tracking.json") });
  const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551999999999" });
  const server = createApp({ auditService, menuService, draftService, mesaService, eventService, trackingService, crmService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const leadResponse = await fetch(`http://127.0.0.1:${port}/api/leads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "TESTE COMERCIAL FLUXO VENDA",
        whatsapp: "51911110000",
        interesse: "food_truck",
        pipeline: "food_truck_evento",
        data: "2026-12-20",
        local: "Porto Alegre",
        quantidade_pessoas: 80,
        mensagem_original: "TESTE COMERCIAL FLUXO VENDA food truck para 80 pessoas"
      })
    });
    assert.equal(leadResponse.status, 201);
    const created = await leadResponse.json();
    assert.equal(created.lead.pipeline, "food_truck_evento");
    assert.equal(created.lead.leadTemperature, "quente");

    const resumo = await fetch(`http://127.0.0.1:${port}/api/crm/resumo`).then((response) => response.json());
    assert.ok(resumo.dinheiroDoDia.some((lead) => lead.id === created.lead.id));

    const contacted = await fetch(`http://127.0.0.1:${port}/api/crm/leads/${encodeURIComponent(created.lead.id)}/mark-contacted`, {
      method: "POST"
    }).then((response) => response.json());
    assert.equal(contacted.item.status, "em_atendimento");
    assert.ok(contacted.item.historico.some((item) => item.message === "Cliente contatado pelo WhatsApp"));

    const quoteSent = await fetch(`http://127.0.0.1:${port}/api/crm/leads/${encodeURIComponent(created.lead.id)}/mark-quote-sent`, {
      method: "POST"
    }).then((response) => response.json());
    assert.equal(quoteSent.item.status, "orcamento_enviado");
    assert.ok(quoteSent.item.nextFollowUpAt);
    assert.ok(quoteSent.item.historico.some((item) => item.message === "Orcamento enviado"));

    const won = await fetch(`http://127.0.0.1:${port}/api/crm/leads/${encodeURIComponent(created.lead.id)}/mark-won`, {
      method: "POST"
    }).then((response) => response.json());
    assert.equal(won.item.status, "fechado");
    assert.ok(won.item.historico.some((item) => item.message === "Oportunidade marcada como fechada"));

    const lostLead = await fetch(`http://127.0.0.1:${port}/api/leads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "TESTE COMERCIAL PERDA",
        whatsapp: "51922220000",
        interesse: "orcamento",
        pipeline: "food_truck_evento",
        mensagem_original: "TESTE COMERCIAL PERDA"
      })
    }).then((response) => response.json());
    const lost = await fetch(`http://127.0.0.1:${port}/api/crm/leads/${encodeURIComponent(lostLead.lead.id)}/mark-lost`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ motivo_perda: "sem_resposta" })
    }).then((response) => response.json());
    assert.equal(lost.item.status, "perdido");
    assert.equal(lost.item.motivo_perda, "sem_resposta");
    assert.ok(lost.item.historico.some((item) => item.message === "Oportunidade perdida: sem_resposta"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("operacao real multiplataforma cobre Insano, Xeriffe, WhatsApp e pre-comanda", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-multiplataforma-"));
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({
    queueFile: join(dir, "queue.json"),
    mesaBaseUrl: "http://127.0.0.1:9"
  });
  const eventService = new EventScheduleService({
    leadsFile: join(dir, "event-leads.json"),
    servicesFile: join(dir, "insano-services.json")
  });
  const trackingService = new OrderTrackingService({ filePath: join(dir, "tracking.json") });
  const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551980413745" });
  const server = createApp({ auditService, menuService, draftService, mesaService, eventService, trackingService, crmService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const options = await fetch(`http://127.0.0.1:${port}/api/crm/atendimento`, { method: "OPTIONS", headers: { origin: "https://insanofoodtruck.com.br" } });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("access-control-allow-origin"), "https://insanofoodtruck.com.br");
    const apiOptions = await fetch(`http://127.0.0.1:${port}/api/site/lead`, { method: "OPTIONS", headers: { origin: "https://api.insanofoodtruck.com.br" } });
    assert.equal(apiOptions.headers.get("access-control-allow-origin"), "https://api.insanofoodtruck.com.br");
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.service, "sambah");
    assert.equal(health.provider, "meta");
    assert.equal(typeof health.commit, "string");
    assert.equal(typeof health.version, "string");

    const insanoPedido = await fetch(`http://127.0.0.1:${port}/api/crm/atendimento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "TESTE REAL INSANO PEDIDO",
        whatsapp: "51999990001",
        interesse: "pedido",
        pipeline: "pedido_rapido",
        operacao: "Insano",
        message: "Quero 2 espetinhos de carne e uma coca."
      })
    }).then((response) => response.json());
    assert.equal(insanoPedido.ok, true);
    assert.ok(insanoPedido.atendimento.id);
    assert.ok(insanoPedido.precomanda.id);
    assert.equal(insanoPedido.precomanda.pipeline, "pedido_rapido");
    assert.match(insanoPedido.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    const insanoEvento = await fetch(`http://127.0.0.1:${port}/api/crm/atendimento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "TESTE REAL INSANO EVENTO",
        whatsapp: "51999990002",
        message: "Quero food truck para confraternizacao da empresa dia 20/12/2026 para 80 pessoas no bairro Moinhos de Vento."
      })
    }).then((response) => response.json());
    assert.equal(insanoEvento.lead.pipeline, "orcamento_corporativo");
    assert.equal(insanoEvento.lead.leadTemperature, "quente");
    assert.equal(insanoEvento.lead.quantidade_pessoas, 80);
    assert.equal(insanoEvento.lead.eventDate, "2026-12-20");
    assert.equal(insanoEvento.lead.eventLocationText, "Moinhos de Vento");

    const xeriffeFesta = await fetch(`http://127.0.0.1:${port}/api/crm/atendimento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "TESTE REAL XERIFFE FESTA",
        whatsapp: "51999990003",
        message: "Quero fazer meu aniversario no Xeriffe em janeiro, umas 35 pessoas."
      })
    }).then((response) => response.json());
    assert.equal(xeriffeFesta.lead.pipeline, "festa_xeriffe");
    assert.equal(xeriffeFesta.evento.pipeline, "festa_xeriffe");
    assert.equal(xeriffeFesta.lead.quantidade_pessoas, 35);
    assert.equal(xeriffeFesta.lead.eventDateText, "janeiro");
    assert.ok(xeriffeFesta.lead.dados_faltantes.includes("data exata"));
    assert.ok(xeriffeFesta.lead.dados_faltantes.includes("horario"));

    const xeriffePedido = await fetch(`http://127.0.0.1:${port}/api/crm/atendimento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "TESTE REAL XERIFFE PEDIDO",
        whatsapp: "51999990004",
        interesse: "pedido",
        pipeline: "pedido_rapido",
        operacao: "Buteco Xeriffe",
        message: "Quero 1 kachurrasco e 2 espetinhos."
      })
    }).then((response) => response.json());
    assert.equal(xeriffePedido.precomanda.operacao, "Buteco Xeriffe");
    assert.equal(xeriffePedido.precomanda.pipeline, "pedido_rapido");
    assert.match(xeriffePedido.whatsappUrl, /^https:\/\/wa\.me\/5551980413745/);

    const precomanda = await fetch(`http://127.0.0.1:${port}/webhook/site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "teste_real_precomanda_multiplataforma",
        source: "site",
        channel: "sambah",
        operation: "Buteco Xeriffe",
        type: "pre_order",
        customer: {
          name: "TESTE REAL PRECOMANDA",
          phone: "51999990006",
          serviceType: "retirada",
          paymentMethod: "pix"
        },
        items: [
          { name: "Espetinho de Carne", quantity: 2 },
          { name: "Kachurrasco", quantity: 1, note: "sem cebola" },
          { name: "Coca", quantity: 1 }
        ],
        notes: "TESTE REAL PRECOMANDA sem produzir"
      })
    }).then((response) => response.json());
    assert.equal(precomanda.ok, true);
    assert.equal(precomanda.crm.precomandaId, "teste_real_precomanda_multiplataforma");

    const resumo = await fetch(`http://127.0.0.1:${port}/api/crm/resumo`).then((response) => response.json());
    assert.ok(resumo.dinheiroDoDia.some((lead) => lead.nome === "TESTE REAL INSANO EVENTO"));
    assert.ok(resumo.dinheiroDoDia.some((lead) => lead.nome === "TESTE REAL XERIFFE FESTA"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("rotas CRM expÃµem listas e webhook pre_order salva pre-comanda", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-crm-http-"));
  const auditService = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({
    queueFile: join(dir, "queue.json"),
    mesaBaseUrl: "http://127.0.0.1:9"
  });
  const eventService = new EventScheduleService({
    leadsFile: join(dir, "event-leads.json"),
    servicesFile: join(dir, "insano-services.json")
  });
  const trackingService = new OrderTrackingService({ filePath: join(dir, "tracking.json") });
  const crmService = new CrmService({ files: crmFiles(dir), whatsappNumber: "5551999999999" });
  const server = createApp({ auditService, menuService, draftService, mesaService, eventService, trackingService, crmService });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const eventResponse = await fetch(`http://127.0.0.1:${port}/api/crm/atendimento`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: "Cliente Evento",
        whatsapp: "51988887777",
        message: "Quero food truck para confraternizacao de empresa para 80 pessoas mes que vem"
      })
    });
    assert.equal(eventResponse.status, 201);
    const eventBody = await eventResponse.json();
    assert.equal(eventBody.interesse, "festa_confraternizacao");
    assert.ok(eventBody.lead.leadScore >= 60);
    assert.equal(eventBody.lead.leadTemperature, "quente");
    assert.ok(eventBody.lead.mensagem_whatsapp_sugerida);

    const preOrderResponse = await fetch(`http://127.0.0.1:${port}/webhook/site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "sambah_crm_pre_1",
        source: "site",
        channel: "sambah",
        operation: "Buteco Xeriffe",
        type: "pre_order",
        customer: {
          name: "Cliente Pedido",
          phone: "51999999999",
          serviceType: "retirada",
          paymentMethod: "pix"
        },
        items: [{ name: "Espetinho de Carne", quantity: 1, note: "Teste CRM" }],
        notes: "Pedido de teste do CRM"
      })
    });
    assert.equal(preOrderResponse.status, 202);
    const preOrderBody = await preOrderResponse.json();
    assert.equal(preOrderBody.ok, true);
    assert.equal(preOrderBody.crm.precomandaId, "sambah_crm_pre_1");

    for (const path of ["/api/clientes", "/api/leads", "/api/atendimentos", "/api/eventos", "/api/precomandas"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ok, true);
    }

    const eventos = await fetch(`http://127.0.0.1:${port}/api/eventos`).then((response) => response.json());
    const linkedEvent = eventos.items.find((item) => item.lead_id === eventBody.lead.id);
    assert.equal(linkedEvent.whatsapp, "51988887777");

    const precomandas = await fetch(`http://127.0.0.1:${port}/api/precomandas`).then((response) => response.json());
    assert.ok(precomandas.items.some((item) => item.id === "sambah_crm_pre_1"));

    const leadId = eventBody.lead.id;
    const convertResponse = await fetch(`http://127.0.0.1:${port}/api/crm/leads/${encodeURIComponent(leadId)}/convert-event`, {
      method: "POST"
    });
    assert.equal(convertResponse.status, 200);
    const converted = await convertResponse.json();
    assert.equal(converted.ok, true);
    assert.equal(converted.duplicated, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
