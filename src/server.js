Warning: truncated output (original token count: 44828)
Total output lines: 4111

import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AuditService, maskSensitive } from "./auditService.js";
import { CallCenterService } from "./callCenterService.js";
import { CrmService } from "./crmService.js";
import { EventScheduleService } from "./eventScheduleService.js";
import { EventEmailAlertService } from "./eventEmailAlertService.js";
import { InsanoCatalogService } from "./insanoCatalogService.js";
import { InsanoWorkhubController } from "./insanoWorkhubController.js";
import { InsanoWorkhubService } from "./insanoWorkhubService.js";
import { buildMesaOrder, MesaIntegrationService } from "./mesaIntegrationService.js";
import { MenuSyncService } from "./menuSyncService.js";
import { XeriffePublicMenuService } from "./xeriffePublicMenuService.js";
import { OrderDraftService } from "./orderDraftService.js";
import { OrderTrackingService } from "./orderTrackingService.js";
import { PerolaService } from "./perolaService.js";
import { createPerolaRoutes } from "./perolaRoutes.js";
import { PayPerolaBridgeService } from "./payPerolaBridgeService.js";
import { SambahPerolaBridgeService } from "./sambahPerolaBridgeService.js";
import { SambahConversationService } from "./sambahConversationService.js";
import { WhatsAppConversationService } from "./whatsappConversationService.js";
import { getPublicConfig, getRuntimeConfig, isAllowedCorsOrigin } from "./config.js";
import { createSambahPayModule } from "./sambahPay/index.js";
import { PayPerolaBridgeController } from "./sambahPay/controllers/payPerolaBridgeController.js";
import { SambahAuthService } from "./auth/authService.js";
import { createWhatsAppProvider } from "./whatsapp/whatsappProvider.js";
import { WhatsAppMessageService } from "./whatsapp/whatsappMessageService.js";
import { whatsappMaintenanceHandler } from "./whatsapp/whatsappMaintenanceHandler.js";
import { FileWhatsAppV2ConversationRepository } from "./whatsapp/v2/inMemoryRepositories.js";
import { InstagramPublisher } from "./services/instagramPublisher.js";
import { AiMetricsService } from "./ai/aiMetricsService.js";
import { AiAuditService } from "./ai/aiAuditService.js";
import { AiPerformanceService } from "./ai/aiPerformanceService.js";
import { AiConversionService } from "./ai/aiConversionService.js";
import { getFormDefinition, listFormDefinitions } from "./forms/formRepository.js";
import { resetTestHistoryOnce } from "./testHistoryMaintenanceService.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const runtimeConfig = getRuntimeConfig();
const WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;
const dataFile = (name) => join(runtimeConfig.dataDir, name);
const audit = new AuditService({ filePath: dataFile("audit-logs.json") });
const mesa = new MesaIntegrationService({ queueFile: dataFile("mesa-queue.json") });
const menu = new MenuSyncService({ cacheFile: dataFile("menu-cache.json") });
const xeriffePublicMenu = new XeriffePublicMenuService({
  menuService: menu,
  mesaService: mesa,
  sessionsFile: dataFile("xeriffe-public-sessions.json"),
  whatsappNumber: runtimeConfig.whatsappNumber
});
const conversation = new SambahConversationService({ scriptsFile: dataFile("sambah-scripts.json") });
const whatsappConversations = new WhatsAppConversationService({
  filePath: dataFile("whatsapp-conversas.json"),
  messagesFile: dataFile("whatsapp-messages.json")
});
const drafts = new OrderDraftService({ draftsFile: dataFile("order-drafts.json"), rulesFile: dataFile("sambah-menu-rules.json") });
const events = new EventScheduleService({ leadsFile: dataFile("event-leads.json"), servicesFile: dataFile("insano-services.json") });
const eventEmailAlerts = new EventEmailAlertService({ filePath: dataFile("event-email-alerts.json") });
const insanoCatalog = new InsanoCatalogService({ filePath: dataFile("insano-catalog.json") });
const tracking = new OrderTrackingService({ filePath: dataFile("order-tracking.json") });
const callCenter = new CallCenterService({
  operatorsFile: dataFile("call-center-operators.json"),
  alertsFile: dataFile("call-center-alerts.json"),
  subscriptionsFile: dataFile("call-center-push-subscriptions.json"),
  alertUrl: `${runtimeConfig.publicBaseUrl || runtimeConfig.baseUrl || "https://api.insanofoodtruck.com.br"}/conversas`
});
const insanoWorkhub = new InsanoWorkhubService({ dataFile: dataFile("insano-workhub.json") });
const insanoWorkhubController = new InsanoWorkhubController({ workhubService: insanoWorkhub });
const instagramPublisher = new InstagramPublisher(runtimeConfig.perolaInstagram);
const perola = new PerolaService({ dataDir: runtimeConfig.dataDir, workhubService: insanoWorkhub, publisher: instagramPublisher });
const perolaRoutes = createPerolaRoutes({ service: perola });
const sambahPay = createSambahPayModule({ dataDir: runtimeConfig.dataDir, auditService: audit });
const payPerolaBridge = new PayPerolaBridgeService({
  dataDir: runtimeConfig.dataDir,
  eventBus: sambahPay.services.eventBusService,
  workhubService: insanoWorkhub
});
const payPerolaBridgeController = new PayPerolaBridgeController({ payPerolaBridgeService: payPerolaBridge });
const sambahPerolaBridge = new SambahPerolaBridgeService({ dataDir: runtimeConfig.dataDir, workhubService: insanoWorkhub });
const auth = new SambahAuthService({ usersFile: dataFile("auth-users.json") });
const whatsappProvider = createWhatsAppProvider({ config: runtimeConfig.whatsappBusiness });
const whatsappMessages = new WhatsAppMessageService({
  provider: whatsappProvider,
  sessionsFile: dataFile("whatsapp-sessions.json"),
  messagesFile: dataFile("whatsapp-messages.json")
});
const aiMetrics = new AiMetricsService({ filePath: dataFile("controlled-ai-metrics.json") });
const aiAudit = new AiAuditService({ filePath: dataFile("controlled-ai-audit.json") });
const aiPerformance = new AiPerformanceService({ filePath: dataFile("controlled-ai-performance.json") });
const aiConversion = new AiConversionService({ filePath: dataFile("controlled-ai-conversion.json") });
const crm = new CrmService({
  files: {
    clientes: dataFile("clientes.json"),
    leads: dataFile("leads.json"),
    atendimentos: dataFile("atendimentos.json"),
    eventos: dataFile("eventos.json"),
    precomandas: dataFile("precomandas.json")
  },
  whatsappNumber: runtimeConfig.whatsappNumber
});

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

