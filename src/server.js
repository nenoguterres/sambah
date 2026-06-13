import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AuditService } from "./auditService.js";
import { CrmService } from "./crmService.js";
import { EventScheduleService } from "./eventScheduleService.js";
import { buildMesaOrder, MesaIntegrationService } from "./mesaIntegrationService.js";
import { MenuSyncService } from "./menuSyncService.js";
import { OrderDraftService } from "./orderDraftService.js";
import { OrderTrackingService } from "./orderTrackingService.js";
import { SambahConversationService } from "./sambahConversationService.js";
import { getPublicConfig, getRuntimeConfig, isAllowedCorsOrigin } from "./config.js";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const runtimeConfig = getRuntimeConfig();
const dataFile = (name) => join(runtimeConfig.dataDir, name);
const audit = new AuditService({ filePath: dataFile("audit-logs.json") });
const mesa = new MesaIntegrationService({ queueFile: dataFile("mesa-queue.json") });
const menu = new MenuSyncService({ cacheFile: dataFile("menu-cache.json") });
const conversation = new SambahConversationService({ scriptsFile: dataFile("sambah-scripts.json") });
const drafts = new OrderDraftService({ draftsFile: dataFile("order-drafts.json"), rulesFile: dataFile("sambah-menu-rules.json") });
const events = new EventScheduleService({ leadsFile: dataFile("event-leads.json"), servicesFile: dataFile("insano-services.json") });
const tracking = new OrderTrackingService({ filePath: dataFile("order-tracking.json") });
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
  conversationService = conversation,
  draftService = drafts,
  eventService = events,
  trackingService = tracking,
  crmService = crm
} = {}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");

      const requestCorsHeaders = corsHeaders(req.headers.origin);
      for (const [header, value] of Object.entries(requestCorsHeaders)) {
        res.setHeader(header, value);
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, requestCorsHeaders);
        return res.end();
      }

      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { ok: true, service: "sambha-automacao-whats" });
      }

      if (req.method === "GET" && url.pathname === "/api/config") {
        return sendJson(res, 200, getPublicConfig());
      }

      if (req.method === "GET" && ["/", "/pedir", "/eventos", "/empresas", "/xeriffe", "/whatsapp"].includes(url.pathname)) {
        return serveStatic(res, "portal.html");
      }

      if (req.method === "GET" && url.pathname === "/sambah") {
        return serveStatic(res, "site.html");
      }

      if (req.method === "GET" && url.pathname === "/oportunidades") {
        return serveStatic(res, "oportunidades.html");
      }

      if (req.method === "GET" && url.pathname === "/admin") {
        return serveStatic(res, "admin.html");
      }

      if (req.method === "GET" && ["/crm", "/clientes", "/leads", "/atendimentos", "/eventos", "/precomandas"].includes(url.pathname)) {
        return serveStatic(res, "crm.html");
      }

      if (
        req.method === "GET"
        && (
          url.pathname === "/admin/qrcodes"
          || url.pathname === "/garcom"
          || url.pathname === "/cozinha"
          || url.pathname === "/evento/insano"
          || /^\/cardapio\/(insano|xeriffe)$/.test(url.pathname)
          || /^\/mesa\/(insano|xeriffe)\/\d+$/.test(url.pathname)
        )
      ) {
        return serveStatic(res, "platform.html");
      }

      if (req.method === "GET" && url.pathname === "/conteudo") {
        return serveStatic(res, "conteudo.html");
      }

      if (req.method === "GET" && ["/site.css", "/site.js", "/crm.css", "/crm.js", "/conteudo.css", "/platform.css", "/platform.js", "/oportunidades.css", "/oportunidades.js", "/portal.css", "/portal.js"].includes(url.pathname)) {
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
          context: { leadId: body.id, status: result.lead.status },
          dedupeKey: `event-update:${body.id}:${result.lead.updatedAt}`
        });
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/admin/events/leads/cancel") {
        const body = await readJson(req);
        const result = await eventService.cancelLead(body);
        if (!result.ok) return sendJson(res, result.error === "lead_not_found" ? 404 : 409, result);
        await auditService.record({
          type: "event_lead_canceled",
          status: "info",
          source: "agenda_insano",
          message: "Lead cancelado na Agenda Insano",
          context: { leadId: body.id },
          dedupeKey: `event-cancel:${body.id}`
        });
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/admin/events/services") {
        return sendJson(res, 200, await eventService.services());
      }

      if (req.method === "GET" && url.pathname === "/admin/events/stats") {
        return sendJson(res, 200, await eventService.stats());
      }

      if (req.method === "GET" && url.pathname === "/api/crm/resumo") {
        return sendJson(res, 200, await crmService.resumo());
      }

      if (req.method === "GET" && url.pathname === "/api/oportunidades") {
        return sendJson(res, 200, await crmService.listarOportunidades());
      }

      const oportunidadeMatch = url.pathname.match(/^\/api\/oportunidades\/([^/]+)\/(retornado|arquivar|nota)$/);
      if (req.method === "POST" && oportunidadeMatch) {
        const id = decodeURIComponent(oportunidadeMatch[1]);
        const action = oportunidadeMatch[2];
        const body = action === "nota" ? await readJson(req, { requireBody: false }) : {};
        const result = action === "retornado"
          ? await crmService.marcarOportunidadeRetornada(id)
          : action === "arquivar"
            ? await crmService.arquivarOportunidade(id)
            : await crmService.anotarOportunidade(id, body.nota || body.note || body.text || "");
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      if (req.method === "POST" && url.pathname === "/api/crm/atendimento") {
        const body = await readJson(req, { requireBody: true });
        const result = await crmService.registrarAtendimentoComercial(body);
        await safeAuditRecord(auditService, {
          type: "crm_atendimento_created",
          status: "info",
          source: "crm",
          message: "Atendimento comercial salvo no CRM SamBah",
          context: { clienteId: result.cliente?.id, leadId: result.lead?.id, interesse: result.interesse },
          dedupeKey: result.atendimento?.id
        });
        return sendJson(res, 201, result);
      }

      if (req.method === "GET" && url.pathname === "/api/site/cardapio") {
        return sendJson(res, 200, getInsanoSiteCardapio());
      }
      if (req.method === "POST" && url.pathname === "/api/site/lead") {
        const body = await readJson(req, { requireBody: true });
        const result = await createSiteLead(crmService, body);
        await safeAuditRecord(auditService, {
          type: "site_lead_created",
          status: "info",
          source: "site_api",
          message: "Lead externo salvo no CRM SamBah",
          context: { id: result.id, operation: result.operation, pipeline: result.pipeline },
          dedupeKey: result.id
        });
        return sendJson(res, 201, result);
      }

      if (req.method === "POST" && url.pathname === "/api/site/insano/lead") {
        const body = await readJson(req, { requireBody: true });
        const result = await createSiteLead(crmService, insanoSitePayload(body, { pipeline: body.pipeline || "food_truck_evento", tipo: "lead" }));
        await safeAuditRecord(auditService, {
          type: "insano_site_lead_created",
          status: "info",
          source: "insanofoodtruck.com.br",
          message: "Lead do site Insano salvo no CRM SamBah",
          context: { id: result.id, operation: result.operation, pipeline: result.pipeline },
          dedupeKey: result.id
        });
        return sendJson(res, 201, result);
      }

      if (req.method === "POST" && url.pathname === "/api/site/orcamento-evento") {
        const body = await readJson(req, { requireBody: true });
        const result = await createSiteEventQuote(crmService, body);
        await safeAuditRecord(auditService, {
          type: "site_event_quote_created",
          status: "info",
          source: "site_api",
          message: "Orcamento de evento externo salvo no CRM SamBah",
          context: { id: result.id, operation: result.operation, pipeline: result.pipeline },
          dedupeKey: result.id
        });
        return sendJson(res, 201, result);
      }

      if (req.method === "POST" && url.pathname === "/api/site/insano/evento") {
        const body = await readJson(req, { requireBody: true });
        const result = await createSiteEventQuote(crmService, insanoSitePayload(body, { pipeline: "orcamento_corporativo", tipo: "evento" }));
        await safeAuditRecord(auditService, {
          type: "insano_site_event_created",
          status: "info",
          source: "insanofoodtruck.com.br",
          message: "Orcamento de evento Insano salvo no CRM SamBah",
          context: { id: result.id, operation: result.operation, pipeline: result.pipeline },
          dedupeKey: result.id
        });
        return sendJson(res, 201, result);
      }

      const pedidoStatusMatch = url.pathname.match(/^\/pedido\/([^/]+)\/status$/);
      if (req.method === "GET" && pedidoStatusMatch) {
        const result = await renderPedidoStatusPage(crmService, decodeURIComponent(pedidoStatusMatch[1]));
        return sendHtml(res, result.statusCode, result.html);
      }

      if (req.method === "POST" && url.pathname === "/api/site/pedido") {
        const siteOrderConfig = getRuntimeConfig();
        if (siteOrderConfig.siteOrdersEnabled === false) {
          return sendJson(res, 503, { ok: false, error: "Pedidos do site estao desativados" });
        }
        if (siteOrderConfig.sitePublicToken && req.headers["x-site-token"] !== siteOrderConfig.sitePublicToken) {
          return sendJson(res, 401, { ok: false, error: "Token do site invalido" });
        }
        const body = await readJson(req, { requireBody: true });
        const result = await createSitePedido(crmService, body);
        return sendJson(res, result.ok ? 201 : 400, result);
      }

      if (req.method === "POST" && url.pathname === "/api/site/pedido-rapido") {
        const body = await readJson(req, { requireBody: true });
        const result = await createSiteQuickOrder(crmService, body);
        return sendJson(res, 201, result);
      }

      if (req.method === "POST" && url.pathname === "/api/site/insano/pedido") {
        const body = await readJson(req, { requireBody: true });
        const result = await createSiteQuickOrder(crmService, insanoSitePayload(body, { pipeline: "pedido_rapido", tipo: "pedido" }));
        return sendJson(res, 201, result);
      }

      if (req.method === "POST" && url.pathname === "/api/site/precomanda") {
        const body = await readJson(req, { requireBody: true });
        const result = await createSitePrecomanda(crmService, body);
        return sendJson(res, 201, result);
      }

      if (req.method === "POST" && url.pathname === "/api/site/whatsapp") {
        const body = await readJson(req, { requireBody: false });
        const result = await createSiteWhatsapp(crmService, body);
        await safeAuditRecord(auditService, {
          type: "site_whatsapp_requested",
          status: "info",
          source: "site_api",
          message: "WhatsApp externo solicitado",
          context: { operation: result.operation, pipeline: result.pipeline },
          dedupeKey: body.eventId || body.id
        });
        return sendJson(res, 201, result);
      }

      if (req.method === "POST" && url.pathname === "/api/site/insano/whatsapp") {
        const body = await readJson(req, { requireBody: false });
        const result = await createSiteWhatsapp(crmService, insanoSitePayload(body, { pipeline: "atendimento_humano", tipo: "whatsapp" }));
        await safeAuditRecord(auditService, {
          type: "insano_site_whatsapp_requested",
          status: "info",
          source: "insanofoodtruck.com.br",
          message: "WhatsApp externo do site Insano solicitado",
          context: { id: result.id, operation: result.operation, pipeline: result.pipeline },
          dedupeKey: body.eventId || body.id || result.id
        });
        return sendJson(res, 201, result);
      }

      if (req.method === "GET" && url.pathname === "/api/clientes") {
        return sendJson(res, 200, await crmService.listarClientes());
      }

      if (req.method === "POST" && url.pathname === "/api/clientes") {
        const body = await readJson(req, { requireBody: true });
        return sendJson(res, 201, await crmService.salvarCliente(body));
      }

      if (req.method === "GET" && url.pathname === "/api/leads") {
        return sendJson(res, 200, await crmService.listarLeads());
      }

      if (req.method === "POST" && url.pathname === "/api/leads") {
        const body = await readJson(req, { requireBody: true });
        return sendJson(res, 201, await crmService.salvarLead(body));
      }

      const leadConvertMatch = url.pathname.match(/^\/api\/crm\/leads\/([^/]+)\/convert-event$/);
      if (req.method === "POST" && leadConvertMatch) {
        const result = await crmService.converterLeadEmEvento(decodeURIComponent(leadConvertMatch[1]));
        await safeAuditRecord(auditService, {
          type: "crm_lead_converted_event",
          status: result.ok ? "info" : "warning",
          source: "crm",
          message: result.ok ? "Lead convertido em evento no CRM SamBah" : "Falha ao converter lead em evento",
          context: { leadId: decodeURIComponent(leadConvertMatch[1]), eventId: result.event?.id, duplicated: result.duplicated },
          dedupeKey: result.event?.id || decodeURIComponent(leadConvertMatch[1])
        });
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      const leadActionMatch = url.pathname.match(/^\/api\/crm\/leads\/([^/]+)\/(mark-contacted|mark-quote-sent|mark-won|mark-lost)$/);
      if (req.method === "POST" && leadActionMatch) {
        const leadId = decodeURIComponent(leadActionMatch[1]);
        const action = leadActionMatch[2];
        const body = ["mark-lost", "mark-won"].includes(action) ? await readJson(req, { requireBody: false }) : {};
        const result = await handleCrmLeadAction(crmService, leadId, action, body);
        await safeAuditRecord(auditService, {
          type: "crm_lead_commercial_action",
          status: result.ok ? "info" : "warning",
          source: "crm",
          message: `Acao comercial ${action} no lead CRM SamBah`,
          context: { leadId, action, ok: result.ok },
          dedupeKey: `${leadId}:${action}:${Date.now()}`
        });
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
      if (req.method === "PATCH" && leadMatch) {
        const body = await readJson(req, { requireBody: true });
        const result = await crmService.atualizarLead(decodeURIComponent(leadMatch[1]), body);
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      if (req.method === "GET" && url.pathname === "/api/atendimentos") {
        return sendJson(res, 200, await crmService.listarAtendimentos());
      }

      if (req.method === "POST" && url.pathname === "/api/atendimentos") {
        const body = await readJson(req, { requireBody: true });
        return sendJson(res, 201, await crmService.salvarAtendimento(body));
      }

      if (req.method === "GET" && url.pathname === "/api/eventos") {
        return sendJson(res, 200, await crmService.listarEventos());
      }

      if (req.method === "POST" && url.pathname === "/api/eventos") {
        const body = await readJson(req, { requireBody: true });
        return sendJson(res, 201, await crmService.salvarEvento(body));
      }

      const eventoMatch = url.pathname.match(/^\/api\/eventos\/([^/]+)$/);
      if (req.method === "PATCH" && eventoMatch) {
        const body = await readJson(req, { requireBody: true });
        const result = await crmService.atualizarEvento(decodeURIComponent(eventoMatch[1]), body);
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      if (req.method === "GET" && url.pathname === "/api/mesa/pedidos-site") {
        const result = await listarPedidosSiteParaMesa(crmService, url.searchParams.get("status"));
        return sendJson(res, 200, result);
      }

      const mesaPedidoBloqueioMatch = url.pathname.match(/^\/api\/mesa\/pedidos-site\/([^/]+)\/bloqueio$/);
      if (req.method === "POST" && mesaPedidoBloqueioMatch) {
        const body = await readJson(req, { requireBody: true });
        const result = await bloquearPedidoSiteParaMesa(crmService, decodeURIComponent(mesaPedidoBloqueioMatch[1]), body);
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      const mesaPedidoStatusMatch = url.pathname.match(/^\/api\/mesa\/pedidos-site\/([^/]+)\/status$/);
      if (req.method === "POST" && mesaPedidoStatusMatch) {
        const body = await readJson(req, { requireBody: true });
        const result = await atualizarStatusPedidoSiteParaMesa(crmService, decodeURIComponent(mesaPedidoStatusMatch[1]), body);
        return sendJson(res, result.ok ? 200 : 400, result);
      }

      if (req.method === "GET" && url.pathname === "/api/precomandas") {
        return sendJson(res, 200, await crmService.listarPrecomandas());
      }

      if (req.method === "POST" && url.pathname === "/api/precomandas") {
        const body = await readJson(req, { requireBody: true });
        return sendJson(res, 201, await crmService.salvarPrecomanda(body));
      }

      const precomandaMatch = url.pathname.match(/^\/api\/precomandas\/([^/]+)$/);
      if (req.method === "PATCH" && precomandaMatch) {
        const body = await readJson(req, { requireBody: true });
        const result = await crmService.atualizarPrecomanda(decodeURIComponent(precomandaMatch[1]), body);
        return sendJson(res, result.ok ? 200 : 404, result);
      }

      if (req.method === "POST" && url.pathname === "/admin/orders/drafts/test-parse") {
        const body = await readJson(req);
        const menuCache = await menuService.cacheSnapshot();
        const draft = await draftService.createDraft({
          text: body.text || "",
          customer: body.customer || {},
          source: body.source || "WhatsApp / samBah!",
          menu: menuCache
        });
        await auditService.record({
          type: "order_draft_created",
          status: draft.status === "needs_review" ? "warning" : "info",
          source: "draft",
          message: "Rascunho de pedido criado para conferencia",
          context: { draftId: draft.id, intent: draft.intent, confidence: draft.confidence, status: draft.status },
          dedupeKey: draft.id
        });
        return sendJson(res, 200, { ok: true, draft });
      }

      if (req.method === "POST" && url.pathname === "/admin/orders/drafts/confirm") {
        const body = await readJson(req);
        const menuCache = await menuService.cacheSnapshot();
        const result = await draftService.confirmDraft(body.id, menuCache);
        if (!result.ok) {
          return sendJson(res, result.error === "draft_not_found" ? 404 : 409, result);
        }
        const mesaOrder = buildMesaOrder(result.order);
        const queueEntry = await mesaService.enqueueOrder(mesaOrder);
        const mesaResult = await mesaService.sendOrderToMesa(queueEntry);
        await auditService.record({
          type: "order_draft_confirmed",
          status: mesaResult.ok ? "success" : "warning",
          source: "draft",
          message: mesaResult.ok ? "Rascunho confirmado e enviado ao Mesa" : "Rascunho confirmado e mantido na fila Mesa",
          context: { draftId: body.id, queueId: queueEntry.id, mesaStatus: mesaResult.ok ? "accepted" : "pending" },
          dedupeKey: body.id
        });
        const scripts = await conversationService.loadScripts();
        return sendJson(res, 202, {
          ok: true,
          draft: result.draft,
          responseText: mesaResult.ok ? scripts.pedido_enviado : scripts.mesa_fora_do_ar,
          mesa: { status: mesaResult.ok ? "accepted" : "pending", queueId: queueEntry.id }
        });
      }

      if (req.method === "POST" && url.pathname === "/admin/orders/drafts/cancel") {
        const body = await readJson(req);
        const result = await draftService.cancelDraft(body.id);
        if (!result.ok) {
          return sendJson(res, result.error === "draft_not_found" ? 404 : 409, result);
        }
        await auditService.record({
          type: "order_draft_canceled",
          status: "info",
          source: "draft",
          message: "Rascunho de pedido cancelado",
          context: { draftId: body.id },
          dedupeKey: `draft-cancel:${body.id}`
        });
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && ["/webhook/whatsapp", "/webhook/site"].includes(url.pathname)) {
        return handleWhatsAppWebhook(req, res, auditService, mesaService, menuService, conversationService, draftService, eventService, trackingService, crmService);
      }

      return sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      await safeAuditRecord(auditService, {
        type: "system_error",
        status: "error",
        source: "http",
        message: "Unhandled HTTP error",
        error,
        dedupeKey: `${req.method}:${req.url}`
      });
      return sendJson(res, 500, { error: "internal_error" });
    }
  });
}

async function handleWhatsAppWebhook(req, res, auditService, mesaService, menuService, conversationService, draftService, eventService, trackingService, crmService) {
  let body = {};
  try {
    body = await readJson(req, { requireBody: true });
    await safeAuditRecord(auditService, {
      type: "webhook_received",
      status: "info",
      source: body.source === "site" ? "site" : "whatsapp",
      message: body.source === "site" ? "Webhook site recebido" : "Webhook WhatsApp recebido",
      context: {
        eventId: body.eventId,
        phone: body.phone || body.from,
        messageType: body.messageType || body.type
      },
      dedupeKey: body.eventId
    });

    if (body.triggerError) {
      throw new Error("Simulated processing failure");
    }

    if (body.type === "pre_order") {
      const result = await handlePreOrderWebhook(body, { auditService, mesaService, trackingService, crmService });
      return sendJson(res, 202, result);
    }

    const crmResult = await safeCrmRecord(crmService, {
      ...body,
      canal: req.url?.includes("/site") ? "site" : "whatsapp",
      origem: body.source || (req.url?.includes("/site") ? "site" : "whatsapp")
    });

    const menuCache = await menuService.cacheSnapshot();
    const classification = await conversationService.classify(body, menuCache);
    await safeAuditRecord(auditService, {
      type: "conversation_classified",
      status: classification.intent === "needs_review" ? "warning" : "info",
      source: classification.channel || "whatsapp",
      message: `Atendimento classificado como ${classification.intent}`,
      context: {
        eventId: body.eventId,
        intent: classification.intent,
        route: classification.route,
        reason: classification.reason,
        assignee: classification.assignee
      },
      dedupeKey: body.eventId ? `classify:${body.eventId}` : undefined
    });

    if (["event_lead", "reservation"].includes(classification.intent)) {
      const eventResult = await eventService.createLead({
        ...body,
        classification,
        source: body.source === "site" ? "site / samBah!" : "whatsapp / samBah!"
      });
      await safeAuditRecord(auditService, {
        type: "event_lead_created",
        status: "info",
        source: "agenda_insano",
        message: "Atendimento registrado na Agenda Insano",
        context: {
          eventId: body.eventId,
          leadId: eventResult.lead.id,
          intent: classification.intent,
          route: "agenda_insano"
        },
        dedupeKey: body.eventId ? `event:${body.eventId}` : eventResult.lead.id
      });
      return sendJson(res, 202, {
        ok: true,
        intent: classification.intent,
        route: "agenda_insano",
        lead: eventResult.lead,
        crm: summarizeCrmResult(crmResult),
        responseText: classification.responseText
      });
    }

    if (!["immediate_order", "needs_review"].includes(classification.intent)) {
      return sendJson(res, 202, {
        ok: true,
        intent: classification.intent,
        route: classification.route,
        assignee: classification.assignee || null,
        crm: summarizeCrmResult(crmResult),
        responseText: classification.responseText
      });
    }

    const text = body.message || body.text || body.body || body.order?.notes || body.notes || "";
    if (!body.confirmed) {
      const draft = await draftService.createDraft({
        text,
        customer: body.customer || { name: body.name || "", phone: body.phone || body.from || "" },
        source: body.source === "site" ? "Site / samBah!" : "WhatsApp / samBah!",
        menu: menuCache
      });
      await safeAuditRecord(auditService, {
        type: "order_draft_created",
        status: draft.status === "needs_review" ? "warning" : "info",
        source: "conversation",
        message: "Mensagem convertida em rascunho de pedido",
        context: { draftId: draft.id, eventId: body.eventId, status: draft.status, confidence: draft.confidence },
        dedupeKey: body.eventId ? `draft:${body.eventId}` : draft.id
      });
      const scripts = await conversationService.loadScripts();
      const reviewText = draft.questions?.[0]?.reason === "productId_invalido"
        ? scripts.produto_nao_encontrado
        : scripts.pedido_confuso;
      const draftText = scripts.rascunho_entendido.replace("{orderSummary}", formatDraftSummary(draft));
      return sendJson(res, 202, {
        ok: true,
        intent: draft.intent,
        draft,
        crm: summarizeCrmResult(crmResult),
        responseText: draft.status === "needs_review" ? reviewText : draftText
      });
    }

    const operationalPayload = classification.enrichedPayload || body;
    const mesaOrder = buildMesaOrder(operationalPayload);
    const queueEntry = await mesaService.enqueueOrder(mesaOrder);
    await safeAuditRecord(auditService, {
      type: "mesa_order_queued",
      status: "info",
      source: "mesa",
      message: "Pedido WhatsApp salvo na fila Mesa",
      context: { queueId: queueEntry.id, eventId: mesaOrder.externalId },
      dedupeKey: mesaOrder.externalId
    });

    if (classification.intent === "needs_review") {
      const review = {
        ok: false,
        reason: classification.reason || "needs_review",
        message: classification.responseText || "Pedido precisa de revisao manual",
        problems: [{ reason: classification.reason || "needs_review", text: classification.text }]
      };
      await mesaService.markNeedsReview(queueEntry, review);
      await safeAuditRecord(auditService, {
        type: "conversation_needs_review",
        status: "warning",
        source: "conversation",
        message: review.message,
        context: { queueId: queueEntry.id, eventId: mesaOrder.externalId, reason: review.reason },
        dedupeKey: mesaOrder.externalId
      });
      return sendJson(res, 202, {
        ok: true,
        intent: classification.intent,
        mesa: { status: "needs_review", queueId: queueEntry.id },
        crm: summarizeCrmResult(crmResult),
        review
      });
    }

    const validation = await menuService.validateOrder(mesaOrder);
    if (!validation.ok) {
      await mesaService.markNeedsReview(queueEntry, validation);
      await safeAuditRecord(auditService, {
        type: "menu_validation_review",
        status: "warning",
        source: "menu",
        message: validation.message,
        context: { queueId: queueEntry.id, eventId: mesaOrder.externalId, reason: validation.reason },
        dedupeKey: mesaOrder.externalId
      });
      return sendJson(res, 202, {
        ok: true,
        intent: classification.intent,
        mesa: { status: "needs_review", queueId: queueEntry.id },
        review: validation
      });
    }

    const mesaResult = await mesaService.sendOrderToMesa(queueEntry);
    await safeAuditRecord(auditService, {
      type: mesaResult.ok ? "mesa_order_sent" : "mesa_order_pending",
      status: mesaResult.ok ? "success" : "warning",
      source: "mesa",
      message: mesaResult.ok ? "Pedido encaminhado ao Mesa" : "Mesa indisponivel; pedido mantido na fila",
      context: { queueId: queueEntry.id, eventId: mesaOrder.externalId },
      dedupeKey: mesaOrder.externalId
    });

    await safeAuditRecord(auditService, {
      type: "webhook_processed",
      status: "success",
      source: body.source === "site" ? "site" : "whatsapp",
      message: body.source === "site" ? "Webhook site processado" : "Webhook WhatsApp processado",
      context: { eventId: body.eventId, mesaStatus: mesaResult.ok ? "accepted" : "pending" },
      dedupeKey: body.eventId
    });
    return sendJson(res, 202, {
      ok: true,
      intent: classification.intent,
      responseText: mesaResult.ok ? classification.responseText : undefined,
      mesa: { status: mesaResult.ok ? "accepted" : "pending", queueId: queueEntry.id },
      crm: summarizeCrmResult(crmResult)
    });
  } catch (error) {
    if (error.statusCode === 400) {
      await safeAuditRecord(auditService, {
        type: "webhook_invalid_payload",
        status: "warning",
        source: req.url?.includes("/site") ? "site" : "whatsapp",
        message: error.message,
        context: { code: error.code },
        dedupeKey: `${req.url}:${error.code}`
      });
      return sendJson(res, 400, { ok: false, error: error.code, message: error.message });
    }

    const bodyEventId = body.eventId || "unknown";
    await safeAuditRecord(auditService, {
      type: "processing_error",
      status: "error",
      source: body.source === "site" ? "site" : "whatsapp",
      message: "Falha operacional ao processar webhook",
      context: { eventId: bodyEventId },
      error,
      dedupeKey: bodyEventId
    });
    return sendJson(res, 500, { error: "processing_error" });
  }
}

async function handlePreOrderWebhook(body, { auditService, mesaService, trackingService, crmService }) {
  const validation = validatePreOrderPayload(body);
  if (!validation.ok) {
    return {
      ok: false,
      type: "pre_order",
      error: "invalid_pre_order",
      missing: validation.missing,
      responseText: "Pra deixar redondo, falta completar os dados da pré-comanda."
    };
  }

  const sambahOrderId = body.eventId || body.sambahOrderId || `sambah_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const mesaOrder = buildPreOrderMesaOrder(body, sambahOrderId);
  const queueEntry = await mesaService.enqueueOrder(mesaOrder);
  const mesaResult = await mesaService.sendOrderToMesa(queueEntry);
  const mesaOrderId = extractMesaOrderId(mesaResult);
  const mesaStatus = mesaResult.ok
    ? mesaResult.mesaResponse?.status || "pending"
    : "pending_mesa";
  const lastMessageSent = mesaResult.ok
    ? "Pré-comanda enviada para a equipe. O SamBah continua contigo pelo WhatsApp."
    : "O sistema de pedidos está em conferência. Recebi tua pré-comanda e a equipe vai confirmar pelo WhatsApp.";

  const tracking = await trackingService.createTracking({
    sambahOrderId,
    mesaOrderId,
    operation: body.operation,
    customerName: body.customer?.name,
    customerPhone: body.customer?.phone,
    channel: body.source || "site",
    serviceType: body.customer?.serviceType,
    paymentMethod: body.customer?.paymentMethod,
    lastMesaStatus: mesaStatus,
    lastWhatsappStatusSent: "pre_order_sent",
    lastMessageSent,
    whatsappDeliveryStatus: "wa_link_generated",
    queueId: mesaResult.entry?.id || queueEntry.id
  });

  await safeAuditRecord(auditService, {
    type: mesaResult.ok ? "pre_order_sent_to_mesa" : "pre_order_queued_for_mesa",
    status: mesaResult.ok ? "success" : "warning",
    source: "site",
    message: lastMessageSent,
    context: { sambahOrderId, mesaOrderId, queueId: queueEntry.id, mesaStatus },
    dedupeKey: sambahOrderId
  });

  const crmResult = await safeCrmRecord(crmService, {
    ...body,
    type: "pre_order",
    interesse: "pedido",
    mesa: {
      status: mesaResult.ok ? "accepted" : "pending",
      mesaOrderId,
      queueId: queueEntry.id
    }
  });

  return {
    ok: true,
    type: "pre_order",
    responseText: lastMessageSent,
    mesa: {
      status: mesaResult.ok ? "accepted" : "pending",
      mesaOrderId,
      queueId: queueEntry.id
    },
    crm: summarizeCrmResult(crmResult),
    tracking
  };
}

async function createSiteLead(crmService, body = {}) {
  const operation = normalizeOperation(body.operation || body.operacao || body.site || body.origem);
  const pipeline = body.pipeline || (operation === "Buteco Xeriffe" ? "festa_xeriffe" : "food_truck_evento");
  const tracking = siteTrackingFields(body);
  const leadResult = await crmService.salvarLead({
    ...body,
    ...tracking,
    nome: body.nome || body.name || body.customerName || body.customer?.name || "",
    whatsapp: body.whatsapp || body.telefone || body.phone || body.customer?.phone || "",
    operacao: operation,
    operation,
    pipeline,
    origem: body.source || body.origem || "site_externo",
    interesse: body.interesse || body.interest || (operation === "Buteco Xeriffe" ? "festa_xeriffe" : "food_truck"),
    mensagem_original: body.message || body.text || body.observacoes || ""
  });
  const whatsappMessage = buildSiteAtendimentoWhatsappMessage({ id: leadResult.lead.id, operation, pipeline, body, tipo: body.tipo || body.type || "lead" });
  const whatsappUrl = buildSitePedidoWhatsappUrl(whatsappMessage) || buildSiteWhatsAppUrl(body, operation);
  return siteResponse({
    id: leadResult.lead.id,
    pipeline,
    operation,
    whatsappUrl,
    whatsappMessage,
    confirmation: buildSiteConfirmation("atendimento"),
    lead: leadResult.lead
  });
}

async function createSiteEventQuote(crmService, body = {}) {
  const operation = normalizeOperation(body.operation || body.operacao || body.site || body.origem);
  const pipeline = body.pipeline || (operation === "Buteco Xeriffe" ? "festa_xeriffe" : "food_truck_evento");
  const tracking = siteTrackingFields(body);
  const atendimento = await crmService.registrarAtendimentoComercial({
    ...body,
    ...tracking,
    nome: body.nome || body.name || body.customerName || body.customer?.name || "",
    whatsapp: body.whatsapp || body.telefone || body.phone || body.customer?.phone || "",
    operacao: operation,
    operation,
    origem: body.source || body.origem || "site_externo",
    pipeline,
    interesse: operation === "Buteco Xeriffe" ? "festa_xeriffe" : "orcamento",
    status: "orcamento_solicitado",
    message: body.message || body.text || body.observacoes || "Orcamento de evento solicitado pelo site"
  });
  const id = atendimento.lead?.id || atendimento.evento?.id;
  const whatsappMessage = buildSiteAtendimentoWhatsappMessage({ id, operation, pipeline, body, tipo: body.tipo || body.type || "evento" });
  const whatsappUrl = buildSitePedidoWhatsappUrl(whatsappMessage) || atendimento.whatsappUrl || buildSiteWhatsAppUrl(body, operation);
  return siteResponse({
    id,
    pipeline,
    operation,
    whatsappUrl,
    whatsappMessage,
    confirmation: buildSiteConfirmation("atendimento"),
    lead: atendimento.lead,
    evento: atendimento.evento
  });
}

async function createSiteQuickOrder(crmService, body = {}) {
  const operation = normalizeOperation(body.operation || body.operacao || body.site || body.origem);
  const tracking = siteTrackingFields(body);
  const pipeline = body.pipeline || "pedido_rapido";
  const result = await crmService.registrarAtendimentoComercial({
    ...body,
    ...tracking,
    nome: body.nome || body.name || body.customerName || body.customer?.name || "",
    whatsapp: body.whatsapp || body.telefone || body.phone || body.customer?.phone || "",
    operacao: operation,
    operation,
    origem: body.source || body.origem || "site_externo",
    pipeline,
    interesse: "pedido",
    message: body.message || body.text || body.observacoes || formatRequestItems(body.items || body.itens)
  });
  const id = result.precomanda?.id || result.atendimento?.id;
  const whatsappMessage = buildSiteAtendimentoWhatsappMessage({ id, operation, pipeline, body, tipo: body.tipo || body.type || "pedido" });
  const whatsappUrl = buildSitePedidoWhatsappUrl(whatsappMessage) || result.whatsappUrl || buildSiteWhatsAppUrl(body, operation);
  return siteResponse({
    id,
    pipeline,
    operation,
    whatsappUrl,
    whatsappMessage,
    confirmation: buildSiteConfirmation("pedido"),
    precomanda: result.precomanda,
    atendimento: result.atendimento
  });
}

function getInsanoSiteCardapio() {
  const categorias = [
    "Burgers",
    "Assados & Buteco",
    "Pizzas",
    "PorÃ§Ãµes",
    "Espetinhos",
    "Bebidas",
    "Eventos"
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

async function readJson(req, { requireBody = false } = {}) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    if (!requireBody) return {};
    throw httpError(400, "empty_body", "Body JSON vazio");
  }
  try {
    return JSON.parse(raw);
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
    res.writeHead(200, { "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream" });
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
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type"
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

const isCliRun = globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href;

if (isCliRun) {
  const port = getRuntimeConfig().port;
  createApp().listen(port, () => {
    console.log(`samBah! admin em http://localhost:${port}/admin`);
  });
}
