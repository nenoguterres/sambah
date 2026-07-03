import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PerolaService,
  buildPerolaCommercialActionFromTiming,
  normalizePerolaCommercialActionForMesa
} from "../src/perolaService.js";
import { createPerolaRoutes } from "../src/perolaRoutes.js";
import { createApp } from "../src/server.js";
import { getSalesReportMock } from "../src/services/salesReportService.js";
import { generateSalesInsights } from "../src/services/insightService.js";
import { generatePostIdeasFromInsights } from "../src/services/postEngineService.js";
import { generateContentFromIdea } from "../src/services/contentGenerationService.js";
import { PerolaPermissionService } from "../src/services/perolaPermissionService.js";

test("modulo Perola expoe tela, assets, resumo JSON e preserva home Portal Insano", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-test-"));
  const perolaService = new PerolaService({ dataDir: dir });
  const server = createApp({
    perolaRouteModule: createPerolaRoutes({ service: perolaService })
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const page = await fetch(`${base}/perola`);
    const pageHtml = await page.text();
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") || "", /text\/html/);
    assert.match(pageHtml, /Perola|Pérola/);
    assert.match(pageHtml, /perola\.css/);
    assert.match(pageHtml, /perola\.js/);
    assert.match(pageHtml, /id="perolaMenuToggle"/);
    assert.match(pageHtml, /id="campaignSearch"/);
    assert.match(pageHtml, /id="campaignPagination"/);
    assert.equal((pageHtml.match(/class="nav-module"/g) || []).length, 7);
    assert.match(pageHtml, /class="ecosystem-card mesa-card" href="#giroBlock"/);
    assert.match(pageHtml, /class="ecosystem-card sambah-card" href="#postComposer"/);
    assert.match(pageHtml, /class="ecosystem-card pay-card" href="#payPerolaBridge"/);
    assert.match(pageHtml, /class="ecosystem-card studio-card" href="#postEngineBlock"/);

    const css = await fetch(`${base}/perola.css`);
    const cssText = await css.text();
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type") || "", /text\/css/);
    assert.match(cssText, /\.perola-shell|:root/);

    const js = await fetch(`${base}/perola.js`);
    const jsText = await js.text();
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type") || "", /application\/javascript/);
    assert.match(jsText, /\/api\/perola/);
    assert.match(jsText, /\/api\/perola\/operational-status/);
    assert.match(jsText, /activateWorkspaceView/);
    assert.match(jsText, /paginateActiveCollections/);
    assert.match(jsText, /campaignPage/);
    assert.doesNotMatch(jsText, /setInterval\(loadPerola/);

    const health = await fetch(`${base}/api/perola/health`);
    const healthJson = await health.json();
    assert.equal(health.status, 200);
    assert.match(health.headers.get("content-type") || "", /application\/json/);
    assert.deepEqual(healthJson, {
      status: "ok",
      service: "perola",
      storage: "json",
      backups: "enabled"
    });

    const diagnostics = await fetch(`${base}/api/perola/diagnostics`);
    const diagnosticsJson = await diagnostics.json();
    assert.equal(diagnostics.status, 200);
    assert.match(diagnostics.headers.get("content-type") || "", /application\/json/);
    assert.equal(diagnosticsJson.status, "ok");
    assert.equal(diagnosticsJson.storage, "json");
    assert.equal(diagnosticsJson.backups, "enabled");
    assert.equal(typeof diagnosticsJson.posts, "number");
    assert.equal(typeof diagnosticsJson.rules, "number");
    assert.equal(typeof diagnosticsJson.alerts, "number");
    assert.equal(typeof diagnosticsJson.audit, "number");

    const operationalStatus = await fetch(`${base}/api/perola/operational-status`);
    const operationalStatusJson = await operationalStatus.json();
    assert.equal(operationalStatus.status, 200);
    assert.equal(operationalStatusJson.mode, "Simulado");
    assert.equal(operationalStatusJson.dataSource, "JSON teste");
    assert.match(operationalStatusJson.publication, /Manual|Automatica|Desativada/);
    assert.equal(operationalStatusJson.mesaIntegration.realTime, false);

    const summary = await fetch(`${base}/api/perola`);
    const summaryJson = await summary.json();
    assert.equal(summary.status, 200);
    assert.match(summary.headers.get("content-type") || "", /application\/json/);
    assert.equal(summaryJson.ok, true);
    assert.equal(summaryJson.module, "perola");

    const home = await fetch(`${base}/`);
    const homeHtml = await home.text();
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type") || "", /text\/html/);
    assert.match(homeHtml, /Portal Insano|portalApp/);
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("Perola habilita Instagram real quando publisher esta configurado", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-instagram-"));
  const published = [];
  const publisher = {
    account: "insanooriginal",
    userId: "17841449809570375",
    accessToken: "token-test",
    isEnabled() {
      return true;
    },
    async publish(post) {
      published.push(post);
      return {
        provider: "instagram",
        account: "insanooriginal",
        creationId: "creation-1",
        mediaId: "media-1",
        permalink: "https://instagram.com/p/teste",
        mediaType: "IMAGE",
        timestamp: "2026-06-20T12:00:00.000Z"
      };
    }
  };
  try {
    const service = new PerolaService({ dataDir: dir, publisher });
    const summary = await service.summary();
    assert.equal(summary.socialNetworksConnected, true);
    assert.equal(summary.instagram.mode, "real");
    assert.equal(summary.instagram.account, "insanooriginal");

    const channels = await service.listChannels();
    assert.equal(channels.items.find((item) => item.id === "instagram-feed").mode, "real");
    assert.equal(channels.items.find((item) => item.id === "instagram-reels").mode, "real");
    assert.equal(channels.items.find((item) => item.id === "tiktok").mode, "simulated");

    const created = await service.createPost({
      title: "Teste Instagram",
      caption: "Legenda pronta",
      networks: ["instagram"],
      mediaUrl: "https://cdn.insano.test/post.jpg",
      mediaType: "IMAGE"
    });
    const result = await service.publishPost(created.post.id, { source: "human" });
    assert.equal(result.ok, true);
    assert.equal(result.post.publishProvider, "instagram");
    assert.equal(result.post.instagramAccount, "insanooriginal");
    assert.equal(result.post.instagramPermalink, "https://instagram.com/p/teste");
    assert.equal(published.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Motor de Posts gera insights avancados, scores e conteudo local", () => {
  const report = getSalesReportMock();
  const insights = generateSalesInsights(report);
  const ideas = generatePostIdeasFromInsights(insights);
  const content = generateContentFromIdea(ideas[0]);

  assert.ok(report.productsSold.length >= 5);
  assert.ok(insights.insights.length >= 6);
  assert.ok(insights.growingProduct);
  assert.ok(insights.decliningProduct);
  assert.ok(insights.promotionOpportunity);
  assert.ok(ideas.length >= 6);
  assert.ok(ideas.every((idea) => Number.isFinite(idea.score)));
  assert.ok(content.title);
  assert.ok(content.mainText);
  assert.ok(content.cta);
  assert.ok(content.hashtags.length >= 1);
});

test("drafts do Motor de Posts suportam CRUD, aprovacao, rejeicao e calendario", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-platform-"));
  const service = new PerolaService({ dataDir: dir, now: () => new Date("2026-06-17T12:00:00.000Z") });
  try {
    const created = await service.createPostEngineDraft({
      type: "produto_campeao",
      title: "Campeao local",
      description: "Texto interno",
      score: 90
    });
    assert.equal(created.draft.status, "draft");
    assert.ok(created.draft.cta);

    const review = await service.updatePostEngineDraft(created.draft.id, { status: "pending_review", title: "Campeao revisado" });
    assert.equal(review.draft.status, "pending_review");
    assert.equal(review.draft.title, "Campeao revisado");

    const approved = await service.updatePostEngineDraft(created.draft.id, { status: "approved" });
    assert.equal(approved.draft.status, "approved");

    const scheduled = await service.updatePostEngineDraft(created.draft.id, {
      status: "scheduled",
      scheduledAt: "2026-06-17T14:00:00.000Z"
    });
    assert.equal(scheduled.draft.status, "scheduled");

    const rejectedDraft = await service.createPostEngineDraft({
      type: "urgencia",
      title: "Teste rejeicao",
      description: "Nao publicar"
    });
    await service.updatePostEngineDraft(rejectedDraft.draft.id, { status: "pending_review" });
    const rejected = await service.updatePostEngineDraft(rejectedDraft.draft.id, { status: "rejected" });
    assert.equal(rejected.draft.status, "rejected");

    const calendar = await service.postEngineCalendar();
    assert.equal(calendar.total, 1);
    assert.equal(calendar.items[0].calendarStatus, "scheduled");

    const audit = await service.listAudit({ limit: 50 });
    for (const event of ["perola_post_draft_created", "perola_post_draft_updated", "perola_post_approved", "perola_post_rejected", "perola_post_scheduled"]) {
      assert.ok(audit.items.some((item) => item.type === event), `evento ausente: ${event}`);
    }

    const removed = await service.deletePostEngineDraft(rejectedDraft.draft.id);
    assert.equal(removed.success, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("APIs da Content Platform expoem drafts, calendario, estatisticas e Giro Inteligente", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-api-"));
  const service = new PerolaService({ dataDir: dir });
  const server = createApp({ perolaRouteModule: createPerolaRoutes({ service }) });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const preview = await jsonRequest(base, "/api/perola/post-engine/preview");
    assert.equal(preview.status, 200);
    assert.ok(preview.json.data.postIdeas.length >= 6);

    const created = await jsonRequest(base, "/api/perola/post-engine/drafts", {
      method: "POST",
      body: { idea: preview.json.data.postIdeas[0] },
      role: "ADMIN"
    });
    assert.equal(created.status, 201);

    const review = await jsonRequest(base, `/api/perola/post-engine/drafts/${created.json.draft.id}`, {
      method: "PATCH",
      body: { status: "pending_review", body: "Conteudo revisado" },
      role: "ADMIN"
    });
    assert.equal(review.status, 200);

    const patched = await jsonRequest(base, `/api/perola/post-engine/drafts/${created.json.draft.id}`, {
      method: "PATCH",
      body: { status: "approved" },
      role: "ADMIN"
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.draft.status, "approved");

    const scheduled = await jsonRequest(base, `/api/perola/post-engine/drafts/${created.json.draft.id}`, {
      method: "PATCH",
      body: { status: "scheduled", scheduledAt: new Date(Date.now() + 3600000).toISOString() },
      role: "ADMIN"
    });
    assert.equal(scheduled.json.draft.status, "scheduled");

    const calendar = await jsonRequest(base, "/api/perola/post-engine/calendar");
    assert.equal(calendar.status, 200);
    assert.equal(calendar.json.total, 1);

    const stats = await jsonRequest(base, "/api/perola/post-engine/stats");
    assert.equal(stats.status, 200);
    assert.ok(stats.json.ideasGenerated >= 6);

    const giro = await jsonRequest(base, "/api/perola/giro/intelligent", { method: "POST", body: {}, role: "ADMIN" });
    assert.equal(giro.status, 201);
    assert.equal(giro.json.draft.status, "draft");
    assert.deepEqual(giro.json.flow, ["relatorio", "insights", "ideias", "draft", "aprovacao", "agendamento"]);

    const page = await fetch(`${base}/perola`);
    const html = await page.text();
    assert.match(html, /Motor de Posts Inteligente/);
    assert.match(html, /Drafts do Motor de Posts/);
    assert.match(html, /Calendário de publicação/);
    assert.match(html, /Giro Inteligente/);
    assert.match(html, /data-perola-tab="campaigns"/);
    assert.match(html, /<h2>Campanhas<\/h2>/);
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("permissoes locais bloqueiam aprovacao e registram a negativa na auditoria", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-permissions-"));
  const service = new PerolaService({ dataDir: dir });
  const server = createApp({ perolaRouteModule: createPerolaRoutes({ service }) });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const permissions = await jsonRequest(base, "/api/perola/permissions", { role: "AUDITOR" });
    assert.equal(permissions.status, 200);
    assert.equal(permissions.json.matrix.AUDITOR.draft_approve, false);
    assert.equal(permissions.json.matrix.ADMIN.draft_schedule, true);

    const created = await jsonRequest(base, "/api/perola/post-engine/drafts", {
      method: "POST",
      role: "ADMIN",
      body: { idea: { type: "produto_campeao", title: "Draft protegido" } }
    });
    await jsonRequest(base, `/api/perola/post-engine/drafts/${created.json.draft.id}`, {
      method: "PATCH",
      role: "ADMIN",
      body: { status: "pending_review" }
    });

    const denied = await jsonRequest(base, `/api/perola/post-engine/drafts/${created.json.draft.id}`, {
      method: "PATCH",
      role: "ATENDENTE",
      body: { status: "approved" }
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.error, "permission_denied");

    const audit = await service.listAudit({ limit: 50 });
    const event = audit.items.find((item) => item.type === "perola_permission_denied");
    assert.equal(event.context.role, "ATENDENTE");
    assert.equal(event.context.action, "draft_approve");
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("persistencia de drafts serializa concorrencia e recupera JSON corrompido", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-storage-"));
  try {
    const service = new PerolaService({ dataDir: dir });
    await Promise.all(Array.from({ length: 20 }, (_, index) => service.createPostEngineDraft({
      type: "promocao",
      title: `Draft concorrente ${index}`,
      description: "Teste local"
    })));
    const drafts = await service.listPostEngineDrafts();
    assert.equal(drafts.total, 20);

    await service.createPostEngineDraft({ type: "urgencia", title: "Gera backup valido" });
    const filePath = join(dir, "perola-post-drafts.json");
    await writeFile(filePath, "{json interrompido", "utf8");

    const recovered = new PerolaService({ dataDir: dir });
    const recoveredDrafts = await recovered.listPostEngineDrafts();
    assert.equal(recoveredDrafts.total, 20);
    const recoveredPayload = await readFile(filePath, "utf8");
    assert.doesNotThrow(() => JSON.parse(recoveredPayload));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("matriz de permissao do Perola mantem perfis e acoes isolados", () => {
  const permissions = new PerolaPermissionService();
  assert.equal(permissions.can("ADMIN", "draft_schedule"), true);
  assert.equal(permissions.can("OPERADOR", "draft_schedule"), false);
  assert.equal(permissions.can("ATENDENTE", "draft_approve"), false);
  assert.equal(permissions.can("AUDITOR", "draft_create"), false);
  assert.equal(permissions.can("ADMIN", "campaign_delete"), true);
  assert.equal(permissions.can("ATENDENTE", "campaign_delete"), false);
});

test("campanhas suportam CRUD, persistencia local e validacao de periodo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-campaigns-"));
  try {
    const service = new PerolaService({ dataDir: dir, now: () => new Date("2026-06-17T12:00:00.000Z") });
    const created = await service.createCampaign({
      id: "festival-inverno",
      title: "Festival de inverno",
      description: "Campanha local",
      objective: "Aumentar vendas no jantar",
      status: "draft",
      priority: "high",
      startDate: "2026-06-20",
      endDate: "2026-06-30"
    }, { actorRole: "ADMIN" });
    assert.equal(created.campaign.id, "festival-inverno");
    assert.equal(created.campaign.priority, "high");

    const persisted = JSON.parse(await readFile(join(dir, "perola-campaigns.json"), "utf8"));
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].objective, "Aumentar vendas no jantar");

    const updated = await service.updateCampaign(created.campaign.id, {
      status: "active",
      priority: "urgent"
    }, { actorRole: "OPERADOR" });
    assert.equal(updated.campaign.status, "active");
    assert.equal(updated.campaign.priority, "urgent");

    const invalid = await service.updateCampaign(created.campaign.id, {
      startDate: "2026-07-10",
      endDate: "2026-07-01"
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.error, "invalid_campaign_period");

    const audit = await service.listAudit({ limit: 20 });
    assert.ok(audit.items.some((item) => item.type === "perola_campaign_created"));
    assert.ok(audit.items.some((item) => item.type === "perola_campaign_updated"));

    const deleted = await service.deleteCampaign(created.campaign.id, { actorRole: "ADMIN" });
    assert.equal(deleted.success, true);
    assert.equal((await service.listCampaigns()).total, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("campanha com midia cria publicacao vinculada para Instagram", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-campaign-media-"));
  try {
    const service = new PerolaService({ dataDir: dir, now: () => new Date("2026-06-20T12:00:00.000Z") });
    const created = await service.createCampaign({
      id: "campanha-com-midia",
      title: "Campanha com midia",
      objective: "Validar fluxo direto",
      mediaUrl: "https://cdn.insano.test/campanha.jpg",
      mediaType: "IMAGE",
      caption: "Legenda da campanha pronta"
    }, { actorRole: "ADMIN" });
    assert.equal(created.campaign.mediaUrl, "https://cdn.insano.test/campanha.jpg");
    assert.equal(created.campaign.caption, "Legenda da campanha pronta");

    const publication = await service.createCampaignPublication(created.campaign.id, {}, { actorRole: "ADMIN" });
    assert.equal(publication.success, true);
    assert.equal(publication.post.campaignId, "campanha-com-midia");
    assert.equal(publication.post.mediaUrl, "https://cdn.insano.test/campanha.jpg");
    assert.equal(publication.post.mediaType, "IMAGE");
    assert.deepEqual(publication.post.networks, ["instagram"]);

    const posts = await service.listPosts({ channel: "instagram" });
    assert.equal(posts.items.some((post) => post.id === publication.post.id), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("API cria publicacao a partir da campanha com midia", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-campaign-media-api-"));
  const service = new PerolaService({ dataDir: dir });
  const server = createApp({ perolaRouteModule: createPerolaRoutes({ service }) });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await jsonRequest(base, "/api/perola/campaigns", {
      method: "POST",
      role: "ADMIN",
      body: {
        id: "campanha-api-midia",
        title: "Campanha API Midia",
        mediaUrl: "https://cdn.insano.test/api.jpg",
        mediaType: "IMAGE",
        caption: "Legenda API"
      }
    });
    assert.equal(created.status, 201);

    const publication = await jsonRequest(base, "/api/perola/campaigns/campanha-api-midia/publication", {
      method: "POST",
      role: "ADMIN",
      body: {}
    });
    assert.equal(publication.status, 201);
    assert.equal(publication.json.post.campaignId, "campanha-api-midia");
    assert.equal(publication.json.post.mediaUrl, "https://cdn.insano.test/api.jpg");
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("campanha aprovada do Perola normaliza payload e alimenta receptor do Mesa", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-mesa-bridge-"));
  try {
    const service = new PerolaService({ dataDir: dir, now: () => new Date("2026-06-17T12:00:00.000Z") });
    const created = await service.createCampaign({
      id: "happy-hour-baixo-movimento",
      title: "Happy Hour da Tarde",
      description: "Acao comercial para baixo movimento.",
      productName: "Combo da tarde",
      funnelStage: "converter",
      objective: "Aumentar giro entre 15h e 18h",
      readyMaterial: {
        postText: "Combo da tarde pronto para chamar pedido no horario de menor movimento."
      },
      startDate: "2026-06-20",
      endDate: "2026-06-21"
    }, { actorRole: "ADMIN" });
    const approved = await service.approveCampaign(created.campaign.id, { actorRole: "ADMIN" });

    const normalized = normalizePerolaCommercialActionForMesa(approved.campaign);
    assert.deepEqual(normalized, {
      id: "happy-hour-baixo-movimento",
      origin: "perola",
      type: "converter",
      status: "approved",
      title: "Happy Hour da Tarde",
      description: "Combo da tarde pronto para chamar pedido no horario de menor movimento.",
      productId: "combo-da-tarde",
      productName: "Combo da tarde",
      product: {
        id: "combo-da-tarde",
        name: "Combo da tarde"
      },
      channels: ["Cardapio do Mesa", "Telas do Mesa", "SamBah"],
      startsAt: "2026-06-20",
      endsAt: "2026-06-21"
    });

    const distributed = await service.distributeApprovedCampaign(created.campaign.id, {}, { actorRole: "ADMIN" });
    assert.equal(distributed.success, true);
    assert.equal(distributed.distribution.mesaReceiver.status, "ready_for_mesa_receiver");

    const pending = await service.pendingMesaInteractions();
    assert.equal(pending.total, 1);
    assert.equal(pending.items[0].payload.source, "perola");
    assert.equal(pending.items[0].payload.actionId, "happy-hour-baixo-movimento");
    assert.equal(pending.items[0].payload.actionType, "converter");
    assert.equal(pending.items[0].payload.title, "Happy Hour da Tarde");
    assert.equal(pending.items[0].payload.description, "Combo da tarde pronto para chamar pedido no horario de menor movimento.");
    assert.equal(pending.items[0].payload.startsAt, "2026-06-20");
    assert.equal(pending.items[0].payload.endsAt, "2026-06-21");
    assert.equal(pending.items[0].payload.mesaStatus, "waiting_mesa_ack");
    assert.equal(pending.items[0].payload.requiresCashierOk, true);
    assert.equal(pending.items[0].payload.useMesaRules, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Perola cria acao comercial em memoria a partir do Timing Demografico completo", () => {
  const action = buildPerolaCommercialActionFromTiming(demographicTimingInput());

  assert.equal(action.origin, "perola");
  assert.equal(action.sourceStrategy, "demographic_timing");
  assert.equal(action.status, "pending_admin_approval");
  assert.equal(action.requiresAdminApproval, true);
  assert.deepEqual(action.timingWindow, {
    start: "15:00",
    end: "18:00"
  });
  assert.equal(action.targetDemographic, "clientes_tarde");
  assert.equal(action.productFocus, "Espetinho de Frango");
  assert.deepEqual(Object.keys(action.modulePayloads), ["mesa", "sambah", "sambahPay", "perola"]);
  assert.equal(action.modulePayloads.mesa.mesaStatus, "waiting_mesa_ack");
  assert.equal(action.modulePayloads.sambah.sambahStatus, "waiting_crm_action");
  assert.equal(action.modulePayloads.sambahPay.payStatus, "waiting_commercial_rule");
  assert.equal(action.modulePayloads.perola.perolaStatus, "ready_to_create_campaign");
});

test("Perola cria acao incompleta quando falta fonte do Timing Demografico", () => {
  const { sambah, ...withoutSambah } = demographicTimingInput();
  const action = buildPerolaCommercialActionFromTiming(withoutSambah);

  assert.equal(action.status, "incomplete_context");
  assert.notEqual(action.status, "pending_admin_approval");
  assert.deepEqual(action.missingSources, ["sambah"]);
});

test("campanhas geram insight comercial somente acima de 5 drafts aprovados", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-campaign-insight-"));
  try {
    const service = new PerolaService({ dataDir: dir });
    await service.createCampaign({ id: "campanha-6", title: "Campanha com seis" });
    await service.createCampaign({ id: "campanha-5", title: "Campanha com cinco" });
    await service.createCampaign({ id: "campanha-1", title: "Campanha com um" });
    await service.createCampaign({ id: "campanha-0", title: "Campanha sem drafts" });

    for (let index = 0; index < 6; index += 1) {
      const draft = await service.createPostEngineDraft({
        type: "produto_campeao",
        title: `Aprovado seis ${index}`,
        campaignId: "campanha-6"
      });
      await service.updatePostEngineDraft(draft.draft.id, { status: "pending_review" });
      await service.updatePostEngineDraft(draft.draft.id, { status: "approved" });
    }

    for (let index = 0; index < 2; index += 1) {
      const draft = await service.createPostEngineDraft({
        type: "campanha_dia_forte",
        title: `Agendado seis ${index}`,
        campaignId: "campanha-6"
      });
      await service.updatePostEngineDraft(draft.draft.id, { status: "pending_review" });
      await service.updatePostEngineDraft(draft.draft.id, { status: "approved" });
      await service.updatePostEngineDraft(draft.draft.id, {
        status: "scheduled",
        scheduledAt: `2026-06-2${index}T18:00:00.000Z`
      });
    }

    for (let index = 0; index < 2; index += 1) {
      await service.createPostEngineDraft({
        type: "urgencia",
        title: `Rascunho seis ${index}`,
        campaignId: "campanha-6"
      });
    }

    for (let index = 0; index < 5; index += 1) {
      const draft = await service.createPostEngineDraft({
        type: "produto_campeao",
        title: `Aprovado cinco ${index}`,
        campaignId: "campanha-5"
      });
      await service.updatePostEngineDraft(draft.draft.id, { status: "pending_review" });
      await service.updatePostEngineDraft(draft.draft.id, { status: "approved" });
    }

    const smallDraft = await service.createPostEngineDraft({
      type: "produto_campeao",
      title: "Aprovado um",
      campaignId: "campanha-1"
    });
    await service.updatePostEngineDraft(smallDraft.draft.id, { status: "pending_review" });
    await service.updatePostEngineDraft(smallDraft.draft.id, { status: "approved" });

    const workhubTasks = [];
    service.workhubService = {
      async listTasks() {
        return { ok: true, total: workhubTasks.length, items: structuredClone(workhubTasks) };
      },
      async createTask(input) {
        const task = {
          id: `workhub-${workhubTasks.length + 1}`,
          ...input,
          status: input.status || "pending",
          createdAt: "2026-06-19T00:00:00.000Z",
          updatedAt: "2026-06-19T00:00:00.000Z"
        };
        workhubTasks.unshift(task);
        return structuredClone(task);
      }
    };

    const campaigns = await service.listCampaigns();
    const campaignWithSix = campaigns.items.find((campaign) => campaign.id === "campanha-6");
    const campaignWithFive = campaigns.items.find((campaign) => campaign.id === "campanha-5");
    const campaignWithOne = campaigns.items.find((campaign) => campaign.id === "campanha-1");
    const campaignWithoutDrafts = campaigns.items.find((campaign) => campaign.id === "campanha-0");

    assert.equal(campaignWithSix.draftsTotal, 10);
    assert.equal(campaignWithSix.draftsApproved, 6);
    assert.equal(campaignWithSix.draftsScheduled, 2);
    assert.equal(campaignWithSix.campaignScore, 1062);
    assert.equal(campaignWithSix.campaignRank, 1);
    assert.equal(campaignWithSix.commercialInsight.type, "high_activity");
    assert.equal(campaignWithSix.commercialInsight.message, "Alta atividade: campanha com mais de 5 drafts aprovados. Avaliar reforço de publicação, impulsionamento ou reaproveitamento de conteúdo.");
    assert.equal(campaignWithFive.draftsApproved, 5);
    assert.equal(campaignWithFive.campaignScore, 550);
    assert.equal(campaignWithFive.campaignRank, 2);
    assert.equal(campaignWithFive.commercialInsight, null);
    assert.equal(campaignWithOne.campaignScore, 110);
    assert.equal(campaignWithOne.campaignRank, 3);
    assert.equal(campaignWithoutDrafts.draftsTotal, 0);
    assert.equal(campaignWithoutDrafts.campaignScore, 0);
    assert.equal(campaignWithoutDrafts.campaignRank, 4);
    assert.deepEqual(campaigns.items.map((campaign) => campaign.id), ["campanha-6", "campanha-5", "campanha-1", "campanha-0"]);

    const persisted = JSON.parse(await readFile(join(dir, "perola-campaigns.json"), "utf8"));
    assert.equal(persisted.some((campaign) => Object.hasOwn(campaign, "commercialInsight")), false);
    assert.equal(persisted.some((campaign) => Object.hasOwn(campaign, "campaignScore")), false);
    assert.equal(persisted.some((campaign) => Object.hasOwn(campaign, "campaignRank")), false);

    assert.equal(workhubTasks.length, 1);
    assert.equal(workhubTasks[0].sourceModule, "perola");
    assert.equal(workhubTasks[0].targetModule, "workhub");
    assert.equal(workhubTasks[0].status, "pending");
    assert.equal(workhubTasks[0].priority, "high");
    assert.equal(workhubTasks[0].title, "Insight de alta atividade");
    assert.match(workhubTasks[0].description, /tipo: insight_comercial/);
    assert.match(workhubTasks[0].description, /campanha: campanha-6/);

    await service.listCampaigns();
    assert.equal(workhubTasks.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("APIs de campanhas respeitam permissoes e retornam JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-perola-campaign-api-"));
  const service = new PerolaService({ dataDir: dir });
  const server = createApp({ perolaRouteModule: createPerolaRoutes({ service }) });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await jsonRequest(base, "/api/perola/campaigns", {
      method: "POST",
      role: "ADMIN",
      body: { title: "Campanha API", objective: "Conversao", priority: "medium" }
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.campaign.status, "draft");

    const listed = await jsonRequest(base, "/api/perola/campaigns");
    assert.equal(listed.status, 200);
    assert.equal(listed.json.total, 1);

    const updated = await jsonRequest(base, `/api/perola/campaigns/${created.json.campaign.id}`, {
      method: "PATCH",
      role: "OPERADOR",
      body: { status: "active" }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.campaign.status, "active");

    const denied = await jsonRequest(base, `/api/perola/campaigns/${created.json.campaign.id}`, {
      method: "DELETE",
      role: "ATENDENTE"
    });
    assert.equal(denied.status, 403);

    const deleted = await jsonRequest(base, `/api/perola/campaigns/${created.json.campaign.id}`, {
      method: "DELETE",
      role: "ADMIN"
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.json.success, true);
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

function demographicTimingInput() {
  return {
    mesa: {
      signalType: "low_traffic_period",
      period: {
        start: "15:00",
        end: "18:00"
      },
      summary: "Baixo movimento no periodo da tarde"
    },
    sambahPay: {
      productFocus: "Espetinho de Frango",
      stockToday: 20,
      soldToday: 1,
      projectedStockTomorrow: 39,
      paymentTrend: "pix"
    },
    sambah: {
      targetDemographic: "clientes_tarde",
      customerSegment: "clientes que costumam responder promocoes no WhatsApp",
      preferredChannel: "whatsapp"
    },
    perola: {
      actionType: "happy_hour",
      campaignIntent: "girar produto em horario fraco",
      tone: "gaucho_colloquial"
    }
  };
}

async function jsonRequest(base, path, { method = "GET", body, role } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(role ? { "x-sambah-role": role } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, json: await response.json() };
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