export function createApp({
  auditService = audit,
  mesaService = mesa,
  menuService = menu,
  xeriffePublicMenuService = xeriffePublicMenu,
  conversationService = conversation,
  whatsappConversationService = whatsappConversations,
  draftService = drafts,
  eventService = events,
  eventEmailAlertService = eventEmailAlerts,
  insanoCatalogService = insanoCatalog,
  trackingService = tracking,
  perolaRouteModule = perolaRoutes,
  workhubController = insanoWorkhubController,
  payPerolaController = payPerolaBridgeController,
  crmService = crm,
  sambahPayModule = sambahPay,
  authService = auth,
  whatsappMessageService = whatsappMessages,
  callCenterService = callCenter,
  aiMetricsService = aiMetrics,
  aiAuditService = aiAudit,
  aiPerformanceService = aiPerformance,
  aiConversionService = aiConversion,
  whatsappProvider: appWhatsappProvider = whatsappProvider,
  whatsappV2ConversationRepository = null,
  runtimeConfig: appRuntimeConfig = null,
  whatsappSendFetch = globalThis.fetch,
  authMode = globalThis.process?.env?.SAMBAH_AUTH_MODE || "session"
} = {}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const activeAuthMode = authMode === "mock" ? "mock" : "session";
      req.sambahAuthMode = activeAuthMode;
      req.sambahUser = activeAuthMode === "session" ? authService.currentUser(req) : null;

      const requestCorsHeaders = corsHeaders(req.headers.origin);
      for (const [header, value] of Object.entries(requestCorsHeaders)) {
        res.setHeader(header, value);
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, requestCorsHeaders);
        return res.end();
      }

      if (req.method === "GET" && url.pathname === "/login") {
        return serveStatic(res, "login.html");
      }

      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJson(req, { requireBody: true });
        const result = await authService.login(body);
        if (!result.ok) {
          await safeAuditRecord(auditService, {
            type: "sambah_login_failed",
            status: "warning",
            source: "auth",
            message: "Login interno recusado",
            context: { username: safeAuditUsername(body.username), action: "login", path: url.pathname, method: req.method, reason: result.error }
          });
          return sendJson(res, result.statusCode || 401, { ok: false, error: result.error, message: result.message });
        }
        await safeAuditRecord(auditService, {
          type: "sambah_login_success",
          status: "info",
          source: "auth",
          message: "Login interno realizado",
          context: { username: result.user.username, role: result.user.role, action: "login", path: url.pathname, method: req.method }
        });
        res.setHeader("Set-Cookie", result.cookie);
        return sendJson(res, 200, { ok: true, user: result.user, redirectTo: "/admin" });
      }

      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        const user = req.sambahUser;
        const result = authService.logout(req);
        if (user) {
          await safeAuditRecord(auditService, {
            type: "sambah_logout",
            status: "info",
            source: "auth",
            message: "Logout interno realizado",
            context: { username: user.username, role: user.role, action: "logout", path: url.pathname, method: req.method }
          });
        }
        res.setHeader("Set-Cookie", result.cookie);
        return sendJson(res, 200, { ok: true, redirectTo: "/login" });
      }

      if (req.method === "GET" && url.pathname === "/api/auth/me") {
        if (activeAuthMode === "mock") return sendJson(res, 200, { ok: true, mode: "mock", user: null });
        if (!req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        return sendJson(res, 200, { ok: true, mode: "session", user: req.sambahUser });
      }

      if (req.method === "GET" && url.pathname === "/api/auth/users") {
        if (activeAuthMode === "session" && !req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        const users = await authService.listUsers();
        return sendJson(res, 200, {
          ok: true,
          mode: activeAuthMode,
          total: users.length,
          users
        });
      }

      if (req.method === "POST" && url.pathname === "/api/auth/users") {
        const adminCheck = requireAdminUser(req, activeAuthMode);
        if (!adminCheck.ok) return sendJson(res, adminCheck.statusCode, { ok: false, error: adminCheck.error });
        const result = await authService.createUser(await readJson(req, { requireBody: true }));
        if (!result.ok) return sendJson(res, result.statusCode || 400, result);
        await safeAuditRecord(auditService, {
          type: "sambah_user_created",
          status: "info",
          source: "auth",
          message: "Usuario interno criado",
          context: {
            username: req.sambahUser?.username || "mock",
            role: req.sambahUser?.role || "ADMIN",
            action: "create_user",
            path: url.pathname,
            method: req.method,
            targetUsername: result.user.username,
            targetRole: result.user.role
          }
        });
        return sendJson(res, 201, result);
      }

      const authUserMatch = url.pathname.match(/^\/api\/auth\/users\/([^/]+)$/);
      if (req.method === "PATCH" && authUserMatch) {
        const adminCheck = requireAdminUser(req, activeAuthMode);
        if (!adminCheck.ok) return sendJson(res, adminCheck.statusCode, { ok: false, error: adminCheck.error });
        const username = decodeURIComponent(authUserMatch[1]);
        const result = await authService.updateUser(username, await readJson(req, { requireBody: true }));
        if (!result.ok) return sendJson(res, result.statusCode || 400, result);
        await safeAuditRecord(auditService, {
          type: "sambah_user_updated",
          status: "info",
          source: "auth",
          message: "Usuario interno atualizado",
          context: {
            username: req.sambahUser?.username || "mock",
            role: req.sambahUser?.role || "ADMIN",
            action: "update_user",
            path: url.pathname,
            method: req.method,
            targetUsername: result.user.username,
            targetRole: result.user.role
          }
        });
        return sendJson(res, 200, result);
      }

      const authUserPasswordMatch = url.pathname.match(/^\/api\/auth\/users\/([^/]+)\/password$/);
      if (req.method === "POST" && authUserPasswordMatch) {
        const adminCheck = requireAdminUser(req, activeAuthMode);
        if (!adminCheck.ok) return sendJson(res, adminCheck.statusCode, { ok: false, error: adminCheck.error });
        const username = decodeURIComponent(authUserPasswordMatch[1]);
        const result = await authService.changePassword(username, await readJson(req, { requireBody: true }));
        if (!result.ok) return sendJson(res, result.statusCode || 400, result);
        await safeAuditRecord(auditService, {
          type: "sambah_user_password_changed",
          status: "warning",
          source: "auth",
          message: "Senha de usuario interno alterada",
          context: {
            username: req.sambahUser?.username || "mock",
            role: req.sambahUser?.role || "ADMIN",
            action: "change_user_credential",
            path: url.pathname,
            method: req.method,
            targetUsername: result.user.username,
            targetRole: result.user.role
          }
        });
        return sendJson(res, 200, result);
      }

      const authUserStatusMatch = url.pathname.match(/^\/api\/auth\/users\/([^/]+)\/status$/);
      if (req.method === "POST" && authUserStatusMatch) {
        const adminCheck = requireAdminUser(req, activeAuthMode);
        if (!adminCheck.ok) return sendJson(res, adminCheck.statusCode, { ok: false, error: adminCheck.error });
        const username = decodeURIComponent(authUserStatusMatch[1]);
        const body = await readJson(req, { requireBody: true });
        const result = await authService.setUserActive(username, body.active);
        if (!result.ok) return sendJson(res, result.statusCode || 400, result);
        await safeAuditRecord(auditService, {
          type: "sambah_user_status_changed",
          status: "warning",
          source: "auth",
          message: "Status de usuario interno alterado",
          context: {
            username: req.sambahUser?.username || "mock",
            role: req.sambahUser?.role || "ADMIN",
            action: result.user.active ? "activate_user" : "deactivate_user",
            path: url.pathname,
            method: req.method,
            reason: result.user.active ? "usuario ativado" : "usuario desativado",
            targetUsername: result.user.username,
            targetRole: result.user.role
          }
        });
        return sendJson(res, 200, result);
      }

      if (url.pathname.startsWith("/api/perola")) {
        const handled = await perolaRouteModule.handle(req, res, url);
        if (handled) return;
      }

      if (req.method === "POST" && url.pathname === "/api/insano-workhub/tasks") {
        return sendJson(res, 201, { ok: true, task: await workhubController.createTask(await readJson(req, { requireBody: true })) });
      }

      if (req.method === "GET" && url.pathname === "/api/insano-workhub/tasks") {
        return sendJson(res, 200, await workhubController.listTasks({
          sourceModule: url.searchParams.get("sourceModule") || url.searchParams.get("source"),
          targetModule: url.searchParams.get("targetModule"),
          status: url.searchParams.get("status"),
          limit: url.searchParams.get("limit")
        }));
      }

      if (req.method === "GET" && url.pathname === "/api/insano-workhub/summary") {
        return sendJson(res, 200, await workhubController.summary());
      }

      const workhubTaskMatch = url.pathname.match(/^\/api\/insano-workhub\/tasks\/([^/]+)$/);
      if (req.method === "PATCH" && workhubTaskMatch) {
        const task = await workhubController.updateTask(
          decodeURIComponent(workhubTaskMatch[1]),
          await readJson(req, { requireBody: true })
        );
        return sendJson(res, 200, { ok: true, task });
      }

      if (req.method === "POST" && url.pathname === "/api/sambah-perola/signals") {
        return sendJson(res, 201, { ok: true, signal: await sambahPerolaBridge.registrarSinalSambah(await readJson(req, { requireBody: true })) });
      }

      if (req.method === "GET" && url.pathname === "/api/sambah-perola/signals") {
        const items = await sambahPerolaBridge.listarSinais();
        return sendJson(res, 200, { ok: true, total: items.length, items });
      }

      if (req.method === "POST" && url.pathname === "/api/sambah-perola/suggestions") {
        return sendJson(res, 201, { ok: true, suggestion: await sambahPerolaBridge.registrarSugestaoPerola(await readJson(req, { requireBody: true })) });
      }

      if (req.method === "GET" && url.pathname === "/api/sambah-perola/suggestions") {
        const items = await sambahPerolaBridge.listarSugestoes();
        return sendJson(res, 200, { ok: true, total: items.length, items });
      }

      if (req.method === "POST" && url.pathname === "/api/pay-perola/signals") {
        const body = await readJson(req, { requireBody: true });
        return sendJson(res, 201, await payPerolaController.registrarSinal(body));
      }

      if (req.method === "GET" && url.pathname === "/api/pay-perola/signals") {
        return sendJson(res, 200, await payPerolaController.listarSinais());
      }

      if (req.method === "POST" && url.pathname === "/api/pay-perola/suggestions") {
        const body = await readJson(req, { requireBody: true });
        return sendJson(res, 201, await payPerolaController.registrarSugestao(body));
      }

      if (req.method === "GET" && url.pathname === "/api/pay-perola/suggestions") {
        return sendJson(res, 200, await payPerolaController.listarSugestoes());
      }

      if (
        url.pathname.startsWith("/api/sambah-pay")
        || url.pathname.startsWith("/api/sambah-voice")
        || url.pathname.startsWith("/api/sambah-events")
        || url.pathname.startsWith("/api/sambah-observability")
        || url.pathname.startsWith("/api/sambah-security")
        || url.pathname.startsWith("/api/sambah-lgpd")
        || url.pathname.startsWith("/api/sambah-crm")
        || url.pathname.startsWith("/api/sambah-memory")
        || url.pathname.startsWith("/api/sambah-whatsapp")
        || url.pathname.startsWith("/api/sambah-handoff")
        || url.pathname.startsWith("/api/sambah-channel")
        || url.pathname.startsWith("/api/sambah-meta")
        || url.pathname.startsWith("/api/sambah-meta-whatsapp")
        || url.pathname.startsWith("/api/sambah-database")
        || url.pathname.startsWith("/api/sambah-messaging")
      ) {
        const handled = await sambahPayModule.handle(req, res, url);
        if (handled) return;
      }

      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, {
          ok: true,
          service: "sambah",
          provider: runtimeConfig.whatsappBusiness.provider,
          commit: buildCommitVersion(),
          version: buildAppVersion()
        });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/storage-status") {
        return sendJson(res, 200, await buildStorageStatus(crmService));
      }

      if (req.method === "GET" && url.pathname === "/api/admin/auditoria") {
        if (activeAuthMode === "session" && !req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 100);
        const logs = await auditService.listLogs({ limit });
        const items = logs.items
          .slice()
          .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""))
          .map(publicAuditEvent);
        return sendJson(res, 200, {
          ok: true,
          total: logs.total,
          limit,
          items
        });
      }

      if (req.method === "GET" && url.pathname === "/api/sambah-ai/metrics") {
        return sendJson(res, 200, await aiMetricsService.summary());
      }

      if (req.method === "GET" && url.pathname === "/api/sambah-ai/audit") {
        return sendJson(res, 200, await aiAuditService.list({
          limit: Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200)
        }));
      }

      if (req.method === "GET" && url.pathname === "/api/sambah-ai/performance") {
        return sendJson(res, 200, await aiPerformanceService.summary());
      }

      if (req.method === "GET" && url.pathname === "/api/sambah-ai/conversion") {
        return sendJson(res, 200, await aiConversionService.summary());
      }

      if (req.method === "GET" && url.pathname === "/api/config") {
        return sendJson(res, 200, getPublicConfig());
      }

      if (req.method === "GET" && url.pathname === "/") {
        return serveStatic(res, "portal.html");
      }

      if (req.method === "GET" && url.pathname === "/portal-xeriffe.html") {
        return serveStatic(res, "portal-xeriffe.html");
      }

      if (req.method === "GET" && ["/xeriffe/cardapio", "/xeriffe/cardapio/"].includes(url.pathname)) {
        return serveStatic(res, "xeriffe-cardapio.html");
      }

      if (req.method === "GET" && url.pathname === "/api/xeriffe/cardapio/catalogo") {
        return sendJson(res, 200, await xeriffePublicMenuService.catalog());
      }

      if (req.method === "POST" && url.pathname === "/api/mesa/cardapio") {
        const authorization = verifyMesaCatalogAuthorization(req, menuService.config?.apiToken || "");
        if (!authorization.ok) {
          return sendJson(res, authorization.statusCode, { ok: false, error: authorization.error });
        }
        const body = await readJson(req, { requireBody: true });
        try {
          const result = await menuService.publishFromMesa(body);
          await safeAuditRecord(auditService, {
            type: "xeriffe_catalog_published_from_mesa",
            status: "success",
            source: "mesa-do-xeriffe",
            message: "Cardapio publico do Xeriffe atualizado pelo Mesa",
            context: { totalItems: result.items.length, updatedAt: result.updatedAt }
          });
          return sendJson(res, 200, {
            ok: true,
            source: result.source,
            totalItems: result.items.length,
            updatedAt: result.updatedAt
          });
        } catch (error) {
          return sendJson(res, error.statusCode || 400, {
            ok: false,
            error: error.code || "mesa_catalog_invalid",
            message: error.message
          });
        }
      }

      if (url.pathname.startsWith("/api/xeriffe/cardapio/comanda")) {
        try {
          const session = await resolveXeriffePublicSession(req, res, xeriffePublicMenuService);
          if (req.method === "GET" && url.pathname === "/api/xeriffe/cardapio/comanda") {
            return sendJson(res, 200, await xeriffePublicMenuService.cart(session.id));
          }
          if (req.headers["x-xeriffe-cart"] !== "1") {
            return sendJson(res, 403, { ok: false, error: "cart_request_required" });
          }
          if (req.method === "POST" && url.pathname === "/api/xeriffe/cardapio/comanda/itens") {
            const body = await readJson(req, { requireBody: true });
            return sendJson(res, 201, await xeriffePublicMenuService.addItem(session.id, body));
          }
          const itemMatch = url.pathname.match(/^\/api\/xeriffe\/cardapio\/comanda\/itens\/([^/]+)$/);
          if (req.method === "PATCH" && itemMatch) {
            const body = await readJson(req, { requireBody: true });
            return sendJson(res, 200, await xeriffePublicMenuService.updateItem(session.id, decodeURIComponent(itemMatch[1]), body));
          }
          if (req.method === "DELETE" && itemMatch) {
            return sendJson(res, 200, await xeriffePublicMenuService.removeItem(session.id, decodeURIComponent(itemMatch[1])));
          }
          if (req.method === "POST" && url.pathname === "/api/xeriffe/cardapio/comanda/finalizar") {
            const body = await readJson(req, { requireBody: true });
            return sendJson(res, 202, await xeriffePublicMenuService.finalize(session.id, body.customer || body));
          }
          return sendJson(res, 404, { ok: false, error: "not_found" });
        } catch (error) {
          if (error.statusCode) {
            return sendJson(res, error.statusCode, { ok: false, error: error.code || "public_menu_error", message: error.message });
          }
          throw error;
        }
      }

      if (req.method === "GET" && ["/pedir", "/eventos", "/empresas", "/xeriffe", "/whatsapp", "/atendimento"].includes(url.pathname)) {
        return serveStatic(res, "portal.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah") {
        return serveStatic(res, "site.html");
      }

      if (req.method === "GET" && url.pathname === "/insano-workhub") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "insano-workhub.html");
      }

      if (req.method === "GET" && url.pathname === "/perola") {
        return serveStatic(res, "perola.html");
      }

      if (req.method === "GET" && url.pathname === "/oportunidades") {
        return serveStatic(res, "oportunidades.html");
      }

      if (req.method === "GET" && url.pathname === "/conversas") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "conversas.html");
      }

      if (req.method === "GET" && url.pathname === "/admin") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "admin.html");
      }

      if (req.method === "GET" && url.pathname === "/admin/permissoes") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "admin-permissoes.html");
      }

      if (req.method === "GET" && url.pathname === "/admin/usuarios") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "admin-usuarios.html");
      }

      if (req.method === "GET" && url.pathname === "/admin/auditoria") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "admin-auditoria.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-voice-pay") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "voice-pay.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-central") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-central.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-pay") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-pay.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-autoserve") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-autoserve.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-devices") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-devices.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-locker") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-locker.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-weight") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-weight.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-events") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-events.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-observability") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-observability.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-ai") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-ai.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-ai-performance") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-ai-performance.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-security") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-security.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-lgpd") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-lgpd.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-crm") {
        return serveStatic(res, "sambah-crm.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-handoff") {
        return serveStatic(res, "sambah-handoff.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-database") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-database.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah-messaging") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "sambah-messaging.html");
      }

      if (req.method === "GET" && url.pathname === "/admin/insano-catalogo") {
        if (activeAuthMode === "session" && !req.sambahUser) return redirectToLogin(res, url.pathname);
        return serveStatic(res, "insano-catalog-admin.html");
      }

      if (req.method === "GET" && ["/crm", "/clientes", "/leads", "/atendimentos", "/eventos", "/precomandas"].includes(url.pathname)) {
        return serveStatic(res, "crm.html");
      }

      if (req.method === "GET" && ["/insano/eventos", "/insano/eventos/", "/evento/insano", "/orcamento/insano"].includes(url.pathname)) {
        return serveStatic(res, "insano-eventos.html");
      }

      if (req.method === "GET" && url.pathname === "/catalogo/insano") {
        return serveStatic(res, "catalog-insano.html");
      }

      if (
        req.method === "GET"
        && (
          url.pathname === "/admin/qrcodes"
          || url.pathname === "/garcom"
          || url.pathname === "/cozinha"
          || /^\/cardapio\/(insano|xeriffe)$/.test(url.pathname)
          || /^\/mesa\/(insano|xeriffe)\/\d+$/.test(url.pathname)
        )
      ) {
        return serveStatic(res, "platform.html");
      }

      if (req.method === "GET" && url.pathname === "/conteudo") {
        return serveStatic(res, "conteudo.html");
      }

      if (req.method === "GET" && ["/xeriffe-cardapio.css", "/xeriffe-cardapio.js"].includes(url.pathname)) {
        return serveStatic(res, url.pathname.slice(1));
      }

      if (req.method === "GET" && url.pathname === "/sambah-pay.css") {
        return serveStatic(res, "sambah-pay.css");
      }

      if (req.method === "GET" && url.pathname === "/insano-workhub.css") {
        return serveStatic(res, "insano-workhub.css");
      }

      if (req.method === "GET" && url.pathname === "/insano-workhub.js") {
        return serveStatic(res, "insano-workhub.js");
      }

      if (req.method === "GET" && ["/site.css", "/site.js", "/crm.css", "/crm.js", "/conteudo.css", "/platform.css", "/platform.js", "/insano-eventos.css", "/insano-eventos.js", "/oportunidades.css", "/oportunidades.js", "/conversas.css", "/conversas.js", "/mobile-inbox.css", "/mobile-inbox.js", "/sambah-shell-responsive.js", "/sambah-conversas-sw.js", "/sambah-conversas.webmanifest", "/portal.css", "/portal.js", "/perola.css", "/perola.js", "/voice-pay.css", "/voice-pay.js", "/sambah-ecosystem.css", "/sambah-central.js", "/sambah-pay.js", "/sambah-autoserve.js", "/sambah-devices.js", "/sambah-locker.js", "/sambah-weight.js", "/sambah-events.js", "/sambah-observability.js", "/sambah-security.js", "/sambah-lgpd.js", "/sambah-database.js", "/sambah-messaging.js", "/sambah-shell.css", "/sambah-shell.js", "/admin-permissoes.css", "/admin-permissoes.js", "/admin-usuarios.css", "/admin-usuarios.js", "/admin-auditoria.css", "/admin-auditoria.js", "/insano-catalog-admin.css", "/insano-catalog-admin.js", "/login.css", "/login.js", "/auth-ui.js"].includes(url.pathname)) {
        return serveStatic(res, url.pathname.slice(1));
      }

      if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
        return serveStatic(res, url.pathname.slice(1));
      }

      if (req.method === "GET" && url.pathname.startsWith("/admin/assets/")) {
        return serveStatic(res, url.pathname.replace("/admin/assets/", ""));
      }

      if (req.method === "GET" && url.pathname === "/admin/audit/stats") {
        return sendJson(res, 200, await auditService.stats());
      }

      if (req.method === "GET" && url.pathname === "/admin/audit/logs") {
        return sendJson(res, 200, await auditService.listLogs({
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
          type: url.searchParams.get("type"),
          status: url.searchParams.get("status")
        }));
      }

      if (req.method === "GET" && url.pathname === "/admin/mesa/status") {
        const [health, queue] = await Promise.all([
          mesaService.checkMesaHealth(),
          mesaService.queueSnapshot({ limit: 10 })
        ]);
        return sendJson(res, 200, { ...health, queue });
      }

      if (req.method === "GET" && url.pathname === "/admin/mesa/queue") {
        return sendJson(res, 200, await mesaService.queueSnapshot({
          limit: url.searchParams.get("limit")
        }));
      }

      if (req.method === "POST" && url.pathname === "/api/mesa/whatsapp/order-completed") {
        const body = await readJson(req, { requireBody: true });
        const activeRuntimeConfig = appRuntimeConfig || getRuntimeConfig();
        const repository = whatsappV2ConversationRepository || createWhatsAppV2StateRepository(activeRuntimeConfig);
        const result = await markWhatsAppV2MesaOrderReceived(repository, body);
        await safeAuditRecord(auditService, {
          type: result.ok ? "whatsapp_mesa_order_received" : "whatsapp_mesa_order_rejected",
          status: result.ok ? "info" : "warning",
          source: "mesa_do_xeriffe",
          message: result.ok ? "Pedido do Mesa vinculado a conversa WhatsApp" : "Retorno do Mesa recusado por correlacao invalida",
          context: {
            mesaOrderId: String(body.mesaOrderId || ""),
            conversationId: body.conversationId ? `wa_${maskPhone(body.phone || body.conversationId)}` : "",
            status: result.state?.serviceState || "",
            error: result.error || ""
          },
          dedupeKey: body.mesaOrderId ? `whatsapp-mesa-order:${body.mesaOrderId}` : undefined
        });
        return sendJson(res, result.statusCode || (result.ok ? 200 : 400), result.ok ? {
          ok: true,
          duplicate: result.duplicate === true,
          serviceState: result.state?.serviceState || "",
          mesaOrderId: result.state?.mesaOrderId || ""
        } : {
          ok: false,
          error: result.error || "mesa_order_return_rejected"
        });
      }

      if (req.method === "GET" && url.pathname === "/admin/whatsapp/status") {
        return sendJson(res, 200, await buildWhatsAppOperationalStatus(whatsappMessageService, whatsappConversationService, appRuntimeConfig || getRuntimeConfig()));
      }

      if (req.method === "GET" && url.pathname === "/api/call-center/operators") {
        return sendJson(res, 200, await callCenterService.listOperators());
      }

      if (req.method === "POST" && url.pathname === "/api/call-center/operators/login") {
        const result = await callCenterService.login(await readJson(req, { requireBody: true }));
        if (!result.ok) return sendJson(res, result.statusCode || 400, result);
        await safeAuditRecord(auditService, {
          type: "call_center_operator_login",
          status: "info",
          source: "call_center",
          message: "Atendente entrou na fila do SamBah",
          context: { operatorId: result.operator.id, operatorPhone: maskPhone(result.operator.phone), operatorStatus: result.operator.status }
        });
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/call-center/operators/status") {
        const body = await readJson(req, { requireBody: true });
        const result = await callCenterService.setStatus(body.phone || body.telefone || "", body.status || "available");
        return sendJson(res, result.ok ? 200 : result.statusCode || 400, result);
      }

      if (req.method === "GET" && url.pathname === "/api/call-center/alerts") {
        return sendJson(res, 200, await callCenterService.listAlerts({
          phone: url.searchParams.get("phone") || url.searchParams.get("telefone") || "",
          unreadOnly: url.searchParams.get("unreadOnly") === "true"
        }));
      }

      if (req.method === "GET" && url.pathname === "/api/call-center/push/public-key") {
        if (activeAuthMode === "session" && !req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        return sendJson(res, 200, await callCenterService.publicPushKey());
      }

      if (req.method === "POST" && url.pathname === "/api/call-center/push/subscriptions") {
        if (activeAuthMode === "session" && !req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        const result = await callCenterService.savePushSubscription(await readJson(req, { requireBody: true }), actorFromRequest(req), req.headers["user-agent"] || "");
        return sendJson(res, result.statusCode || (result.ok ? 200 : 400), result);
      }

      if (req.method === "GET" && url.pathname === "/api/call-center/push/subscriptions") {
        if (activeAuthMode === "session" && !req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        return sendJson(res, 200, await callCenterService.listPushSubscriptions(actorFromRequest(req)));
      }

      const callCenterPushDeviceMatch = url.pathname.match(/^\/api\/call-center\/push\/subscriptions\/([^/]+)$/);
      if (req.method === "DELETE" && callCenterPushDeviceMatch) {
        if (activeAuthMode === "session" && !req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        const result = await callCenterService.removePushSubscription(decodeURIComponent(callCenterPushDeviceMatch[1]), actorFromRequest(req));
        return sendJson(res, result.ok ? 200 : result.statusCode || 400, result);
      }

      const callCenterAlertReadMatch = url.pathname.match(/^\/api\/call-center\/alerts\/([^/]+)\/read$/);
      if (req.method === "POST" && callCenterAlertReadMatch) {
        const result = await callCenterService.markAlertRead(decodeURIComponent(callCenterAlertReadMatch[1]));
        return sendJson(res, result.ok ? 200 : result.statusCode || 404, result);
      }

      const callCenterAlertAckMatch = url.pathname.match(/^\/api\/call-center\/alerts\/([^/]+)\/acknowledge$/);
      if (req.method === "POST" && callCenterAlertAckMatch) {
        if (activeAuthMode === "session" && !req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        const result = await callCenterService.acknowledgeAlert(decodeURIComponent(callCenterAlertAckMatch[1]), actorFromRequest(req));
        return sendJson(res, result.ok ? 200 : result.statusCode || 404, result);
      }

      if (req.method === "GET" && url.pathname === "/admin/whatsapp/sessions") {
        return sendJson(res, 200, await whatsappMessageService.sessions());
      }

      if (req.method === "GET" && url.pathname === "/admin/whatsapp/messages") {
        return sendJson(res, 200, await whatsappMessageService.history({ limit: url.searchParams.get("limit") || 10 }));
      }

      if (req.method === "POST" && url.pathname === "/admin/whatsapp/sessions/clear") {
        const body = await readJson(req, { requireBody: true });
        return sendJson(res, 200, await whatsappMessageService.clearSession(body.phone || body.telefone || body.from || "", { draftId: body.draftId || "" }));
      }

      if (req.method === "GET" && url.pathname === "/admin/orders/tracking") {
        return sendJson(res, 200, await trackingService.list({
          limit: url.searchParams.get("limit")
        }));
      }

      if (req.method === "GET" && url.pathname === "/api/order-tracking") {
        return sendJson(res, 200, await trackingService.list({
          limit: url.searchParams.get("limit")
        }));
      }

      if (url.pathname.startsWith("/api/conversas") && activeAuthMode === "session" && !req.sambahUser) {
        return sendJson(res, 401, { ok: false, error: "auth_required" });
      }

      if (req.method === "GET" && url.pathname === "/api/conversas") {
        return sendJson(res, 200, await whatsappConversationService.list());
      }

      const conversaMatch = url.pathname.match(/^\/api\/conversas\/([^/]+)$/);
      if (req.method === "GET" && conversaMatch) {
        const result = await whatsappConversationService.get(decodeURIComponent(conversaMatch[1]));
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      if (req.method === "DELETE" && conversaMatch) {
        const adminCheck = requireAdminUser(req, activeAuthMode);
        if (!adminCheck.ok) return sendJson(res, adminCheck.statusCode, { ok: false, error: adminCheck.error });
        const conversationId = decodeURIComponent(conversaMatch[1]);
        const result = await whatsappConversationService.deleteConversation(conversationId);
        if (result.ok) {
          await safeAuditRecord(auditService, {
            type: "conversation_deleted",
            status: "warning",
            source: "admin",
            message: "Conversa sem uso excluida por administrador",
            context: {
              conversationId: result.conversationId,
              adminUser: safeAuditUsername(req.sambahUser?.username || "mock"),
              timestamp: new Date().toISOString(),
              reason: result.reason || ""
            },
            dedupeKey: `conversation-delete:${result.conversationId}`
          });
        }
        return sendJson(res, result.statusCode || (result.ok ? 200 : 400), result);
      }

      const conversaResponderMatch = url.pathname.match(/^\/api\/conversas\/([^/]+)\/responder$/);
      if (req.method === "POST" && conversaResponderMatch) {
        const body = await readJson(req, { requireBody: true });
        const result = await whatsappConversationService.addOutgoing(decodeURIComponent(conversaResponderMatch[1]), body, {
          runtimeConfig: appRuntimeConfig || getRuntimeConfig(),
          whatsappProvider: appWhatsappProvider
        });
        if (
          result.ok
          && result.duplicate !== true
          && result.duplicated !== true
          && result.sendResult
          && result.enviado !== true
        ) {
          const diagnostic = manualSendFailureDiagnostic(result);
          console.error("whatsapp.manual_send.failed", diagnostic);
          await safeAuditRecord(auditService, {
            type: "whatsapp_manual_send_failed",
            status: "error",
            source: "conversas",
            message: "Falha no envio manual pela Meta",
            context: diagnostic,
            dedupeKey: `manual-send:${result.message?.manualSendId || result.message?.id || "unknown"}`
          });
        }
        if (
          result.ok
          && result.message
          && result.duplicate !== true
          && result.duplicated !== true
          && whatsappMessageService?.appendMessage
        ) {
          await whatsappMessageService.appendMessage({
            direction: "out",
            normalized: {
              provider: "meta",
              from: result.conversa?.telefone || "",
              customer: { name: result.conversa?.nome || "", phone: result.conversa?.telefone || "" },
              messageId: result.message.id || "",
              correlationId: result.message.correlationId || result.message.manualSendId || result.message.id || "",
              message: result.message.text || ""
            },
            text: result.message.text || "",
            sendResult: result.sendResult
          });
        }
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      if (req.method === "POST" && url.pathname === "/api/conversas/maintenance/reset-queue") {
        const adminCheck = requireAdminUser(req, activeAuthMode);
        if (!adminCheck.ok) return sendJson(res, adminCheck.statusCode, { ok: false, error: adminCheck.error });
        const result = await whatsappConversationService.resetOperationalQueue(actorFromRequest(req), "2.0.0");
        if (result.ok && !result.alreadyApplied) await safeAuditRecord(auditService, {
          type: "conversation_queue_reset",
          status: "warning",
          source: "conversas",
          message: "Fila operacional arquivada com historico preservado",
          context: { archived: result.archived, resetVersion: result.resetVersion, actorUser: safeAuditUsername(req.sambahUser?.username || "mock") }
        });
        return sendJson(res, result.statusCode || (result.ok ? 200 : 400), result);
      }

      if (req.method === "GET" && url.pathname === "/api/forms") return sendJson(res, 200, { ok: true, items: listFormDefinitions() });
      const formDefinitionMatch = url.pathname.match(/^\/api\/forms\/([^/]+)$/);
      if (req.method === "GET" && formDefinitionMatch) {
        const form = getFormDefinition(decodeURIComponent(formDefinitionMatch[1]));
        return form ? sendJson(res, 200, { ok: true, form }) : sendJson(res, 404, { ok: false, error: "form_not_found" });
      }

      if (req.method === "GET" && url.pathname === "/api/releases/current") {
        return sendJson(res, 200, { ok: true, version: packageJson.version, channel: "stable", publishedAt: "2026-07-30T00:00:00.000Z", reloadRequired: true });
      }

      const conversaActionMatch = url.pathname.match(/^\/api\/conversas\/([^/]+)\/(read|unread|claim|release|transfer|resolve|reopen|waiting|archive)$/);
      if (req.method === "POST" && conversaActionMatch) {
        if (activeAuthMode === "session" && !req.sambahUser) return sendJson(res, 401, { ok: false, error: "auth_required" });
        const conversationId = decodeURIComponent(conversaActionMatch[1]);
        const action = conversaActionMatch[2];
        const body = await readJson(req, { requireBody: false });
        const actor = actorFromRequest(req);
        const before = await whatsappConversationService.get(conversationId);
        const previousVersion = before.conversa?.version || null;
        const expectedVersion = body.expectedVersion ?? null;
        const targetOperatorPhone = body.targetOperatorPhone || "";
        const result = await runConversationAction(whatsappConversationService, action, conversationId, actor, { expectedVersion, targetOperatorPhone });
        if (result.ok) {
          await safeAuditRecord(auditService, {
            type: auditTypeForConversationAction(action),
            status: "info",
            source: "conversas",
            message: "Acao de conversa registrada",
            context: {
              conversationId,
              actorUser: safeAuditUsername(actor.username || actor.name || "mock"),
              actorRole: actor.role || "ADMIN",
              previousVersion,
              nextVersion: result.conversa?.version || null,
              timestamp: new Date().toISOString()
            }
          });
        }
        return sendJson(res, result.statusCode || (result.ok ? 200 : 400), result);
      }

      const conversaMessagesMatch = url.pathname.match(/^\/api\/conversas\/([^/]+)\/messages$/);
      if (req.method === "DELETE" && conversaMessagesMatch) {
        const adminCheck = requireAdminUser(req, activeAuthMode);
        if (!adminCheck.ok) return sendJson(res, adminCheck.statusCode, { ok: false, error: adminCheck.error });
        const conversationId = decodeURIComponent(conversaMessagesMatch[1]);
        const actor = actorFromRequest(req);
        const before = await whatsappConversationService.get(conversationId);
        const result = await whatsappConversationService.clearConversationHistory(conversationId, actor);
        if (result.ok) {
          await safeAuditRecord(auditService, {
            type: "conversation_history_cleared",
            status: "warning",
            source: "conversas",
            message: "Historico da conversa limpo",
            context: {
              conversationId,
              actorUser: safeAuditUsername(actor.username || "mock"),
              actorRole: actor.role || "ADMIN",
              previousVersion: before.conversa?.version || null,
              nextVersion: result.conversa?.version || null,
              timestamp: new Date().toISOString(),
              removedMessages: result.removedMessages || 0
            }
          });
        }
        return sendJson(res, result.statusCode || (result.ok ? 200 : 400), result);
      }

      const conversaHumanoMatch = url.pathname.match(/^\/api\/conversas\/([^/]+)\/humano$/);
      if (req.method === "POST" && conversaHumanoMatch) {
        const result = await whatsappConversationService.markHuman(decodeURIComponent(conversaHumanoMatch[1]));
        if (result.ok) await maybeCreateHumanAlert(result, { whatsappConversationService, callCenterService, auditService });
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      const conversaResolvidoMatch = url.pathname.match(/^\/api\/conversas\/([^/]+)\/resolvido$/);
      if (req.method === "POST" && conversaResolvidoMatch) {
        const result = await whatsappConversationService.markResolved(decodeURIComponent(conversaResolvidoMatch[1]));
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      const conversaAutomaticoMatch = url.pathname.match(/^\/api\/conversas\/([^/]+)\/automatico$/);
      if (req.method === "POST" && conversaAutomaticoMatch) {
        const result = await whatsappConversationService.markAutomatic(decodeURIComponent(conversaAutomaticoMatch[1]));
        if (result.ok) {
          await setWhatsAppV2Automatic(result.conversa.telefone || decodeURIComponent(conversaAutomaticoMatch[1]), appRuntimeConfig || getRuntimeConfig());
        }
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      const conversaMensagemMatch = url.pathname.match(/^\/api\/conversas\/([^/]+)\/mensagens\/([^/]+)$/);
      if (req.method === "DELETE" && conversaMensagemMatch) {
        const adminCheck = requireAdminUser(req, activeAuthMode);
        if (!adminCheck.ok) return sendJson(res, adminCheck.statusCode, { ok: false, error: adminCheck.error });
        const conversationId = decodeURIComponent(conversaMensagemMatch[1]);
        const messageId = decodeURIComponent(conversaMensagemMatch[2]);
        const result = await whatsappConversationService.deleteMessage(conversationId, messageId);
        if (result.ok) {
          await safeAuditRecord(auditService, {
            type: "whatsapp_conversation_message_deleted",
            status: "warning",
            source: "admin",
            message: "Mensagem da Central de Conversas excluida por administrador",
            context: {
              conversationId,
              messageId,
              username: req.sambahUser?.username || "mock",
              role: req.sambahUser?.role || "ADMIN",
              direction: result.removed?.direction || "",
              messageType: result.removed?.type || ""
            },
            dedupeKey: `wa-message-delete:${conversationId}:${messageId}`
          });
        }
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      if (req.method === "GET" && url.pathname === "/api/orders/tracking/refresh") {
        return sendJson(res, 200, await trackingService.refreshStatuses({
          mesaService,
          limit: url.searchParams.get("limit")
        }));
      }

      const markWhatsappMatch = url.pathname.match(/^\/api\/orders\/tracking\/([^/]+)\/mark-whatsapp-sent$/);
      if (req.method === "POST" && markWhatsappMatch) {
        const result = await trackingService.markWhatsappSent(decodeURIComponent(markWhatsappMatch[1]));
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      if (req.method === "POST" && url.pathname === "/admin/mesa/retry") {
        const result = await mesaService.retryPendingOrders();
        await auditService.record({
          type: "mesa_retry",
          status: result.failed ? "warning" : "success",
          source: "mesa",
          message: "Reenvio de pedidos pendentes ao Mesa",
          context: { attempted: result.attempted, accepted: result.accepted, failed: result.failed }
        });
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/admin/mesa/send-test-order") {
        const testOrder = buildMesaOrder({
          eventId: `test-${Date.now()}`,
          name: "Cliente Teste",
          phone: "11999990000",
          items: [{ productId: "kachurrasco", qty: 1, addons: [], serveMode: "Levar", note: "Pedido teste samBah!" }],
          notes: "Pedido teste de integração Mesa",
          total: null
        });
        const entry = await mesaService.enqueueOrder(testOrder);
        const result = await mesaService.sendOrderToMesa(entry);
        await auditService.record({
          type: "mesa_test_order",
          status: result.ok ? "success" : "warning",
          source: "mesa",
          message: "Pedido teste enviado ao fluxo Mesa",
          context: { queueId: entry.id, mesaStatus: result.ok ? "accepted" : "pending" }
        });
        return sendJson(res, 202, result);
      }

      if (req.method === "GET" && url.pathname === "/admin/menu/status") {
        return sendJson(res, 200, await menuService.status());
      }

      if (req.method === "POST" && url.pathname === "/admin/menu/sync") {
        const result = await menuService.syncMenu();
        await auditService.record({
          type: "menu_sync",
          status: "success",
          source: "mesa",
          message: "Cardapio sincronizado do Mesa",
          context: { totalItems: result.items.length, updatedAt: result.updatedAt }
        });
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/admin/menu/cache") {
        return sendJson(res, 200, await menuService.cacheSnapshot());
      }

      if (req.method === "GET" && url.pathname === "/admin/orders/review") {
        return sendJson(res, 200, await mesaService.reviewOrders({
          limit: url.searchParams.get("limit")
        }));
      }

      if (req.method === "POST" && url.pathname === "/admin/orders/review/cancel") {
        const body = await readJson(req);
        const result = await mesaService.cancelReviewOrder(body.id);
        if (!result.ok) {
          return sendJson(res, result.error === "order_not_found" ? 404 : 409, result);
        }
        await auditService.record({
          type: "review_order_canceled",
          status: "info",
          source: "admin",
          message: "Pedido em revisao cancelado pelo operador",
          context: { queueId: body.id },
          dedupeKey: `review-cancel:${body.id}`
        });
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/admin/orders/drafts") {
        return sendJson(res, 200, await draftService.listDrafts({
          limit: url.searchParams.get("limit")
        }));
      }

      if (req.method === "GET" && url.pathname === "/admin/events/leads") {
        return sendJson(res, 200, await eventService.listLeads({
          limit: url.searchParams.get("limit"),
          status: url.searchParams.get("status")
        }));
      }

      if (req.method === "POST" && url.pathname === "/admin/events/leads") {
        const body = await readJson(req);
        const result = await eventService.createLead({ ...body, source: body.source || "admin / samBah!" });
        await auditService.record({
          type: "event_lead_created",
          status: "info",
          source: "agenda_insano",
          message: "Lead criado na Agenda Insano",
          context: { leadId: result.lead.id, duplicated: result.duplicated },
          dedupeKey: result.lead.id
        });
        return sendJson(res, 201, result);
      }

      if (req.method === "POST" && url.pathname === "/admin/events/leads/update") {
        const body = await readJson(req);
        const result = await eventService.updateLead(body);
        if (!result.ok) return sendJson(res, result.error === "lead_not_found" ? 404 : 409, result);
        await auditService.record({
          type: "event_lead_updated",
          status: "info",
          source: "agenda_insano",
          message: "Lead atualizado na Agenda Insano",
          context: { leadId: body.id, status: result.lead.status },…14828 tokens truncated…ventos"
  ];
  const produtosBase = [
    ["Burguer Insano", "Burgers", ["burger", "insano"], true],
    ["Cordeiro Insano", "Burgers", ["cordeiro", "burger"], false],
    ["Joelho de Porco", "Assados & Buteco", ["assado", "buteco"], false],
    ["Frango Assado", "Assados & Buteco", ["frango", "assado"], false],
    ["Costela / Assado da Casa", "Assados & Buteco", ["costela", "assado"], false],
    ["Pizza da Casa", "Pizzas", ["pizza"], false],
    ["Pizza Insana", "Pizzas", ["pizza", "insano"], true],
    ["Pizza para Eventos", "Pizzas", ["pizza", "eventos"], false],
    ["Fritas", "PorÃ§Ãµes", ["porÃ§Ã£o", "buteco"], false],
    ["Polenta", "PorÃ§Ãµes", ["porÃ§Ã£o", "buteco"], false],
    ["Frango", "PorÃ§Ãµes", ["porÃ§Ã£o", "frango"], false],
    ["PorÃ§Ã£o de Boteco Insana", "PorÃ§Ãµes", ["porÃ§Ã£o", "buteco", "insano"], true],
    ["Espetinho de Fraldinha", "Espetinhos", ["espetinho", "fraldinha"], false],
    ["Espetinho de Frango", "Espetinhos", ["espetinho", "frango"], false],
    ["Espetinho Misto", "Espetinhos", ["espetinho"], false],
    ["Espetinho de CoraÃ§Ã£o", "Espetinhos", ["espetinho", "coraÃ§Ã£o"], false],
    ["Refrigerantes", "Bebidas", ["bebida"], false],
    ["Ãgua", "Bebidas", ["bebida"], false],
    ["Cervejas", "Bebidas", ["bebida", "cerveja"], false],
    ["Chope Artesanal Insano / Beerlina", "Bebidas", ["bebida", "chope"], true],
    ["Food Truck para Eventos", "Eventos", ["evento", "food truck"], true],
    ["Insaninha Food Truck", "Eventos", ["evento", "food truck"], false],
    ["Churrasco para Eventos", "Eventos", ["evento", "churrasco"], true],
    ["Pizza para Eventos", "Eventos", ["evento", "pizza"], false],
    ["Comida de Buteco para Eventos", "Eventos", ["evento", "buteco"], false]
  ];

  return {
    ok: true,
    marca: "Insano Food Truck",
    origem: "site-insano",
    categorias,
    produtos: produtosBase.map(([nome, categoria, tags, destaque]) => ({
      id: slugifySiteCardapio(nome),
      nome,
      descricao: "",
      categoria,
      preco: null,
      ativo: true,
      destaque,
      imagem: "",
      tags
    }))
  };
}

function slugifySiteCardapio(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
async function createSitePedido(crmService, body = {}) {
  const nome = cleanSiteOrderText(body.nome || body.name || body.customerName || body.customer?.name);
  if (!nome) return { ok: false, error: "Informe o nome do cliente" };

  const telefone = cleanSiteOrderText(body.telefone || body.whatsapp || body.phone || body.customer?.phone);
  if (!telefone) return { ok: false, error: "Informe o telefone do cliente" };

  const itensResult = normalizeSitePedidoItems(body.itens || body.items);
  if (!itensResult.ok) return { ok: false, error: itensResult.error };

  const origem = cleanSiteOrderText(body.origem || body.source) || "site-insano";
  const tipo = cleanSiteOrderText(body.tipo || body.type) || "pedido";
  const status = "novo";
  const createdAt = new Date().toISOString();
  const formaEntrega = cleanSiteOrderText(body.formaEntrega || body.deliveryMode || body.customer?.serviceType);
  const endereco = cleanSiteOrderText(body.endereco || body.address || body.customer?.address);
  const formaPagamento = cleanSiteOrderText(body.formaPagamento || body.paymentMethod || body.customer?.paymentMethod);
  const observacoes = cleanSiteOrderText(body.observacoes || body.notes || body.observation);
  const totalEstimado = normalizeSitePedidoTotal(body.totalEstimado || body.estimatedTotal || body.total);
  const operation = normalizeOperation(body.operation || body.operacao || origem);
  const pipeline = body.pipeline || "pedido_rapido";
  const horario = cleanSiteOrderText(body.horario || body.time || body.customer?.time);

  const result = await crmService.salvarPrecomanda({
    ...body,
    nome,
    whatsapp: telefone,
    telefone,
    phone: telefone,
    origem,
    source: origem,
    tipo,
    type: tipo,
    itens: itensResult.items,
    items: itensResult.items,
    formaEntrega,
    endereco,
    formaPagamento,
    horario,
    observacoes,
    totalEstimado,
    total: totalEstimado,
    pipeline,
    status,
    createdAt,
    operacao: operation,
    operation,
    customer: {
      ...(body.customer || {}),
      name: nome,
      phone: telefone,
      serviceType: formaEntrega,
      address: endereco,
      paymentMethod: formaPagamento
    }
  });

  const whatsappMessage = buildSitePedidoWhatsappMessage({
    pedidoId: result.precomanda.id,
    nome,
    telefone,
    operation,
    itens: itensResult.items,
    formaEntrega,
    endereco,
    horario,
    formaPagamento,
    observacoes,
    mesa: body.mesa || body.customer?.mesa || "",
    status: result.precomanda.status || status
  });
  const whatsappUrl = buildSitePedidoWhatsappUrl(whatsappMessage);
  const statusUrl = `/pedido/${encodeURIComponent(result.precomanda.id)}/status`;

  return {
    ok: true,
    pedidoId: result.precomanda.id,
    status: result.precomanda.status || status,
    atendimentoStatus: "aguardando_confirmacao",
    whatsappMessage,
    whatsappUrl,
    statusUrl,
    confirmation: {
      title: "✅ Pedido recebido pelo SamBah",
      text: "Seu atendimento foi iniciado. Agora vamos abrir o WhatsApp com os dados já organizados para nossa equipe continuar o atendimento.",
      status: "aguardando confirmação"
    }
  };
}
async function createSitePrecomanda(crmService, body = {}) {
  const operation = normalizeOperation(body.operation || body.operacao || body.site || body.origem);
  const tracking = siteTrackingFields(body);
  const pipeline = body.pipeline || "pedido_rapido";
  const result = await crmService.salvarPrecomanda({
    ...body,
    ...tracking,
    nome: body.nome || body.name || body.customerName || body.customer?.name || "",
    whatsapp: body.whatsapp || body.telefone || body.phone || body.customer?.phone || "",
    operacao: operation,
    operation,
    origem: body.source || body.origem || "site_externo",
    pipeline,
    status: body.status || "novo"
  });
  const whatsappMessage = buildSitePedidoWhatsappMessage({
    pedidoId: result.precomanda.id,
    nome: result.precomanda.nome,
    telefone: result.precomanda.whatsapp,
    operation,
    itens: result.precomanda.items || result.precomanda.itens || [],
    formaEntrega: result.precomanda.type || result.precomanda.tipo || result.precomanda.customer?.serviceType || body.type || body.tipo,
    endereco: result.precomanda.endereco || result.precomanda.address || body.endereco || body.address || "",
    horario: result.precomanda.horario || body.horario || body.retirada || "",
    formaPagamento: result.precomanda.formaPagamento || result.precomanda.customer?.paymentMethod || body.formaPagamento || body.paymentMethod || "",
    observacoes: result.precomanda.observacoes || result.precomanda.notes || "",
    mesa: result.precomanda.mesa || body.mesa || "",
    status: result.precomanda.status
  });
  const whatsappUrl = buildSitePedidoWhatsappUrl(whatsappMessage) || result.whatsappUrl;
  return siteResponse({
    id: result.precomanda.id,
    pedidoId: result.precomanda.id,
    pipeline: result.precomanda.pipeline || pipeline,
    operation,
    whatsappUrl,
    whatsappMessage,
    statusUrl: `/pedido/${encodeURIComponent(result.precomanda.id)}/status`,
    confirmation: {
      title: "✅ Pedido recebido pelo SamBah",
      text: "Seu atendimento foi iniciado. Agora vamos abrir o WhatsApp com os dados já organizados para nossa equipe continuar o atendimento.",
      status: "aguardando confirmação"
    },
    precomanda: result.precomanda,
    status: result.precomanda.status
  });
}

async function createSiteWhatsapp(crmService, body = {}) {
  const operation = normalizeOperation(body.operation || body.operacao || body.site || body.origem);
  const tracking = siteTrackingFields(body);
  const result = await crmService.registrarAtendimentoComercial({
    ...body,
    ...tracking,
    nome: body.nome || body.name || body.customerName || body.customer?.name || "Contato WhatsApp",
    whatsapp: body.whatsapp || body.telefone || body.phone || body.customer?.phone || "",
    operacao: operation,
    operation,
    origem: body.source || body.origem || "site_whatsapp",
    interesse: body.interesse || body.contexto || "atendimento_humano",
    mensagem: body.mensagem || body.message || "Contato solicitado pelo botao WhatsApp do site",
    pipeline: body.pipeline || "atendimento_humano",
    status: body.status || "aguardando_atendimento"
  });
  const id = result.atendimento?.id || result.lead?.id || body.id || body.eventId || `wa_${Date.now()}`;
  const pipeline = result.pipeline || body.pipeline || "atendimento_humano";
  const whatsappMessage = buildSiteAtendimentoWhatsappMessage({ id, operation, pipeline, body, tipo: body.tipo || body.type || "whatsapp" });
  const whatsappUrl = buildSitePedidoWhatsappUrl(whatsappMessage) || result.whatsappUrl || buildSiteWhatsAppUrl(body, operation);
  return siteResponse({
    id,
    pipeline,
    operation,
    whatsappUrl,
    whatsappMessage,
    confirmation: buildSiteConfirmation("atendimento"),
    atendimento: result.atendimento || null,
    lead: result.lead || null
  });
}

function insanoSitePayload(body = {}, overrides = {}) {
  return {
    ...body,
    ...overrides,
    operation: "Insano",
    operacao: "Insano",
    source: "insanofoodtruck.com.br",
    origem: "insanofoodtruck.com.br",
    channel: "site",
    canal: "site",
    page: body.page || body.pagina || body.referrer || "",
    campaign: body.campaign || body.utm_campaign || "",
    utm_source: body.utm_source || "",
    utm_medium: body.utm_medium || "",
    utm_campaign: body.utm_campaign || body.campaign || "",
    utm_content: body.utm_content || "",
    utm_term: body.utm_term || "",
    tipo: overrides.tipo || body.tipo || body.type || "lead"
  };
}

const SITE_ORDER_ORIGINS_FOR_MESA = new Set([
  "site-insano",
  "site_insano",
  "portal-insano",
  "portal_insano",
  "wix-insano",
  "wix_insano",
  "teste-html-insano",
  "teste_html_insano",
  "insanofoodtruck.com.br"
]);

const MESA_SITE_ORDER_STATUSES = new Set(["novo", "bloqueado_estoque", "aceito", "em_preparo", "pronto", "finalizado", "cancelado"]);

async function listarPedidosSiteParaMesa(crmService, statusFilter = "") {
  const rawFilter = String(statusFilter || "").trim().toLowerCase();
  const listarTodos = ["todos", "all"].includes(rawFilter);
  const normalizedFilter = listarTodos ? "" : normalizeMesaSiteStatus(rawFilter);
  const precomandas = await crmService.listarPrecomandas();
  const items = precomandas.items
    .filter(isSiteOrderForMesa)
    .filter((item) => !normalizedFilter || normalizeMesaSiteStatus(item.status) === normalizedFilter)
    .map(mapSiteOrderForMesa);
  return { ok: true, count: items.length, pedidos: items, items };
}

async function atualizarStatusPedidoSiteParaMesa(crmService, id, body = {}) {
  const status = normalizeMesaSiteStatus(body.status);
  if (!MESA_SITE_ORDER_STATUSES.has(status) || ["novo", "bloqueado_estoque"].includes(status)) {
    return { ok: false, error: "Status invalido para pedido do site" };
  }
  const result = await crmService.atualizarPrecomanda(id, {
    status,
    status_mesa: status,
    origemAtualizacao: body.origemAtualizacao || "mesa-xeriffe",
    observacao_mesa: body.observacao || "",
    atualizado_em: new Date().toISOString()
  });
  if (!result.ok) return { ok: false, error: "Pedido do site nao encontrado" };
  return { ok: true, id, status, pedido: mapSiteOrderForMesa(result.item || result.precomanda || result.updated || {}) };
}

async function bloquearPedidoSiteParaMesa(crmService, id, body = {}) {
  const status = normalizeMesaSiteStatus(body.mesaStatus || body.status || "bloqueado_estoque");
  if (status !== "bloqueado_estoque") return { ok: false, error: "Status de bloqueio invalido" };
  const message = body.message || "Conferir/liberar estoque do turno antes de importar.";
  const result = await crmService.atualizarPrecomanda(id, {
    status,
    status_mesa: status,
    origemAtualizacao: body.origemAtualizacao || "mesa-xeriffe",
    bloqueio_mesa: {
      reason: body.reason || "estoque_turno",
      message,
      mesaStatus: status,
      at: new Date().toISOString()
    },
    observacao_mesa: message,
    atualizado_em: new Date().toISOString()
  });
  if (!result.ok) return { ok: false, error: "Pedido do site nao encontrado" };
  return { ok: true, id, status, pedido: mapSiteOrderForMesa(result.item || result.precomanda || result.updated || {}) };
}

function isSiteOrderForMesa(item = {}) {
  const sourceText = normalizeMesaSource([item.origem, item.source, item.channel, item.canal].filter(Boolean).join(" "));
  const status = normalizeMesaSiteStatus(item.status);
  return [...SITE_ORDER_ORIGINS_FOR_MESA].some((origin) => sourceText.includes(normalizeMesaSource(origin)))
    && MESA_SITE_ORDER_STATUSES.has(status || "novo");
}

function mapSiteOrderForMesa(item = {}) {
  return {
    id: item.id,
    pedidoId: item.id,
    status: normalizeMesaSiteStatus(item.status) || "novo",
    bloqueio_mesa: item.bloqueio_mesa || null,
    origem: item.origem || item.source || "site-insano",
    source: item.source || item.origem || "site-insano",
    operation: item.operacao || item.operation || "Insano",
    nome: item.nome || item.customerName || "Cliente",
    customerName: item.customerName || item.nome || "Cliente",
    telefone: item.whatsapp || item.phone || "",
    phone: item.phone || item.whatsapp || "",
    whatsapp: item.whatsapp || item.phone || "",
    itens: Array.isArray(item.itens) ? item.itens : [],
    items: Array.isArray(item.itens) ? item.itens.map((orderItem) => ({
      name: orderItem.nome || orderItem.name || orderItem.product || orderItem.productId || "Item",
      product: orderItem.nome || orderItem.name || orderItem.product || orderItem.productId || "Item",
      quantity: Number(orderItem.quantidade || orderItem.quantity || orderItem.qty) || 1,
      qty: Number(orderItem.quantidade || orderItem.quantity || orderItem.qty) || 1,
      note: orderItem.observacao || orderItem.note || orderItem.notes || "",
      price: Number(orderItem.preco ?? orderItem.price ?? 0) || 0,
      preco: Number(orderItem.preco ?? orderItem.price ?? 0) || 0
    })) : [],
    formaEntrega: item.formaEntrega || item.tipo || item.serviceType || "",
    serviceType: item.formaEntrega || item.tipo || item.serviceType || "",
    endereco: item.endereco || item.address || "",
    address: item.endereco || item.address || "",
    formaPagamento: item.formaPagamento || item.pagamento || item.paymentMethod || "",
    paymentMethod: item.formaPagamento || item.pagamento || item.paymentMethod || "",
    observacoes: item.observacoes || item.notes || "",
    notes: item.observacoes || item.notes || "",
    horario: item.horario || "",
    createdAt: item.createdAt || item.criado_em || "",
    updatedAt: item.atualizado_em || item.updatedAt || ""
  };
}

function normalizeMesaSiteStatus(status = "") {
  const normalized = String(status || "novo").trim().toLowerCase();
  if (["nova", "pending", "pendente"].includes(normalized)) return "novo";
  if (["bloqueado", "bloqueado-estoque", "estoque_bloqueado", "stock_blocked"].includes(normalized)) return "bloqueado_estoque";
  if (["accepted", "recebido", "importado"].includes(normalized)) return "aceito";
  if (["preparo", "em preparo"].includes(normalized)) return "em_preparo";
  if (["finalizada", "entregue"].includes(normalized)) return "finalizado";
  return normalized;
}

function normalizeMesaSource(value = "") {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}
function siteTrackingFields(body = {}) {
  const page = body.page || body.pagina || body.referrer || "";
  const campaign = body.campaign || body.utm_campaign || "";
  return {
    source: body.source || body.origem || "site_externo",
    origem: body.origem || body.source || "site_externo",
    channel: body.channel || body.canal || "site",
    canal: body.canal || body.channel || "site",
    page,
    campaign,
    utm_source: body.utm_source || "",
    utm_medium: body.utm_medium || "",
    utm_campaign: body.utm_campaign || campaign,
    utm_content: body.utm_content || "",
    utm_term: body.utm_term || "",
    tipo: body.tipo || body.type || ""
  };
}

function siteResponse({ id, pipeline, operation, whatsappUrl, status, ...extra }) {
  return {
    ok: true,
    id,
    pipeline,
    operation,
    status: status || "registrado",
    whatsappUrl,
    ...extra
  };
}

function normalizeOperation(value = "") {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("xeriffe") || normalized.includes("buteco")) return "Buteco Xeriffe";
  return "Insano";
}

function buildSiteWhatsAppUrl(body = {}, operation = "Insano") {
  const number = getRuntimeConfig().whatsappNumber;
  const message = buildSiteAtendimentoWhatsappMessage({ id: body.id || body.eventId || "", operation, pipeline: body.pipeline || "atendimento_humano", body, tipo: body.tipo || body.type || "whatsapp" });
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function buildSiteConfirmation(kind = "atendimento") {
  return {
    title: "SamBah recebeu seu atendimento",
    text: "Seu pedido ou solicitação foi organizado com sucesso. Agora vamos abrir o WhatsApp com os dados já preparados para nossa equipe continuar seu atendimento.",
    status: "aguardando confirmação da equipe",
    kind
  };
}

function buildSiteAtendimentoWhatsappMessage({ id, operation = "Insano", pipeline = "", body = {}, tipo = "" }) {
  if (operation === "Buteco Xeriffe" || pipeline === "festa_xeriffe") return buildXeriffeWhatsappMessage({ id, body });
  if (pipeline === "orcamento_corporativo" || tipo === "empresa") return buildCorporateWhatsappMessage({ id, body });
  if (pipeline === "food_truck_evento" || pipeline === "orcamento_evento" || tipo === "evento" || tipo === "lead") return buildFoodTruckWhatsappMessage({ id, body });
  return buildGenericSiteWhatsappMessage({ id, operation, body });
}

function buildFoodTruckWhatsappMessage({ id, body = {} }) {
  return [
    "🔥 Olá, equipe Insano!",
    "Sou o SamBah e organizei uma nova solicitação de Food Truck pelo site.",
    "",
    "Atendimento:",
    `ID: ${id || ""}`,
    `Cliente: ${siteBodyName(body)}`,
    siteBodyPhone(body) ? `WhatsApp: ${siteBodyPhone(body)}` : "",
    "Tipo: Food Truck",
    siteBodyDate(body) ? `Data: ${siteBodyDate(body)}` : "",
    siteBodyPeople(body) ? `Pessoas: ${siteBodyPeople(body)}` : "",
    siteBodyPlace(body) ? `Local: ${siteBodyPlace(body)}` : "",
    siteBodyNotes(body) ? `Observações: ${siteBodyNotes(body)}` : "",
    "",
    "Status: aguardando retorno da equipe.",
    "",
    "Pode seguir com esse atendimento?"
  ].filter(Boolean).join("\n");
}

function buildCorporateWhatsappMessage({ id, body = {} }) {
  return [
    "🏢 Olá, equipe Insano!",
    "Sou o SamBah e organizei uma nova solicitação de evento corporativo pelo site.",
    "",
    "Atendimento:",
    `ID: ${id || ""}`,
    `Cliente: ${siteBodyName(body)}`,
    body.empresa ? `Empresa: ${body.empresa}` : "",
    siteBodyPhone(body) ? `WhatsApp: ${siteBodyPhone(body)}` : "",
    siteBodyDate(body) ? `Data: ${siteBodyDate(body)}` : "",
    siteBodyPeople(body) ? `Pessoas: ${siteBodyPeople(body)}` : "",
    (body.tipo_evento || body.tipo || body.type) ? `Necessidade: ${body.tipo_evento || body.tipo || body.type}` : "",
    siteBodyNotes(body) ? `Observações: ${siteBodyNotes(body)}` : "",
    "",
    "Status: aguardando retorno da equipe.",
    "",
    "Pode seguir com esse atendimento?"
  ].filter(Boolean).join("\n");
}

function buildXeriffeWhatsappMessage({ id, body = {} }) {
  return [
    "🤠 Olá, equipe Xeriffe!",
    "Sou o SamBah e organizei um novo atendimento pelo site.",
    "",
    "Atendimento:",
    `ID: ${id || ""}`,
    `Cliente: ${siteBodyName(body)}`,
    siteBodyPhone(body) ? `WhatsApp: ${siteBodyPhone(body)}` : "",
    (body.message || body.tipo || body.type) ? `Tipo: ${body.message || body.tipo || body.type}` : "",
    siteBodyNotes(body) ? `Detalhes: ${siteBodyNotes(body)}` : "",
    "",
    "Status: aguardando confirmação da equipe.",
    "",
    "Pode seguir com esse atendimento?"
  ].filter(Boolean).join("\n");
}

function buildGenericSiteWhatsappMessage({ id, operation = "Insano", body = {} }) {
  return [
    operation === "Buteco Xeriffe" ? "🤠 Olá, equipe Xeriffe!" : "🍔 Olá, equipe Insano!",
    "Sou o SamBah e organizei um novo atendimento pelo site.",
    "",
    "Atendimento:",
    `ID: ${id || ""}`,
    `Cliente: ${siteBodyName(body)}`,
    siteBodyPhone(body) ? `WhatsApp: ${siteBodyPhone(body)}` : "",
    (body.message || body.tipo || body.type) ? `Tipo: ${body.message || body.tipo || body.type}` : "",
    siteBodyNotes(body) ? `Detalhes: ${siteBodyNotes(body)}` : "",
    "",
    "Status: aguardando confirmação da equipe.",
    "",
    "Pode seguir com esse atendimento?"
  ].filter(Boolean).join("\n");
}

function siteBodyName(body = {}) {
  return body.nome || body.name || body.customerName || body.customer?.name || "Cliente";
}

function siteBodyPhone(body = {}) {
  return body.whatsapp || body.telefone || body.phone || body.customer?.phone || "";
}

function siteBodyDate(body = {}) {
  return body.data || body.date || body.eventDate || "";
}

function siteBodyPeople(body = {}) {
  return body.pessoas || body.quantidade_pessoas || body.people || body.guests || "";
}

function siteBodyPlace(body = {}) {
  return body.local || body.endereco || body.address || body.bairro || "";
}

function siteBodyNotes(body = {}) {
  return body.observacoes || body.notes || body.observacao || body.message || body.text || formatRequestItems(body.items || body.itens) || "";
}

function normalizeInsanoEventPayload(body = {}) {
  const endValue = body.horarioTermino || body.endsAt || body.endTime || body.termino || "";
  const normalizedEnd = normalizeSiteText(endValue);
  const originalPhone = normalizeSitePhone(body.telefoneOriginal || body.originalPhone || body.conversationPhone || body.from || body.phoneFromConversation || "");
  const contactPhone = normalizeSitePhone(body.telefone || body.whatsapp || body.phone || body.customer?.phone || "");
  const endUndefined = normalizedEnd.includes("definir") || body.endTimeUndefined === true || body.terminoADefinir === "sim" || body.terminoADefinir === true;
  return {
    conversationId: cleanSiteOrderText(body.conversationId || body.conversaId || ""),
    name: cleanSiteOrderText(body.nome || body.name || body.customerName || ""),
    originalPhone: originalPhone || contactPhone,
    phone: contactPhone,
    date: normalizeEventDate(body.dataEvento || body.data || body.date || body.eventDate || ""),
    location: cleanSiteOrderText(body.local || body.endereco || body.location || body.place || ""),
    city: cleanSiteOrderText(body.cidade || body.city || ""),
    environmentType: normalizeEnvironmentType(body.tipoAmbiente || body.tipo_ambiente || body.environmentType || body.ambiente || ""),
    product: cleanSiteOrderText(body.produto || body.product || body.item || ""),
    people: Number(body.publicoPrevisto || body.pessoas || body.people || body.quantidade_pessoas || 0) || null,
    startsAt: cleanSiteOrderText(body.horarioInicio || body.startsAt || body.startTime || body.inicio || ""),
    endsAt: endUndefined ? "" : cleanSiteOrderText(endValue),
    endTimeUndefined: endUndefined,
    notes: cleanSiteOrderText(body.duvidasObservacoes || body.observacoes || body.notes || body.message || ""),
    submittedAt: body.submittedAt || new Date().toISOString()
  };
}

function validateInsanoEventPayload(payload = {}, kind = "evento") {
  const errors = [];
  if (!payload.name) errors.push({ field: "nome", error: "required" });
  if (!payload.date || !isValidIsoDate(payload.date)) errors.push({ field: "dataEvento", error: "invalid_date" });
  else if (payload.date < todayIsoDate()) errors.push({ field: "dataEvento", error: "past_date" });
  if (!payload.location) errors.push({ field: "local", error: "required" });
  if (!payload.city) errors.push({ field: "cidade", error: "required" });
  if (!payload.environmentType) errors.push({ field: "tipoAmbiente", error: "required" });
  if (kind === "orcamento" && !payload.product) errors.push({ field: "produto", error: "required" });
  if (kind === "orcamento" && (!Number.isInteger(payload.people) || payload.people < 50)) errors.push({ field: "quantidadePorcoes", error: "min_50_required" });
  if (!Number.isInteger(payload.people) || payload.people <= 0) errors.push({ field: "publicoPrevisto", error: "positive_integer_required" });
  if (!isValidTime(payload.startsAt)) errors.push({ field: "horarioInicio", error: "invalid_time" });
  if (!payload.endTimeUndefined && !isValidTime(payload.endsAt)) errors.push({ field: "horarioTermino", error: "required_or_a_definir" });
  if (!payload.phone || payload.phone.length < 10) errors.push({ field: "telefone", error: "usable_phone_required" });
  return { ok: errors.length === 0, errors };
}

function normalizeEnvironmentType(value = "") {
  const normalized = normalizeSiteText(value).replace(/\s+/g, "_");
  if (["ao_ar_livre", "aberto", "ambiente_aberto", "externo"].includes(normalized)) return "ao_ar_livre";
  if (["fechado", "ambiente_fechado", "interno"].includes(normalized)) return "fechado";
  return "";
}

function environmentTypeLabel(value = "") {
  return value === "ao_ar_livre" ? "Ao ar livre" : value === "fechado" ? "Ambiente fechado" : "Não informado";
}

function normalizeEventDate(value = "") {
  const text = cleanSiteOrderText(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!br) return text;
  return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
}

function actorFromRequest(req = {}) {
  const user = req.sambahUser || {};
  return {
    id: user.id || user.username || "mock",
    username: user.username || "mock",
    name: user.displayName || user.name || user.username || "mock",
    displayName: user.displayName || user.name || user.username || "mock",
    role: user.role || "ADMIN",
    phone: user.phone || user.operatorPhone || "5551980413745"
  };
}

async function runConversationAction(service, action, id, actor, { expectedVersion = null, targetOperatorPhone = "" } = {}) {
  if (action === "read") return service.markRead(id, actor);
  if (action === "unread") return service.markUnread(id, actor);
  if (action === "claim") return service.claimConversation(id, actor, { expectedVersion });
  if (action === "release") return service.releaseConversation(id, actor);
  if (action === "transfer") return service.transferConversation(id, actor, { phone: targetOperatorPhone }, { expectedVersion });
  if (action === "resolve") return service.resolveConversation(id, actor, { expectedVersion });
  if (action === "reopen") return service.reopenConversation(id, actor, { expectedVersion });
  if (action === "waiting") return service.markWaitingCustomer(id, actor, { expectedVersion });
  if (action === "archive") return service.archiveConversation(id, actor, { expectedVersion });
  return { ok: false, statusCode: 404, error: "conversation_action_not_found" };
}

function auditTypeForConversationAction(action = "") {
  return {
    read: "conversation_read",
    unread: "conversation_marked_unread",
    claim: "conversation_claimed",
    release: "conversation_released",
    transfer: "conversation_transferred",
    resolve: "conversation_resolved",
    reopen: "conversation_reopened",
    waiting: "conversation_waiting_customer",
    archive: "conversation_archived"
  }[action] || "conversation_action";
}

async function maybeCreateHumanAlert(result = {}, { whatsappConversationService, callCenterService, auditService } = {}) {
  if (!callCenterService || result.duplicate === true) return null;
  const conversation = result.conversa;
  if (!conversation || !["humano", "em_atendimento"].includes(conversation.status)) return null;
  const alert = await callCenterService.createAlert({ conversation, operator: {
    name: conversation.assignedOperatorName || "Equipe",
    phone: conversation.assignedOperatorPhone || "5551980413745"
  } });
  if (alert?.alert && whatsappConversationService?.patchConversation) {
    await whatsappConversationService.patchConversation(conversation.id, {
      assignedOperatorPhone: conversation.assignedOperatorPhone || "",
      assignedOperatorName: conversation.assignedOperatorName || "",
      callCenterStatus: alert.alert.deliveryStatus || ""
    });
  }
  await safeAuditRecord(auditService, {
    type: "conversation_human_alert",
    status: alert?.alert?.realIntegrated ? "info" : "warning",
    source: "call_center",
    message: "Alerta humano processado",
    context: {
      conversationId: conversation.id || "",
      deliveryStatus: alert?.alert?.deliveryStatus || "",
      realIntegrated: Boolean(alert?.alert?.realIntegrated)
    },
    dedupeKey: alert?.alert?.eventKey || undefined
  });
  return alert;
}

function normalizeEventRequestId(value = "", conversationId = "", payload = {}) {
  const clean = cleanSiteOrderText(value);
  if (clean) return clean;
  const base = [conversationId, payload.date, payload.location, payload.city, payload.people, payload.startsAt, payload.phone].join("|");
  return `event_${crypto.createHash("sha256").update(base).digest("hex").slice(0, 24)}`;
}

function isValidIsoDate(value = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isValidTime(value = "") {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function buildConversationUrl(conversationId = "", runtimeConfig = getRuntimeConfig()) {
  const base = getEventPublicOrigin(runtimeConfig) || String(runtimeConfig.publicBaseUrl || runtimeConfig.baseUrl || "https://insanofoodtruck.com.br").replace(/\/$/, "");
  return conversationId ? `${base}/conversas?conversationId=${encodeURIComponent(conversationId)}` : `${base}/conversas`;
}

function getEventPublicOrigin(runtimeConfig = getRuntimeConfig()) {
  try {
    const configured = String(runtimeConfig.eventFormPublicUrl || "").trim();
    if (!configured) return "";
    return new URL(configured).origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizeEventConversationId(conversationId = "", phone = "") {
  const clean = String(conversationId || "").trim();
  if (clean.startsWith("wa_")) return clean;
  const digits = String(clean || phone || "").replace(/\D/g, "");
  return digits ? `wa_${digits}` : clean;
}

async function ensureEventConversation(whatsappConversationService, payload = {}, conversationId = "", kind = "evento") {
  const labels = insanoRequestKindLabels(kind);
  if (!whatsappConversationService || !payload.originalPhone) return null;
  const existing = conversationId ? await whatsappConversationService.get?.(conversationId) : null;
  if (existing?.ok) return existing;
  return whatsappConversationService.recordNeutralIncoming?.({
    from: payload.originalPhone,
    telefone: payload.originalPhone,
    nome: payload.name || "Cliente WhatsApp",
    text: `${labels.internalTitle} enviada pelo formulario do Insano Food Truck.`,
    messageId: `insano-event-form-${crypto.randomUUID()}`
  });
}

async function sendEventWhatsappReturn({ whatsappProvider, runtimeConfig = getRuntimeConfig(), phone = "", message = null } = {}) {
  const canSend = Boolean(runtimeConfig.whatsappBusiness?.sendEnabled && whatsappProvider?.sendMessage && phone && message);
  if (!canSend) return { ok: false, sent: false, status: "registrada_sem_envio", metaMessageType: message?.type || "menu" };
  return whatsappProvider.sendMessage({ to: phone, message });
}

async function safeSendEventWhatsappReturn(args = {}) {
  try {
    return await sendEventWhatsappReturn(args);
  } catch (error) {
    return {
      ok: false,
      sent: false,
      status: "whatsapp_return_failed",
      metaMessageType: args.message?.type || "menu",
      error: sanitizeEventSendError(error)
    };
  }
}

function sanitizeEventSendError(error = "") {
  return String(error?.message || error || "whatsapp_return_failed")
    .replace(/Bearer\s+\S+/gi, "Bearer [masked]")
    .replace(/(access_token=)[^&\s]+/gi, "$1[masked]")
    .replace(/(token|authorization|secret|password|senha)\s*[:=]\s*["']?[^"',\s}]+/gi, "$1: [masked]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[masked]")
    .slice(0, 300);
}

function insanoRequestKindLabels(kind = "evento") {
  if (kind === "orcamento") {
    return {
      origin: "WHATSAPP_PORTAL_INSANO_FOODTRUCK_ORCAMENTO",
      formType: "insano_food_truck_orcamento",
      subjectPrefix: "[NOVO ORCAMENTO]",
      internalTitle: "Nova solicitacao de orcamento",
      receivedText: "Recebemos tua solicitacao de orcamento.",
      teamAction: "Nossa equipe vai preparar o orcamento e responder nesta mesma conversa.",
      emailOpening: "Nova solicitacao de orcamento recebida pelo SamBah",
      emailOrigin: "WhatsApp - Portal Insano - Insano Food Truck - Orcamento",
      amountLabel: "Quantidade de porcoes",
      amountUnit: "porcoes",
      confirmationText: "Recebemos as informacoes do teu orcamento. Nossa equipe vai preparar o orcamento e responder na mesma conversa do WhatsApp."
    };
  }
  return {
    origin: "WHATSAPP_PORTAL_INSANO_FOODTRUCK_EVENTO",
    formType: "insano_food_truck_evento",
    subjectPrefix: "[NOVO EVENTO]",
    internalTitle: "Nova solicitacao de evento",
    receivedText: "Recebemos tua solicitacao de evento.",
    teamAction: "Nossa equipe vai verificar a agenda e responder nesta mesma conversa.",
    emailOpening: "Nova solicitacao de evento recebida pelo SamBah",
    emailOrigin: "WhatsApp - Portal Insano - Insano Food Truck - Evento",
    amountLabel: "Publico previsto",
    amountUnit: "pessoas",
    confirmationText: "Recebemos as informacoes do teu evento. Nossa equipe vai verificar a agenda e responder na mesma conversa do WhatsApp."
  };
}

function buildInsanoEventWhatsappReturn(payload = {}, kind = "evento") {
  const labels = insanoRequestKindLabels(kind);
  return [
    labels.receivedText,
    "",
    `Data: ${formatBrazilianDate(payload.date)}`,
    `Cidade: ${payload.city || ""}`,
    kind === "orcamento" ? `Produto: ${payload.product || ""}` : "",
    `${labels.amountLabel}: ${payload.people || ""} ${labels.amountUnit}`,
    "",
    labels.teamAction
  ].join("\n");
}

function buildInsanoEventInternalSummary(payload = {}, kind = "evento") {
  const labels = insanoRequestKindLabels(kind);
  return [
    labels.internalTitle,
    "",
    `Nome: ${payload.name}`,
    `Data: ${formatBrazilianDate(payload.date)}`,
    `Local: ${payload.location}`,
    `Cidade: ${payload.city}`,
    `Ambiente: ${environmentTypeLabel(payload.environmentType)}`,
    kind === "orcamento" ? `Produto: ${payload.product || ""}` : "",
    `${labels.amountLabel}: ${payload.people} ${labels.amountUnit}`,
    `Horario de inicio: ${payload.startsAt}`,
    `Horario de termino: ${payload.endTimeUndefined ? "A definir" : payload.endsAt}`,
    `Telefone de contato: ${payload.phone}`,
    `Observacoes: ${payload.notes || "Sem observacoes"}`,
    "Status: Aguardando analise"
  ].join("\n");
}

function buildInsanoEventConfirmation(kind = "evento") {
  const labels = insanoRequestKindLabels(kind);
  return {
    title: "Solicitacao enviada",
    text: labels.confirmationText,
    status: "AGUARDANDO_ANALISE",
    kind
  };
}

function buildInsanoEventEmailAlert({ payload = {}, leadId = "", eventRequestId = "", conversationId = "", conversationUrl = "", kind = "evento" } = {}) {
  const labels = insanoRequestKindLabels(kind);
  const date = formatBrazilianDate(payload.date);
  const city = payload.city || "";
  const people = payload.people || "";
  const subjectDetail = kind === "orcamento" && payload.product ? payload.product : `${people} ${labels.amountUnit}`;
  const subject = `${labels.subjectPrefix} ${date} \u2014 ${city} \u2014 ${subjectDetail}`;
  const endTime = payload.endTimeUndefined ? "A definir" : payload.endsAt;
  const body = [
    labels.emailOpening,
    "",
    "Nome:",
    payload.name || "",
    "",
    "Data:",
    date,
    "",
    "Local ou endereco:",
    payload.location || "",
    "",
    "Cidade:",
    city,
    "",
    "Tipo de ambiente:",
    environmentTypeLabel(payload.environmentType),
    "",
    ...(kind === "orcamento" ? ["Produto:", payload.product || "", ""] : []),
    `${labels.amountLabel}:`,
    people ? `${people} ${labels.amountUnit}` : "",
    "",
    "Horario de inicio:",
    payload.startsAt || "",
    "",
    "Horario de termino:",
    endTime || "",
    "",
    "Telefone de contato:",
    payload.phone || "",
    "",
    "Observacoes:",
    payload.notes || "Sem observacoes",
    "",
    "Origem:",
    labels.emailOrigin,
    "",
    "Status:",
    "Aguardando analise da equipe",
    "",
    "ABRIR CONVERSA NO SAMBAH:",
    conversationUrl,
    "",
    `conversationId: ${conversationId}`,
    `eventRequestId: ${eventRequestId || leadId}`
  ].join("\n");
  return {
    to: "chefnenogutterres@gmail.com,kdoiegutterresgastronomia@gmail.com",
    subject,
    body,
    conversationUrl,
    leadId,
    eventRequestId: eventRequestId || leadId,
    conversationId
  };
}

function isHumanConversation(conversa = {}) {
  return normalizeSiteText(conversa?.status || "") === "humano" || normalizeSiteText(conversa?.serviceState || "") === "humano";
}

function formatBrazilianDate(value = "") {
  const iso = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : String(value || "");
}

function normalizeSitePhone(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function normalizeSiteText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeSitePedidoItems(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, error: "Informe pelo menos um item do pedido" };
  }
  const normalized = [];
  for (const item of items) {
    const nome = cleanSiteOrderText(item?.nome || item?.name || item?.product || item?.productId);
    if (!nome) return { ok: false, error: "Informe o nome de todos os itens" };

    const quantidade = Number(item?.quantidade ?? item?.quantity ?? item?.qty ?? 1);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return { ok: false, error: "Informe uma quantidade valida para todos os itens" };
    }

    const preco = normalizeSitePedidoTotal(item?.preco ?? item?.price ?? item?.valor);
    const observacao = cleanSiteOrderText(item?.observacao || item?.note || item?.observacoes || item?.notes);
    normalized.push({
      nome,
      name: nome,
      quantidade,
      quantity: quantidade,
      preco,
      price: preco,
      observacao,
      note: observacao
    });
  }
  return { ok: true, items: normalized };
}

function buildSitePedidoWhatsappMessage({ pedidoId, nome, telefone, operation, itens, formaEntrega, endereco, horario, formaPagamento, observacoes, status, mesa }) {
  const itemLines = formatSitePedidoWhatsappItems(itens);
  const tipoAtendimento = formatTipoAtendimento(formaEntrega);
  const details = [];
  if (tipoAtendimento) details.push(`Tipo de atendimento: ${tipoAtendimento}`);
  if (mesa) details.push(`Mesa: ${mesa}`);
  if (horario) details.push(`Horario de retirada: ${horario}`);
  if (endereco) details.push(`Endereco ou bairro: ${endereco}`);
  if (formaPagamento) details.push(`Pagamento: ${formaPagamento}`);
  if (observacoes) details.push(`Observações: ${observacoes}`);

  return [
    "🍔 Olá, equipe Insano!",
    "Sou o SamBah e organizei um novo atendimento pelo Portal Insano.",
    "",
    "Pedido:",
    `ID: ${pedidoId || ""}`,
    `Cliente: ${nome || ""}`,
    telefone ? `WhatsApp: ${telefone}` : "",
    `Operação: ${operation || "Insano"}`,
    details.join("\n"),
    "",
    "Itens:",
    itemLines,
    "",
    `Status: ${status === "novo" ? "aguardando confirmação da equipe" : status || "aguardando confirmação da equipe"}`,
    "",
    "Pode dar sequência nesse atendimento?"
  ].filter(Boolean).join("\n");
}

function formatTipoAtendimento(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["delivery", "entrega"].includes(normalized)) return "Delivery";
  if (["retirar", "retirada"].includes(normalized)) return "Retirar";
  if (["mesa", "local", "consumir no local", "estou no local"].includes(normalized)) return "Estou no local";
  if (["evento", "grande pedido", "evento / grande pedido"].includes(normalized)) return "Evento / Grande Pedido";
  return value;
}

function formatSitePedidoWhatsappItems(items = []) {
  if (!Array.isArray(items) || !items.length) return "- Item sem nome";
  return items.map((item) => {
    const quantidade = Number(item.quantidade || item.quantity || item.qty) || 1;
    const nome = item.nome || item.name || item.product || item.productId || "Item sem nome";
    return `- ${quantidade}x ${nome}`;
  }).join("\n");
}

// wa.me apenas abre a conversa com a mensagem pronta. Ele nao envia resposta automatica;
// resposta automatica real depende da WhatsApp Business Cloud API ligada ao webhook.
function buildSitePedidoWhatsappUrl(message) {
  const number = String(getRuntimeConfig().insanoWhatsappNumber || "").replace(/\D/g, "");
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function escapeStatusHtml(value = "") {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function buildStorageStatus(crmService) {
  const runtime = getRuntimeConfig();
  const dataDir = resolveStorageDataDir(crmService, runtime.dataDir);
  const status = {
    ok: true,
    dataDir,
    ambiente: runtime.nodeEnv,
    persistenciaConfigurada: isPersistenceConfigured(runtime, dataDir),
    arquivosEncontrados: [],
    filesFound: [],
    totais: {
      leads: 0,
      atendimentos: 0,
      eventos: 0,
      precomandas: 0,
      oportunidades: 0,
      pedidosSite: 0,
      bloqueiosEstoque: 0
    }
  };

  try {
    await mkdir(dataDir, { recursive: true });
    const entries = await readdir(dataDir, { withFileTypes: true });
    status.arquivosEncontrados = await Promise.all(entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = join(dataDir, entry.name);
        const info = await stat(filePath);
        return { name: entry.name, bytes: info.size, updatedAt: info.mtime.toISOString() };
      }));
    status.filesFound = status.arquivosEncontrados;
  } catch (error) {
    status.ok = false;
    status.storageError = error.message;
  }

  const [leads, atendimentos, eventos, precomandas, oportunidades] = await Promise.all([
    crmService.listarLeads(),
    crmService.listarAtendimentos(),
    crmService.listarEventos(),
    crmService.listarPrecomandas(),
    crmService.listarOportunidades()
  ]);
  status.totais.leads = leads.items.length;
  status.totais.atendimentos = atendimentos.items.length;
  status.totais.eventos = eventos.items.length;
  status.totais.precomandas = precomandas.items.length;
  status.totais.oportunidades = oportunidades.items.length;
  status.totais.pedidosSite = precomandas.items.filter(isSiteOrderForMesa).length;
  status.totais.bloqueiosEstoque = precomandas.items.filter((item) => item.status === "bloqueado_estoque" || item.bloqueio_mesa).length;
  status.totalLeads = status.totais.leads;
  status.totalPrecomandas = status.totais.precomandas;
  status.totalOportunidades = status.totais.oportunidades;
  return status;
}

function resolveStorageDataDir(crmService, fallback) {
  const files = Object.values(crmService.files || {}).filter(Boolean);
  if (files.length) return dirname(files[0]);
  return fallback;
}

function isPersistenceConfigured(runtime, dataDir) {
  const configured = Boolean(globalThis.process?.env?.DATA_DIR);
  const normalizedRuntimeDir = String(runtime.dataDir || "").replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedDataDir = String(dataDir || "").replace(/\\/g, "/").replace(/\/$/, "");
  if (!configured) return false;
  return !["data", "./data"].includes(normalizedRuntimeDir) && !/\/opt\/render\/project\/src\/data$/.test(normalizedDataDir);
}
async function renderPedidoStatusPage(crmService, id) {
  const precomandas = await crmService.listarPrecomandas();
  const pedido = precomandas.items.find((item) => item.id === id);
  const status = pedido?.status || "aguardando_confirmacao";
  const nome = pedido?.nome || pedido?.customerName || "Cliente";
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Status do pedido SamBah</title>
  <link rel="stylesheet" href="/portal.css">
</head>
<body>
  <main class="portal-shell">
    <section class="portal-card status-page">
      <h1>Pedido recebido</h1>
      <p>Aguardando confirmação</p>
      <div class="status-summary">
        <div><span>Pedido</span><strong>${escapeStatusHtml(id)}</strong></div>
        <div><span>Cliente</span><strong>${escapeStatusHtml(nome)}</strong></div>
        <div><span>Status</span><strong>${escapeStatusHtml(status)}</strong></div>
        <div><span>WhatsApp</span><strong>aberto para atendimento</strong></div>
      </div>
      <p>Proximo passo: equipe confirma o pedido.</p>
      <a class="choice-link" href="/">Voltar ao início</a>
    </section>
  </main>
</body>
</html>`;
  return { statusCode: pedido ? 200 : 404, html };
}

function cleanSiteOrderText(value = "") {
  return String(value || "").trim();
}

function normalizeSitePedidoTotal(value) {
  const total = Number(value || 0);
  return Number.isFinite(total) ? total : 0;
}

function formatSitePedidoMoney(value) {
  const amount = normalizeSitePedidoTotal(value);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatRequestItems(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((item) => `${item.quantity || item.qty || item.quantidade || 1}x ${item.name || item.nome || item.product || item.productId || ""}`).join("; ");
}

function validatePreOrderPayload(body) {
  const missing = [];
  if (!body.customer?.name) missing.push("nome do cliente");
  if (!body.customer?.phone) missing.push("WhatsApp");
  if (!body.customer?.serviceType) missing.push("tipo de atendimento");
  if (!body.customer?.paymentMethod) missing.push("forma de pagamento");
  if (body.customer?.serviceType === "entrega" && !body.customer?.address) missing.push("endereço");
  if (!Array.isArray(body.items) || !body.items.length) missing.push("pelo menos 1 item");
  return { ok: missing.length === 0, missing };
}

function buildPreOrderMesaOrder(body, sambahOrderId) {
  const items = body.items.map((item) => ({
    quantity: Number(item.quantity) || 1,
    qty: Number(item.quantity) || 1,
    name: item.name,
    product: item.name,
    note: item.note || ""
  }));
  const notes = [
    `Pré-comanda SamBah - ${body.operation}`,
    `Tipo: ${body.customer?.serviceType || ""}`,
    `Pagamento: ${body.customer?.paymentMethod || ""}`,
    body.customer?.address ? `Endereço: ${body.customer.address}` : "",
    body.notes || ""
  ].filter(Boolean).join("\n");

  return {
    ...buildMesaOrder({
      eventId: sambahOrderId,
      customer: body.customer,
      items,
      notes
    }),
    source: "site",
    channel: "sambah",
    origin: "SamBah",
    operation: body.operation,
    order: {
      type: "pre_order",
      table: null,
      items,
      notes,
      total: null
    },
    status: "confirmed_by_customer"
  };
}

function extractMesaOrderId(mesaResult = {}) {
  return mesaResult.mesaResponse?.id
    || mesaResult.mesaResponse?.orderId
    || mesaResult.mesaResponse?.externalId
    || null;
}

function verifyMetaWebhookSignature(req, rawBody = Buffer.alloc(0), config = getRuntimeConfig()) {
  if (config.whatsappBusiness?.signatureRequired !== true) return { ok: true, skipped: true };
  const secret = config.whatsappBusiness?.webhookSecret || "";
  if (!secret) return { ok: false, error: "meta_signature_configuration_incomplete" };
  const received = String(req.headers["x-hub-signature-256"] || "");
  if (!received) return { ok: false, error: "meta_signature_missing" };
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return { ok: false, error: "meta_signature_invalid" };
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ? { ok: true }
    : { ok: false, error: "meta_signature_invalid" };
}

async function recordSignatureFailure(auditService, result = {}, path = "") {
  await safeAuditRecord(auditService, {
    type: "meta_webhook_signature_rejected",
    status: "warning",
    source: "meta_whatsapp",
    message: "Webhook Meta rejeitado por assinatura",
    context: {
      path,
      reason: result.error || "meta_signature_invalid"
    }
  });
}

async function readJson(req, { requireBody = false, includeRaw = false, maxBytes = 0 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (maxBytes > 0 && size > maxBytes) {
      throw httpError(413, "payload_too_large", "Payload acima do limite permitido");
    }
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks);
  const raw = rawBody.toString("utf8").trim();
  if (!raw) {
    if (!requireBody) return includeRaw ? { body: {}, rawBody } : {};
    throw httpError(400, "empty_body", "Body JSON vazio");
  }
  try {
    const body = JSON.parse(raw);
    return includeRaw ? { body, rawBody } : body;
  } catch (error) {
    throw httpError(400, "invalid_json", "JSON invalido", error);
  }
}

async function serveStatic(res, fileName) {
  const safeName = normalize(fileName).replace(/^(\.\.[/\\])+/, "");
  const filePath = safeName.startsWith("brand/") || safeName.startsWith("brand\\") || safeName.startsWith("favicon.")
    ? join(publicDir, "assets", safeName)
    : join(publicDir, safeName);
  try {
    const body = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
    const headers = { "content-type": contentType };
    if ([".html", ".js", ".css"].includes(extname(filePath))) {
      headers["cache-control"] = "no-cache, no-store, must-revalidate";
      headers.pragma = "no-cache";
      headers.expires = "0";
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendJson(res, 404, { error: "asset_not_found" });
    }
    throw error;
  }
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirectToLogin(res, from = "/admin") {
  res.writeHead(302, { location: `/login?next=${encodeURIComponent(from)}` });
  res.end();
}

function verifyMesaCatalogAuthorization(req, configuredToken = "") {
  const expected = String(configuredToken || "");
  if (!expected) return { ok: false, statusCode: 503, error: "mesa_catalog_token_not_configured" };
  const authorization = String(req.headers.authorization || "");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const received = String(req.headers["x-mesa-token"] || bearer || "");
  if (!received) return { ok: false, statusCode: 401, error: "mesa_catalog_authorization_required" };
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, statusCode: 403, error: "mesa_catalog_authorization_invalid" };
  }
  return { ok: true };
}

async function resolveXeriffePublicSession(req, res, service) {
  const cookies = String(req.headers.cookie || "").split(";").reduce((result, part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return result;
    result[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    return result;
  }, {});
  const session = await service.ensureSession(cookies.xeriffe_cart || "");
  if (session.created) {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
    const secure = forwardedProto === "https" ? "; Secure" : "";
    res.setHeader("set-cookie", `xeriffe_cart=${encodeURIComponent(session.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=14400${secure}`);
  }
  return session;
}

function publicAuditEvent(event = {}) {
  const context = event.context && typeof event.context === "object" ? event.context : {};
  const route = context.path || context.route || context.url || context.endpoint || null;
  const action = context.action || context.permission || context.eventType || null;
  return {
    timestamp: sanitizeAuditText(event.createdAt || event.timestamp || ""),
    event: sanitizeAuditText(event.type || "system_event"),
    username: sanitizeAuditText(context.username || context.actor || context.user || ""),
    role: sanitizeAuditText(context.role || ""),
    source: sanitizeAuditText(context.source || event.source || ""),
    action: sanitizeAuditText(action || ""),
    status: sanitizeAuditText(event.status || ""),
    route: sanitizeAuditText(route || ""),
    method: sanitizeAuditText(context.method || ""),
    reason: sanitizeAuditText(context.reason || event.message || event.error?.message || ""),
    targetUsername: sanitizeAuditText(context.targetUsername || ""),
    targetRole: sanitizeAuditText(context.targetRole || "")
  };
}

function sanitizeAuditText(value = "") {
  return String(value || "")
    .replace(/password/gi, "credential")
    .replace(/senha/gi, "credencial")
    .replace(/hash/gi, "digest")
    .replace(/salt/gi, "nonce")
    .replace(/cookie/gi, "session")
    .replace(/token/gi, "credential")
    .replace(/secret/gi, "private")
    .replace(/segredo/gi, "privado")
    .slice(0, 240);
}

function safeAuditUsername(username = "") {
  return String(username || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 80);
}

function maskPhone(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function requireAdminUser(req, activeAuthMode) {
  if (activeAuthMode === "mock") return { ok: true };
  if (!req.sambahUser) return { ok: false, statusCode: 401, error: "auth_required" };
  if (req.sambahUser.role !== "ADMIN") return { ok: false, statusCode: 403, error: "admin_required" };
  return { ok: true };
}

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return;
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (!res.hasHeader("access-control-allow-origin")) {
    Object.assign(headers, corsHeaders());
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function corsHeaders(origin = "") {
  const headers = {
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-mesa-token"
  };
  headers["access-control-allow-origin"] = origin && isAllowedCorsOrigin(origin) ? origin : "*";
  return headers;
}

async function safeAuditRecord(auditService, event) {
  try {
    return await auditService.record(event);
  } catch (error) {
    console.error("[samBah audit]", error);
    return { event: null, duplicated: false, error };
  }
}

function manualSendFailureDiagnostic(result = {}) {
  const providerError = result.sendResult?.response?.error || {};
  return maskSensitive({
    status: result.reason || result.sendResult?.status || result.message?.status || "send_failed",
    httpStatus: result.sendResult?.httpStatus || result.message?.httpStatus || null,
    metaCode: providerError.code || result.message?.errorCode || "",
    metaSubcode: providerError.error_subcode || "",
    metaType: providerError.type || "",
    metaMessage: providerError.message || result.message?.errorMessage || result.sendResult?.error || "",
    metaDetails: providerError.error_data?.details || "",
    manualSendId: result.message?.manualSendId || ""
  });
}

async function safeCrmRecord(crmService, payload) {
  try {
    if (!crmService) return null;
    return await crmService.registrarAtendimentoComercial(payload);
  } catch (error) {
    console.error("[samBah crm]", error);
    return { ok: false, error: "crm_record_failed" };
  }
}

async function handleCrmLeadAction(crmService, leadId, action, body = {}) {
  if (!crmService) return { ok: false, error: "crm_service_unavailable" };
  if (action === "mark-contacted") return crmService.marcarLeadContatado(leadId);
  if (action === "mark-quote-sent") return crmService.marcarLeadOrcamentoEnviado(leadId);
  if (action === "mark-won") return crmService.marcarLeadFechado(leadId, body.valorFechado || body.valor_fechado || body.valor_estimado);
  if (action === "mark-lost") return crmService.marcarLeadPerdido(leadId, body.motivo_perda || body.lossReason || "outro");
  return { ok: false, error: "unknown_commercial_action", action };
}

function summarizeCrmResult(result) {
  if (!result) return null;
  return {
    ok: Boolean(result.ok),
    clienteId: result.cliente?.id || null,
    leadId: result.lead?.id || null,
    atendimentoId: result.atendimento?.id || null,
    eventoId: result.evento?.id || null,
    precomandaId: result.precomanda?.id || null,
    interesse: result.interesse || null,
    whatsappUrl: result.whatsappUrl || null
  };
}

function httpError(statusCode, code, message, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function formatDraftSummary(draft) {
  if (!draft.items?.length) return draft.rawText || "Pedido sem item confirmado";
  return draft.items.map((item) => {
    const note = item.note ? ` (${item.note})` : "";
    return `${item.qty || 1}x ${item.name || item.productId}${note}`;
  }).join("\n");
}

function buildCommitVersion() {
  return process.env.RENDER_GIT_COMMIT
    || process.env.GIT_COMMIT
    || process.env.COMMIT_SHA
    || process.env.SOURCE_VERSION
    || "";
}

function buildAppVersion() {
  return process.env.APP_VERSION || packageJson.version || "guided-event-flow-state";
}

const isCliRun = globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href;

if (isCliRun) {
  const port = getRuntimeConfig().port;
  const reset = await resetTestHistoryOnce({ dataDir: getRuntimeConfig().dataDir });
  console.log("sambah.test_history_reset", { applied: reset.applied, resetId: reset.resetId, files: reset.resetFiles?.length || 0 });
  createApp().listen(port, () => {
    console.log(`samBah! admin em http://localhost:${port}/admin`);
  });
}
