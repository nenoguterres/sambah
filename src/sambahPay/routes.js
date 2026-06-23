export class SambahPayRouter {
  constructor({ controllers }) {
    this.controllers = controllers;
  }

  async handle(req, res, url) {
    if (
      !url.pathname.startsWith("/api/sambah-pay")
      && !url.pathname.startsWith("/api/sambah-voice")
      && !url.pathname.startsWith("/api/sambah-events")
      && !url.pathname.startsWith("/api/sambah-observability")
      && !url.pathname.startsWith("/api/sambah-security")
      && !url.pathname.startsWith("/api/sambah-lgpd")
      && !url.pathname.startsWith("/api/sambah-crm")
      && !url.pathname.startsWith("/api/sambah-memory")
      && !url.pathname.startsWith("/api/sambah-whatsapp")
      && !url.pathname.startsWith("/api/sambah-handoff")
      && !url.pathname.startsWith("/api/sambah-channel")
      && !url.pathname.startsWith("/api/sambah-meta")
      && !url.pathname.startsWith("/api/sambah-meta-whatsapp")
      && !url.pathname.startsWith("/api/sambah-database")
      && !url.pathname.startsWith("/api/sambah-messaging")
    ) return false;
    try {
      const result = await this.dispatch(req, url);
      if (!result) return this.sendJson(res, 404, { ok: false, error: "sambah_pay_route_not_found" });
      if (Object.hasOwn(result, "rawBody")) return this.sendRaw(res, result.statusCode || 200, result.rawBody, result.contentType);
      return this.sendJson(res, result.statusCode || (result.ok === false ? 400 : 200), result.body || result);
    } catch (error) {
      return this.sendJson(res, error.statusCode || 500, { ok: false, error: error.code || "sambah_pay_internal_error", message: error.message });
    }
  }

  async dispatch(req, url) {
    const path = url.pathname;
    const body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readJson(req) : {};

    if (req.method === "POST" && path === "/api/sambah-events/publish") return this.controllers.events.publish(body);
    if (req.method === "GET" && path === "/api/sambah-events") return this.controllers.events.listEvents({ limit: url.searchParams.get("limit") });
    if (req.method === "GET" && path === "/api/sambah-events/outbox") return this.controllers.events.listOutbox({ limit: url.searchParams.get("limit") });
    if (req.method === "GET" && path === "/api/sambah-events/dead-letter") return this.controllers.events.listDeadLetter({ limit: url.searchParams.get("limit") });
    if (req.method === "POST" && path === "/api/sambah-events/process") return this.controllers.events.process(body);
    if (req.method === "POST" && path === "/api/sambah-events/retry-all") return this.controllers.events.retryAll();
    if (req.method === "GET" && path === "/api/sambah-events/consumers") return this.controllers.events.consumers();
    if (req.method === "POST" && path === "/api/sambah-events/simulate-erp-failure") return this.controllers.events.simulateErpFailure(body);
    if (req.method === "POST" && path === "/api/sambah-events/simulate-payment-confirmed") return this.controllers.events.simulatePaymentConfirmed(body);
    let eventBusMatch = path.match(/^\/api\/sambah-events\/retry\/([^/]+)$/);
    if (req.method === "POST" && eventBusMatch) return this.controllers.events.retry(decodeURIComponent(eventBusMatch[1]));
    eventBusMatch = path.match(/^\/api\/sambah-events\/correlation\/([^/]+)$/);
    if (req.method === "GET" && eventBusMatch) return this.controllers.events.correlation(decodeURIComponent(eventBusMatch[1]));

    if (req.method === "GET" && path === "/api/sambah-observability/health") return this.controllers.observability.health();
    if (req.method === "GET" && path === "/api/sambah-observability/metrics") return this.controllers.observability.metrics();
    if (req.method === "GET" && path === "/api/sambah-observability/traces") return this.controllers.observability.traces({ limit: url.searchParams.get("limit") });
    if (req.method === "GET" && path === "/api/sambah-observability/alerts") return this.controllers.observability.alerts({ includeResolved: url.searchParams.get("includeResolved") !== "false" });
    if (req.method === "POST" && path === "/api/sambah-observability/simulate-critical-alert") return this.controllers.observability.simulateCriticalAlert(body);
    let observabilityMatch = path.match(/^\/api\/sambah-observability\/alerts\/([^/]+)\/resolve$/);
    if (req.method === "POST" && observabilityMatch) return this.controllers.observability.resolveAlert(decodeURIComponent(observabilityMatch[1]), body);
    observabilityMatch = path.match(/^\/api\/sambah-observability\/correlation\/([^/]+)$/);
    if (req.method === "GET" && observabilityMatch) return this.controllers.observability.correlation(decodeURIComponent(observabilityMatch[1]));

    if (req.method === "GET" && path === "/api/sambah-security/incidents") return this.controllers.security.incidents({ limit: url.searchParams.get("limit"), status: url.searchParams.get("status"), severity: url.searchParams.get("severity") });
    let securityMatch = path.match(/^\/api\/sambah-security\/incidents\/([^/]+)$/);
    if (req.method === "GET" && securityMatch) return this.controllers.security.incident(decodeURIComponent(securityMatch[1]));
    securityMatch = path.match(/^\/api\/sambah-security\/incidents\/([^/]+)\/(acknowledge|resolve|dismiss|escalate|block_device_mock|block_customer_mock|mark_camera_clip_mock|notify_operator_mock|trigger_siren_mock)$/);
    if (req.method === "POST" && securityMatch) {
      const id = decodeURIComponent(securityMatch[1]);
      const action = securityMatch[2];
      if (["acknowledge", "resolve", "dismiss", "escalate"].includes(action)) return this.controllers.security[action](id, body);
      return this.controllers.security.mockAction(id, action, body);
    }
    securityMatch = path.match(/^\/api\/sambah-security\/simulate\/([^/]+)$/);
    if (req.method === "POST" && securityMatch) return this.controllers.security.simulate(decodeURIComponent(securityMatch[1]), body);
    if (req.method === "GET" && path === "/api/sambah-security/rules") return this.controllers.security.rules();
    if (req.method === "POST" && path === "/api/sambah-security/rules") return this.controllers.security.createRule(body);
    if (req.method === "GET" && path === "/api/sambah-security/device-map") return this.controllers.security.deviceMap();
    if (req.method === "POST" && path === "/api/sambah-security/device-map") return this.controllers.security.mapDevice(body);
    if (req.method === "GET" && path === "/api/sambah-security/dashboard") return this.controllers.security.dashboard();

    if (req.method === "GET" && path === "/api/sambah-lgpd/dashboard") {
      const allowed = await this.requirePermission(req, "lgpd_view", "view_lgpd_dashboard", path);
      if (!allowed.ok) return allowed;
      return this.controllers.lgpd.dashboard();
    }
    if (req.method === "GET" && path === "/api/sambah-lgpd/critical-logs") {
      const allowed = await this.requirePermission(req, "critical_logs_view", "view_critical_logs", path);
      if (!allowed.ok) return allowed;
      return this.controllers.lgpd.criticalLogs({ limit: url.searchParams.get("limit") });
    }
    if (req.method === "GET" && path === "/api/sambah-lgpd/audit/export") {
      const allowed = await this.requirePermission(req, "lgpd_export", "export_lgpd_audit", path);
      if (!allowed.ok) return allowed;
      return this.controllers.lgpd.exportAudit({ limit: url.searchParams.get("limit"), domain: url.searchParams.get("domain") });
    }
    if (req.method === "GET" && path === "/api/sambah-lgpd/privacy-requests") {
      const allowed = await this.requirePermission(req, "lgpd_view", "view_privacy_requests", path);
      if (!allowed.ok) return allowed;
      return this.controllers.lgpd.privacyRequests({ status: url.searchParams.get("status") });
    }
    if (req.method === "POST" && path === "/api/sambah-lgpd/privacy-requests") {
      const allowed = await this.requirePermission(req, "privacy_request_manage", "create_privacy_request", path);
      if (!allowed.ok) return allowed;
      return this.controllers.lgpd.createPrivacyRequest(body);
    }
    let lgpdMatch = path.match(/^\/api\/sambah-lgpd\/privacy-requests\/([^/]+)$/);
    if (req.method === "POST" && lgpdMatch) {
      const allowed = await this.requirePermission(req, "privacy_request_manage", "update_privacy_request", path);
      if (!allowed.ok) return allowed;
      return this.controllers.lgpd.updatePrivacyRequest(decodeURIComponent(lgpdMatch[1]), body);
    }
    if (req.method === "GET" && path === "/api/sambah-lgpd/retention-policies") {
      const allowed = await this.requirePermission(req, "lgpd_view", "view_retention_policies", path);
      if (!allowed.ok) return allowed;
      return this.controllers.lgpd.retentionPolicies();
    }
    if (req.method === "POST" && path === "/api/sambah-lgpd/retention-policies") {
      const allowed = await this.requirePermission(req, "retention_policy_manage", "create_retention_policy", path);
      if (!allowed.ok) return allowed;
      return this.controllers.lgpd.createRetentionPolicy(body);
    }

    if (req.method === "GET" && path === "/api/sambah-database/health") return this.controllers.database.health();
    if (req.method === "GET" && path === "/api/sambah-database/config") return this.controllers.database.config();
    if (req.method === "GET" && path === "/api/sambah-database/migrations") return this.controllers.database.migrations();
    if (req.method === "POST" && path === "/api/sambah-database/migrations/dry-run") return this.controllers.database.dryRunMigrations();
    if (req.method === "POST" && path === "/api/sambah-database/seed/demo") return this.controllers.database.seedDemo();
    if (req.method === "GET" && path === "/api/sambah-database/repositories") return this.controllers.database.repositories();

    if (req.method === "GET" && path === "/api/sambah-messaging/config") return this.controllers.messaging.config();
    if (req.method === "GET" && path === "/api/sambah-messaging/health") return this.controllers.messaging.health();
    if (req.method === "GET" && path === "/api/sambah-messaging/brokers") return this.controllers.messaging.brokers();
    if (req.method === "GET" && path === "/api/sambah-messaging/contracts") return this.controllers.messaging.contracts();
    if (req.method === "GET" && path === "/api/sambah-messaging/routes") return this.controllers.messaging.routes();
    if (req.method === "POST" && path === "/api/sambah-messaging/publish-test") return this.controllers.messaging.publishTest(body);
    let messagingMatch = path.match(/^\/api\/sambah-messaging\/replay\/([^/]+)$/);
    if (req.method === "POST" && messagingMatch) return this.controllers.messaging.replay(decodeURIComponent(messagingMatch[1]), body);
    if (req.method === "POST" && path === "/api/sambah-messaging/simulate-redis") return this.controllers.messaging.simulateRedis(body);
    if (req.method === "POST" && path === "/api/sambah-messaging/simulate-rabbitmq") return this.controllers.messaging.simulateRabbitmq(body);
    if (req.method === "POST" && path === "/api/sambah-messaging/simulate-broker-failure") return this.controllers.messaging.simulateBrokerFailure(body);

    if (req.method === "GET" && path === "/api/sambah-crm/status") return this.controllers.crm.status();
    if (req.method === "POST" && path === "/api/sambah-crm/leads") return this.controllers.crm.createLead(body);
    if (req.method === "GET" && path === "/api/sambah-crm/leads") return this.controllers.crm.listLeads(url.searchParams);
    let crmMatch = path.match(/^\/api\/sambah-crm\/leads\/([^/]+)\/stage$/);
    if (req.method === "PATCH" && crmMatch) return this.controllers.crm.updateStage(decodeURIComponent(crmMatch[1]), body);
    crmMatch = path.match(/^\/api\/sambah-crm\/leads\/([^/]+)\/notes$/);
    if (req.method === "PATCH" && crmMatch) return this.controllers.crm.updateNotes(decodeURIComponent(crmMatch[1]), body);

    if (req.method === "POST" && path === "/api/sambah-memory/contact") return this.controllers.memory.upsertContact(body);
    let memoryMatch = path.match(/^\/api\/sambah-memory\/contact\/([^/]+)$/);
    if (req.method === "GET" && memoryMatch) return this.controllers.memory.getContact(decodeURIComponent(memoryMatch[1]));

    if (req.method === "POST" && path === "/api/sambah-whatsapp/mock-message") return this.controllers.whatsappMock.receiveMessage(body);
    if (req.method === "POST" && path === "/api/sambah-channel/message") return this.controllers.channel.receiveMessage(body);
    if (req.method === "GET" && path === "/api/sambah-meta-whatsapp/webhook") return this.controllers.metaWhatsapp.verify(url.searchParams);
    if (req.method === "POST" && path === "/api/sambah-meta-whatsapp/webhook") return this.controllers.metaWhatsapp.receiveWebhook(body);
    if (req.method === "GET" && path === "/api/sambah-meta/debug") return this.controllers.metaSend.debug();
    if (req.method === "POST" && path === "/api/sambah-meta/send") return this.controllers.metaSend.send(body);
    if (req.method === "GET" && path === "/api/sambah-handoff") return this.controllers.handoff.list(url.searchParams);
    if (req.method === "GET" && path === "/api/sambah-handoff/pending") return this.controllers.handoff.pending();
    let handoffMatch = path.match(/^\/api\/sambah-handoff\/([^/]+)\/status$/);
    if (req.method === "PATCH" && handoffMatch) return this.controllers.handoff.updateStatus(decodeURIComponent(handoffMatch[1]), body);

    if (req.method === "GET" && path === "/api/sambah-pay/health") return { ok: true, module: "sambah-pay", mode: "simulated" };
    if (req.method === "GET" && path === "/api/sambah-pay/permissions") return this.controllers.permissions.matrix();
    if (req.method === "GET" && path === "/api/sambah-pay/permissions/matrix") return this.controllers.permissions.matrix();
    if (req.method === "GET" && path === "/api/sambah-pay/ecosystem/status") return this.controllers.ecosystem.status();
    if (req.method === "GET" && path === "/api/sambah-pay/security/events") return this.controllers.ecosystem.securityEvents();
    if (req.method === "POST" && path === "/api/sambah-pay/demo/bootstrap") {
      const allowed = await this.requirePermission(req, "ecosystem_bootstrap", "demo_bootstrap", path);
      if (!allowed.ok) return allowed;
      return this.controllers.ecosystem.bootstrap();
    }
    if (req.method === "POST" && path === "/api/sambah-pay/devices/demo") return this.controllers.ecosystem.createDemoDevice(body);
    if (req.method === "POST" && path === "/api/sambah-pay/locker/bootstrap") return this.controllers.locker.bootstrap();
    if (req.method === "POST" && path === "/api/sambah-pay/secure-pickup/create") return this.controllers.locker.create(body);
    if (req.method === "POST" && path === "/api/sambah-pay/secure-pickup/validate-pin") return this.controllers.locker.validatePin(body);
    if (req.method === "POST" && path === "/api/sambah-pay/secure-pickup/start") return this.controllers.locker.start(body);
    if (req.method === "POST" && path === "/api/sambah-pay/secure-pickup/open-authorized-zones") return this.controllers.locker.openAuthorizedZones(body);
    if (req.method === "POST" && path === "/api/sambah-pay/secure-pickup/confirm-item") return this.controllers.locker.confirmItem(body);
    if (req.method === "POST" && path === "/api/sambah-pay/secure-pickup/complete") return this.controllers.locker.complete(body);
    if (req.method === "POST" && path === "/api/sambah-pay/secure-pickup/block") return this.controllers.locker.block(body);
    if (req.method === "POST" && path === "/api/sambah-pay/secure-pickup/create-pending") return this.controllers.locker.createPendingSession(body);
    if (req.method === "GET" && path === "/api/sambah-pay/secure-pickup/attempts") return this.controllers.locker.attempts();
    if (req.method === "GET" && path === "/api/sambah-pay/secure-pickup/events") return this.controllers.locker.events();
    if (req.method === "GET" && path === "/api/sambah-pay/locker/zones") return this.controllers.locker.zones();
    let lockerMatch = path.match(/^\/api\/sambah-pay\/secure-pickup\/([^/]+)$/);
    if (req.method === "GET" && lockerMatch) return this.controllers.locker.get(decodeURIComponent(lockerMatch[1]));
    lockerMatch = path.match(/^\/api\/sambah-pay\/secure-pickup\/items\/([^/]+)$/);
    if (req.method === "GET" && lockerMatch) return this.controllers.locker.items(decodeURIComponent(lockerMatch[1]));
    lockerMatch = path.match(/^\/api\/sambah-pay\/locker\/zones\/([^/]+)\/(open|close|weight-check)$/);
    if (req.method === "POST" && lockerMatch) {
      const zoneId = decodeURIComponent(lockerMatch[1]);
      if (lockerMatch[2] === "open") return this.controllers.locker.openZone(zoneId, body);
      if (lockerMatch[2] === "close") return this.controllers.locker.closeZone(zoneId, body);
      if (lockerMatch[2] === "weight-check") return this.controllers.locker.weightCheck(zoneId, body);
    }

    if (req.method === "GET" && path === "/api/sambah-pay/voice/dashboard") return this.controllers.voice.dashboard();
    if (req.method === "GET" && path === "/api/sambah-pay/voice/transcriptions") return this.controllers.voice.transcriptions(url.searchParams);
    if (req.method === "GET" && path === "/api/sambah-pay/voice/intents") return this.controllers.voice.intents(url.searchParams);
    let voiceIntentMatch = path.match(/^\/api\/sambah-pay\/voice\/intents\/([^/]+)\/confirm$/);
    if (req.method === "POST" && voiceIntentMatch) {
      const allowed = await this.requirePermission(req, "voice_reprocess", "confirm_intent", path);
      if (!allowed.ok) return allowed;
      return this.controllers.voice.confirmIntent(decodeURIComponent(voiceIntentMatch[1]));
    }
    if (req.method === "GET" && path === "/api/sambah-pay/voice/responses") return this.controllers.voice.responses(url.searchParams);
    if (req.method === "GET" && path === "/api/sambah-pay/voice/handoffs") return this.controllers.voice.handoffs(url.searchParams);
    if (req.method === "GET" && path === "/api/sambah-pay/voice/payment-links") return this.controllers.voice.paymentLinks(url.searchParams);
    if (req.method === "GET" && path === "/api/sambah-pay/voice/audit") {
      const role = this.roleFrom(req);
      const permission = ["ADMIN", "AUDITOR"].includes(role) ? "voice_audit_full" : "voice_audit_summary";
      const allowed = await this.requirePermission(req, permission, "view_voice_audit", path);
      if (!allowed.ok) return allowed;
      return this.controllers.voice.audit(url.searchParams);
    }

    if (req.method === "POST" && path === "/api/sambah-voice/webhook/whatsapp") return this.controllers.voice.webhookWhatsapp(body);
    if (req.method === "POST" && path === "/api/sambah-voice/transcribe") return this.controllers.voice.transcribe(body);
    if (req.method === "POST" && path === "/api/sambah-voice/intent") return this.controllers.voice.intent(body);
    if (req.method === "POST" && path === "/api/sambah-voice/respond") return this.controllers.voice.respond(body);
    if (req.method === "POST" && path === "/api/sambah-voice/handoff") {
      const allowed = await this.requirePermission(req, "voice_handoff", "voice_handoff", path);
      if (!allowed.ok) return allowed;
      return this.controllers.voice.handoff(body);
    }

    if (req.method === "POST" && path === "/api/sambah-pay/voice/checkout") {
      const allowed = await this.requirePermission(req, "voice_checkout", "voice_checkout", path);
      if (!allowed.ok) return allowed;
      return this.controllers.voice.checkout(body);
    }
    if (req.method === "POST" && path === "/api/sambah-pay/voice/wallet-topup") {
      const allowed = await this.requirePermission(req, "voice_wallet_topup", "voice_wallet_topup", path);
      if (!allowed.ok) return allowed;
      return this.controllers.voice.walletTopup(body);
    }
    if (req.method === "POST" && path === "/api/sambah-pay/voice/autoserve-release") {
      const allowed = await this.requirePermission(req, "voice_autoserve_release", "voice_autoserve_release", path);
      if (!allowed.ok) return allowed;
      return this.controllers.voice.autoserveRelease(body);
    }
    let voiceMatch = path.match(/^\/api\/sambah-pay\/voice\/session\/([^/]+)$/);
    if (req.method === "GET" && voiceMatch) return this.controllers.voice.session(decodeURIComponent(voiceMatch[1]));
    if (req.method === "POST" && path === "/api/sambah-pay/weight/reading") return this.controllers.weight.reading(body);
    if (req.method === "POST" && path === "/api/sambah-pay/weight/validate") return this.controllers.weight.validate(body);
    if (req.method === "GET" && path === "/api/sambah-pay/weight/readings") return this.controllers.weight.readings(url.searchParams);
    if (req.method === "GET" && path === "/api/sambah-pay/weight/validations") return this.controllers.weight.validations(url.searchParams);
    if (req.method === "GET" && path === "/api/sambah-pay/weight/events") return this.controllers.weight.events(url.searchParams);
    if (req.method === "GET" && path === "/api/sambah-pay/weight/alerts") return this.controllers.weight.alerts(url.searchParams);
    if (req.method === "POST" && path === "/api/sambah-pay/weight/calibrate") return this.controllers.weight.calibrate(body);
    if (req.method === "POST" && path === "/api/sambah-pay/weight/simulate-locker-zone") return this.controllers.weight.simulateLockerZone(body);
    if (req.method === "POST" && path === "/api/sambah-pay/weight/simulate-self-service") return this.controllers.weight.simulateSelfService(body);
    if (req.method === "POST" && path === "/api/sambah-pay/weight/simulate-beverage") return this.controllers.weight.simulateBeverage(body);
    if (req.method === "POST" && path === "/api/sambah-pay/weight/simulate-smart-fridge") return this.controllers.weight.simulateSmartFridge(body);
    if (req.method === "POST" && path === "/api/sambah-pay/weight/simulate-pickup") return this.controllers.weight.simulatePickup(body);

    if (req.method === "GET" && path === "/api/sambah-pay/core/status") return this.controllers.core.status();
    if (req.method === "GET" && path === "/api/sambah-pay/payments") return this.controllers.core.listPayments(url.searchParams);
    if (req.method === "POST" && path === "/api/sambah-pay/payments") return this.controllers.core.createPayment(body);

    if (req.method === "POST" && path === "/api/sambah-pay/wallets") return this.controllers.wallet.create(body);
    let match = path.match(/^\/api\/sambah-pay\/wallets\/([^/]+)$/);
    if (req.method === "GET" && match) return this.controllers.wallet.get(decodeURIComponent(match[1]));
    match = path.match(/^\/api\/sambah-pay\/wallets\/([^/]+)\/add-credit$/);
    if (req.method === "POST" && match) return this.controllers.wallet.addCredit(decodeURIComponent(match[1]), body);
    match = path.match(/^\/api\/sambah-pay\/wallets\/([^/]+)\/debit$/);
    if (req.method === "POST" && match) return this.controllers.wallet.debit(decodeURIComponent(match[1]), body);
    match = path.match(/^\/api\/sambah-pay\/wallets\/([^/]+)\/statement$/);
    if (req.method === "GET" && match) return this.controllers.wallet.statement(decodeURIComponent(match[1]));

    if (req.method === "POST" && path === "/api/sambah-pay/autoserve/session") return this.controllers.autoserve.createSession(body);
    if (req.method === "POST" && path === "/api/sambah-pay/autoserve/cart") return this.controllers.autoserve.addToCart(body);
    if (req.method === "POST" && path === "/api/sambah-pay/autoserve/checkout") return this.controllers.autoserve.checkout(body);
    match = path.match(/^\/api\/sambah-pay\/autoserve\/status\/([^/]+)$/);
    if (req.method === "GET" && match) return this.controllers.autoserve.status(decodeURIComponent(match[1]));

    if (req.method === "POST" && path === "/api/sambah-pay/devices") return this.controllers.device.create(body);
    if (req.method === "GET" && path === "/api/sambah-pay/devices") return this.controllers.device.list();
    match = path.match(/^\/api\/sambah-pay\/devices\/([^/]+)$/);
    if (req.method === "GET" && match) return this.controllers.device.get(decodeURIComponent(match[1]));
    if (req.method === "PATCH" && match) return this.controllers.device.update(decodeURIComponent(match[1]), body);
    match = path.match(/^\/api\/sambah-pay\/devices\/([^/]+)\/heartbeat$/);
    if (req.method === "POST" && match) return this.controllers.device.heartbeat(decodeURIComponent(match[1]), body);
    match = path.match(/^\/api\/sambah-pay\/devices\/([^/]+)\/command$/);
    if (req.method === "POST" && match) return this.controllers.device.command(decodeURIComponent(match[1]), body);
    match = path.match(/^\/api\/sambah-pay\/devices\/([^/]+)\/status$/);
    if (req.method === "GET" && match) return this.controllers.device.status(decodeURIComponent(match[1]));
    match = path.match(/^\/api\/sambah-pay\/devices\/([^/]+)\/products$/);
    if (req.method === "POST" && match) return this.controllers.device.addProduct(decodeURIComponent(match[1]), body);
    if (req.method === "GET" && match) return this.controllers.device.listProducts(decodeURIComponent(match[1]));

    if (req.method === "POST" && path === "/api/sambah-pay/releases/create") return this.controllers.autoserve.createRelease(body);
    match = path.match(/^\/api\/sambah-pay\/releases\/([^/]+)\/(validate|start|complete|fail)$/);
    if (match && req.method === "POST") {
      const token = decodeURIComponent(match[1]);
      const action = match[2];
      if (action === "validate") return this.controllers.autoserve.validateRelease(token);
      if (action === "start") return this.controllers.autoserve.startRelease(token, body);
      if (action === "complete") return this.controllers.autoserve.completeRelease(token, body);
      if (action === "fail") return this.controllers.autoserve.failRelease(token, body);
    }

    if (req.method === "POST" && path === "/api/sambah-pay/scale/reading") return this.controllers.device.scaleReading(body);
    if (req.method === "POST" && path === "/api/sambah-pay/flow-meter/reading") return this.controllers.device.flowReading(body);
    if (req.method === "GET" && path === "/api/sambah-pay/machine-alerts") return this.controllers.device.alerts();
    match = path.match(/^\/api\/sambah-pay\/machine-alerts\/([^/]+)\/resolve$/);
    if (req.method === "POST" && match) return this.controllers.device.resolveAlert(decodeURIComponent(match[1]), body);

    if (req.method === "POST" && path === "/api/sambah-pay/events") return this.controllers.event.create(body);
    match = path.match(/^\/api\/sambah-pay\/events\/([^/]+)\/participants$/);
    if (req.method === "POST" && match) return this.controllers.event.addParticipant(decodeURIComponent(match[1]), body);
    match = path.match(/^\/api\/sambah-pay\/events\/([^/]+)\/consume$/);
    if (req.method === "POST" && match) return this.controllers.event.consume(decodeURIComponent(match[1]), body);
    match = path.match(/^\/api\/sambah-pay\/events\/([^/]+)\/report$/);
    if (req.method === "GET" && match) return this.controllers.event.report(decodeURIComponent(match[1]));
    match = path.match(/^\/api\/sambah-pay\/events\/([^/]+)\/close$/);
    if (req.method === "POST" && match) return this.controllers.event.close(decodeURIComponent(match[1]));

    if (req.method === "GET" && path === "/api/sambah-pay/bi/dashboard") return this.controllers.bi.dashboard();
    if (req.method === "GET" && path === "/api/sambah-pay/bi/daily") return this.controllers.bi.daily();
    if (req.method === "GET" && path === "/api/sambah-pay/bi/products") return this.controllers.bi.products();
    if (req.method === "GET" && path === "/api/sambah-pay/bi/channels") return this.controllers.bi.channels();
    if (req.method === "GET" && path === "/api/sambah-pay/bi/operators") return this.controllers.bi.operators();
    if (req.method === "GET" && path === "/api/sambah-pay/bi/events") return this.controllers.bi.events();

    return null;
  }

  roleFrom(req) {
    const user = this.sessionUser(req);
    if (req.sambahAuthMode === "session" && user) return this.controllers.permissions.normalizeRole(user.role);
    return this.controllers.permissions.normalizeRole(req.headers["x-sambah-role"]);
  }

  async requirePermission(req, permission, action, path) {
    const user = this.sessionUser(req);
    if (req.sambahAuthMode === "session") {
      if (!user) {
        return { ok: false, statusCode: 401, error: "auth_required", message: "Sessao obrigatoria para esta acao" };
      }
      return this.controllers.permissions.authorize({
        role: user.role,
        permission,
        action,
        path,
        context: { username: user.username, role: user.role, source: "session" }
      });
    }
    return this.controllers.permissions.authorize({ role: req.headers["x-sambah-role"], permission, action, path, context: { source: "mock" } });
  }

  sessionUser(req) {
    return req.sambahUser || null;
  }

  sendJson(res, statusCode, payload) {
    if (res.writableEnded) return true;
    res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
    return true;
  }

  sendRaw(res, statusCode, payload, contentType = "text/plain; charset=utf-8") {
    if (res.writableEnded) return true;
    res.writeHead(statusCode, { "content-type": contentType });
    res.end(String(payload ?? ""));
    return true;
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    error.statusCode = 400;
    error.code = "invalid_json";
    throw error;
  }
}
