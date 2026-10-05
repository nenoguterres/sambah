import { generateClaudeCampaignVariations } from "./services/contentGenerationService.js";
import { generatePerolaPosts } from "./services/perolaPostEngine.js";
import { PerolaPermissionService, permissionActionForDraftPatch } from "./services/perolaPermissionService.js";
import {
  buildPerolaStudioOverview,
  createPerolaStudioDraft,
  listPerolaBrandProfiles,
  upsertPerolaBrandProfile
} from "./services/perolaStudioService.js";
import {
  getPerolaEcosystemSignals,
  getPerolaHumanApprovalById,
  getPerolaHumanApprovalQueue,
  registerPerolaHumanDecision
} from "./perolaService.js";

export function createPerolaRoutes({ service, permissionService = new PerolaPermissionService() }) {
  async function requirePermission(req, res, action, context = {}) {
    const authorization = permissionService.authorize(req.headers["x-sambah-role"], action);
    if (authorization.ok) return authorization;
    await service.recordAudit("perola_permission_denied", "Acao bloqueada por permissao local", {
      source: "perola-permissions",
      role: authorization.role,
      action,
      path: req.url,
      ...context
    });
    sendJson(res, authorization.statusCode, { success: false, ...authorization });
    return null;
  }

  return {
    async handle(req, res, url) {
      if (!url.pathname.startsWith("/api/perola")) return false;

      try {
        if (req.method === "GET" && url.pathname === "/api/perola/health") {
          return sendJson(res, 200, {
            status: "ok",
            service: "perola",
            storage: "json",
            backups: "enabled"
          });
        }

        if (req.method === "GET" && url.pathname === "/api/perola/diagnostics") {
          const summary = await service.summary();
          return sendJson(res, 200, {
            status: "ok",
            posts: summary.totals.posts,
            rules: summary.totals.rules,
            alerts: summary.totals.alerts,
            audit: summary.totals.audit,
            storage: "json",
            backups: "enabled"
          });
        }

        if (req.method === "GET" && url.pathname === "/api/perola/operational-status") {
          return sendJson(res, 200, await service.operationalStatus());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/permissions") {
          return sendJson(res, 200, permissionService.matrix());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/studio/overview") {
          const signals = await getPerolaEcosystemSignals({ dataDir: service.dataDir });
          return sendJson(res, 200, await buildPerolaStudioOverview({ service, signals }));
        }

        if (req.method === "GET" && url.pathname === "/api/perola/studio/brands") {
          return sendJson(res, 200, await listPerolaBrandProfiles({ dataDir: service.dataDir }));
        }

        const studioBrandMatch = url.pathname.match(/^\/api\/perola\/studio\/brands\/([^/]+)$/);
        if ((req.method === "PUT" || req.method === "PATCH") && studioBrandMatch) {
          const brandId = decodeURIComponent(studioBrandMatch[1]);
          const authorization = await requirePermission(req, res, "campaign_update", { brandId });
          if (!authorization) return true;
          const result = await upsertPerolaBrandProfile({
            dataDir: service.dataDir,
            id: brandId,
            input: await readJson(req, { requireBody: true })
          });
          if (result.success) {
            await service.recordAudit("perola_studio_brand_saved", "Memoria de marca atualizada no Perola Studio", {
              source: "perola-studio",
              brandId,
              actorRole: authorization.role
            });
          }
          return sendJson(res, result.statusCode || 200, result);
        }

        if (req.method === "POST" && url.pathname === "/api/perola/studio/content-pack") {
          const authorization = await requirePermission(req, res, "draft_create");
          if (!authorization) return true;
          const result = await createPerolaStudioDraft({
            service,
            input: await readJson(req, { requireBody: true }),
            actorRole: authorization.role
          });
          if (result.success) {
            await service.recordAudit("perola_studio_content_pack_created", "Pacote multiformato criado no Perola Studio", {
              source: "perola-studio",
              draftId: result.draft?.id || "",
              campaignId: result.contentPack?.campaignId || "",
              brandId: result.contentPack?.brand?.id || "",
              actorRole: authorization.role
            });
          }
          return sendJson(res, result.statusCode || 201, result);
        }

        if (req.method === "GET" && url.pathname === "/api/perola/radar/signals") {
          try {
            return sendJson(res, 200, {
              success: true,
              signals: await getPerolaEcosystemSignals({ dataDir: service.dataDir })
            });
          } catch {
            return sendJson(res, 500, {
              success: false,
              message: "Erro ao carregar sinais do Radar Insano"
            });
          }
        }

        if (req.method === "GET" && url.pathname === "/api/perola/claude/variations") {
          return sendJson(res, 200, generateClaudeCampaignVariations());
        }

        if (req.method === "POST" && url.pathname === "/api/perola/claude/variations") {
          const body = await readJson(req, { requireBody: false });
          return sendJson(res, 200, generateClaudeCampaignVariations(body));
        }

        if (req.method === "GET" && url.pathname === "/api/perola/post-engine/preview") {
          return sendJson(res, 200, service.generatePostEnginePreview
            ? await service.generatePostEnginePreview()
            : { success: true, data: generatePerolaPosts() });
        }

        if (req.method === "GET" && url.pathname === "/api/perola/post-engine/drafts") {
          return sendJson(res, 200, await service.listPostEngineDrafts());
        }

        if (req.method === "POST" && url.pathname === "/api/perola/post-engine/drafts") {
          const authorization = await requirePermission(req, res, "draft_create");
          if (!authorization) return true;
          const body = await readJson(req, { requireBody: true });
          const validation = validatePostEngineDraftRequest(body);
          if (!validation.ok) return sendJson(res, 400, validation);
          const result = await service.createPostEngineDraft(body.idea, { actorRole: authorization.role });
          return sendJson(res, result.statusCode || 201, result);
        }

        const postEngineDraftMatch = url.pathname.match(/^\/api\/perola\/post-engine\/drafts\/([^/]+)$/);
        if (req.method === "PATCH" && postEngineDraftMatch) {
          const body = await readJson(req, { requireBody: true });
          const action = permissionActionForDraftPatch(body);
          const authorization = await requirePermission(req, res, action, { draftId: decodeURIComponent(postEngineDraftMatch[1]) });
          if (!authorization) return true;
          const result = await service.updatePostEngineDraft(
            decodeURIComponent(postEngineDraftMatch[1]),
            body,
            { actorRole: authorization.role }
          );
          return sendJson(res, result.statusCode || 200, result);
        }

        if (req.method === "DELETE" && postEngineDraftMatch) {
          const authorization = await requirePermission(req, res, "draft_delete", { draftId: decodeURIComponent(postEngineDraftMatch[1]) });
          if (!authorization) return true;
          const result = await service.deletePostEngineDraft(decodeURIComponent(postEngineDraftMatch[1]), { actorRole: authorization.role });
          return sendJson(res, result.statusCode || 200, result);
        }

        if (req.method === "GET" && url.pathname === "/api/perola/post-engine/calendar") {
          return sendJson(res, 200, await service.postEngineCalendar());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/post-engine/stats") {
          return sendJson(res, 200, await service.postEngineStats());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/campaigns") {
          return sendJson(res, 200, await service.listCampaigns());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/channels") {
          return sendJson(res, 200, await service.listChannels());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/human-approval/queue") {
          const items = await getPerolaHumanApprovalQueue({ dataDir: service.dataDir });
          return sendJson(res, 200, { success: true, total: items.length, items });
        }

        const humanApprovalMatch = url.pathname.match(/^\/api\/perola\/human-approval\/queue\/([^/]+)$/);
        if (req.method === "GET" && humanApprovalMatch) {
          const item = await getPerolaHumanApprovalById(decodeURIComponent(humanApprovalMatch[1]), { dataDir: service.dataDir });
          if (!item) return sendJson(res, 404, { success: false, message: "Item nao encontrado." });
          return sendJson(res, 200, { success: true, item });
        }

        const humanApprovalDecisionMatch = url.pathname.match(/^\/api\/perola\/human-approval\/queue\/([^/]+)\/decision$/);
        if (req.method === "POST" && humanApprovalDecisionMatch) {
          const body = await readJson(req, { requireBody: true });
          const decision = String(body.decision || "").trim();
          const acceptedDecisions = new Set(["approved", "edit_requested", "rejected", "details_requested"]);
          if (!acceptedDecisions.has(decision)) {
            return sendJson(res, 400, { success: false, message: "Decisao invalida." });
          }
          const item = await registerPerolaHumanDecision(
            decodeURIComponent(humanApprovalDecisionMatch[1]),
            decision,
            body.responseText || null,
            { dataDir: service.dataDir }
          );
          if (!item) return sendJson(res, 404, { success: false, message: "Item nao encontrado." });
          return sendJson(res, 200, { success: true, item });
        }

        if (req.method === "GET" && url.pathname === "/api/perola/mesa/interactions/pending") {
          return sendJson(res, 200, await service.pendingMesaInteractions({ limit: url.searchParams.get("limit") }));
        }

        const channelMatch = url.pathname.match(/^\/api\/perola\/channels\/([^/]+)$/);
        if (req.method === "PATCH" && channelMatch) {
          const channelId = decodeURIComponent(channelMatch[1]);
          const authorization = await requirePermission(req, res, "campaign_update", { channelId });
          if (!authorization) return true;
          const result = await service.updateChannel(
            channelId,
            await readJson(req, { requireBody: true }),
            { actorRole: authorization.role }
          );
          return sendJson(res, result.statusCode || 200, result);
        }

        if (req.method === "POST" && url.pathname === "/api/perola/campaigns") {
          const authorization = await requirePermission(req, res, "campaign_create");
          if (!authorization) return true;
          const result = await service.createCampaign(
            await readJson(req, { requireBody: true }),
            { actorRole: authorization.role }
          );
          return sendJson(res, result.statusCode || 201, result);
        }

        const campaignFromSignalMatch = url.pathname.match(/^\/api\/perola\/campaigns\/from-signal\/([^/]+)$/);
        if (req.method === "POST" && campaignFromSignalMatch) {
          const result = await service.generateCampaignFromSignal(decodeURIComponent(campaignFromSignalMatch[1]));
          if (!result.success) return sendJson(res, result.statusCode || 400, result);
          return sendJson(res, 201, { success: true, campaign: result.campaign });
        }

        const campaignApproveMatch = url.pathname.match(/^\/api\/perola\/campaigns\/([^/]+)\/approve$/);
        if (req.method === "PATCH" && campaignApproveMatch) {
          const campaignId = decodeURIComponent(campaignApproveMatch[1]);
          const authorization = await requirePermission(req, res, "campaign_update", { campaignId });
          if (!authorization) return true;
          const result = await service.approveCampaign(campaignId, { actorRole: authorization.role });
          return sendJson(res, result.statusCode || 200, result);
        }

        const campaignRejectMatch = url.pathname.match(/^\/api\/perola\/campaigns\/([^/]+)\/reject$/);
        if (req.method === "PATCH" && campaignRejectMatch) {
          const campaignId = decodeURIComponent(campaignRejectMatch[1]);
          const authorization = await requirePermission(req, res, "campaign_update", { campaignId });
          if (!authorization) return true;
          const result = await service.rejectCampaign(
            campaignId,
            await readJson(req),
            { actorRole: authorization.role }
          );
          return sendJson(res, result.statusCode || 200, result);
        }

        const campaignDistributeMatch = url.pathname.match(/^\/api\/perola\/campaigns\/([^/]+)\/distribute$/);
        if (req.method === "POST" && campaignDistributeMatch) {
          const campaignId = decodeURIComponent(campaignDistributeMatch[1]);
          const authorization = await requirePermission(req, res, "campaign_update", { campaignId });
          if (!authorization) return true;
          const result = await service.distributeApprovedCampaign(
            campaignId,
            await readJson(req),
            { actorRole: authorization.role }
          );
          if (!result.success) {
            const statusCode = result.error === "campaign_not_approved" ? 400 : (result.statusCode || 400);
            return sendJson(res, statusCode, result);
          }
          return sendJson(res, 201, { success: true, distribution: result.distribution });
        }

        const campaignPublicationMatch = url.pathname.match(/^\/api\/perola\/campaigns\/([^/]+)\/publication$/);
        if (req.method === "POST" && campaignPublicationMatch) {
          const campaignId = decodeURIComponent(campaignPublicationMatch[1]);
          const authorization = await requirePermission(req, res, "campaign_create", { campaignId });
          if (!authorization) return true;
          const result = await service.createCampaignPublication(
            campaignId,
            await readJson(req, { requireBody: false }),
            { actorRole: authorization.role }
          );
          return sendJson(res, result.statusCode || 201, result);
        }

        const campaignMatch = url.pathname.match(/^\/api\/perola\/campaigns\/([^/]+)$/);
        if (req.method === "PATCH" && campaignMatch) {
          const authorization = await requirePermission(req, res, "campaign_update", { campaignId: decodeURIComponent(campaignMatch[1]) });
          if (!authorization) return true;
          const result = await service.updateCampaign(
            decodeURIComponent(campaignMatch[1]),
            await readJson(req, { requireBody: true }),
            { actorRole: authorization.role }
          );
          return sendJson(res, result.statusCode || 200, result);
        }

        if (req.method === "DELETE" && campaignMatch) {
          const authorization = await requirePermission(req, res, "campaign_delete", { campaignId: decodeURIComponent(campaignMatch[1]) });
          if (!authorization) return true;
          const result = await service.deleteCampaign(
            decodeURIComponent(campaignMatch[1]),
            { actorRole: authorization.role }
          );
          return sendJson(res, result.statusCode || 200, result);
        }

        if (req.method === "POST" && url.pathname === "/api/perola/giro/intelligent") {
          const authorization = await requirePermission(req, res, "giro_intelligent_run");
          if (!authorization) return true;
          return sendJson(res, 201, await service.runIntelligentGiro({ actorRole: authorization.role }));
        }

        if (req.method === "GET" && url.pathname === "/api/perola") {
          return sendJson(res, 200, await service.summary());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/posts") {
          return sendJson(res, 200, await service.listPosts({
            status: url.searchParams.get("status") || "",
            channel: url.searchParams.get("channel") || ""
          }));
        }

        if (req.method === "POST" && url.pathname === "/api/perola/posts") {
          const result = await service.createPost(await readJson(req, { requireBody: true }));
          return sendJson(res, result.statusCode || 201, result);
        }

        const postMatch = url.pathname.match(/^\/api\/perola\/posts\/([^/]+)$/);
        if (req.method === "PATCH" && postMatch) {
          const result = await service.updatePost(
            decodeURIComponent(postMatch[1]),
            await readJson(req, { requireBody: true })
          );
          return sendJson(res, result.statusCode || 200, result);
        }

        const postStatusMatch = url.pathname.match(/^\/api\/perola\/posts\/([^/]+)\/status$/);
        if (req.method === "PATCH" && postStatusMatch) {
          const body = await readJson(req, { requireBody: true });
          const result = await service.updatePostStatus(decodeURIComponent(postStatusMatch[1]), body.status);
          return sendJson(res, result.statusCode || 200, result);
        }

        const postApprovalMatch = url.pathname.match(/^\/api\/perola\/posts\/([^/]+)\/approval$/);
        if (req.method === "PATCH" && postApprovalMatch) {
          const body = await readJson(req, { requireBody: true });
          const result = await service.approvePost(decodeURIComponent(postApprovalMatch[1]), body.approved);
          return sendJson(res, result.statusCode || 200, result);
        }

        const postPublishMatch = url.pathname.match(/^\/api\/perola\/posts\/([^/]+)\/publish$/);
        if (req.method === "POST" && postPublishMatch) {
          const body = await readJson(req, { requireBody: false });
          const result = await service.publishPost(decodeURIComponent(postPublishMatch[1]), { source: body.source || "human" });
          return sendJson(res, result.statusCode || 200, result);
        }

        if (req.method === "GET" && url.pathname === "/api/perola/alerts") {
          return sendJson(res, 200, await service.alerts());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/giro") {
          return sendJson(res, 200, await service.giroPreview());
        }

        if (req.method === "POST" && url.pathname === "/api/perola/giro/run") {
          return sendJson(res, 200, await service.runGiro());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/giro/report") {
          return sendJson(res, 200, await service.listMesaDailyReport());
        }

        if ((req.method === "POST" || req.method === "PUT") && url.pathname === "/api/perola/giro/report") {
          const result = await service.upsertMesaDailyReport(await readJson(req, { requireBody: true }));
          return sendJson(res, 200, result);
        }

        if (req.method === "GET" && url.pathname === "/api/perola/rules") {
          return sendJson(res, 200, await service.listRules());
        }

        const ruleMatch = url.pathname.match(/^\/api\/perola\/rules\/([^/]+)$/);
        if (req.method === "PATCH" && ruleMatch) {
          const result = await service.updateRule(decodeURIComponent(ruleMatch[1]), await readJson(req, { requireBody: true }));
          return sendJson(res, result.statusCode || 200, result);
        }

        if ((req.method === "POST" || req.method === "PUT") && url.pathname === "/api/perola/rules") {
          const result = await service.upsertRule(await readJson(req, { requireBody: true }));
          return sendJson(res, 200, result);
        }

        if (req.method === "GET" && url.pathname === "/api/perola/sales-daily") {
          return sendJson(res, 200, await service.listSalesDaily());
        }

        if ((req.method === "POST" || req.method === "PUT") && url.pathname === "/api/perola/sales-daily") {
          const result = await service.upsertSalesDaily(await readJson(req, { requireBody: true }));
          return sendJson(res, 200, result);
        }

        if (req.method === "GET" && url.pathname === "/api/perola/history") {
          return sendJson(res, 200, await service.campaignHistory());
        }

        if (req.method === "GET" && url.pathname === "/api/perola/audit") {
          return sendJson(res, 200, await service.listAudit({ limit: url.searchParams.get("limit") }));
        }

        return sendJson(res, 404, { ok: false, error: "perola_route_not_found" });
      } catch (error) {
        if (error.statusCode) {
          return sendJson(res, error.statusCode, { ok: false, error: error.code || "perola_request_error", message: error.message });
        }
        console.error("[perola]", error);
        return sendJson(res, 500, { ok: false, error: "perola_internal_error" });
      }
    }
  };
}

async function readJson(req, { requireBody = false } = {}) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    if (!requireBody) return {};
    const error = new Error("Body JSON vazio");
    error.statusCode = 400;
    error.code = "empty_body";
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    const error = new Error("JSON invalido");
    error.statusCode = 400;
    error.code = "invalid_json";
    error.cause = cause;
    throw error;
  }
}

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function validatePostEngineDraftRequest(body = {}) {
  if (!body.idea || typeof body.idea !== "object") {
    return { ok: false, success: false, error: "idea_required", message: "Ideia obrigatoria." };
  }
  if (!body.idea.type) {
    return { ok: false, success: false, error: "idea_type_required", message: "Tipo da ideia obrigatorio." };
  }
  if (!body.idea.title) {
    return { ok: false, success: false, error: "idea_title_required", message: "Titulo da ideia obrigatorio." };
  }
  return { ok: true };
}
