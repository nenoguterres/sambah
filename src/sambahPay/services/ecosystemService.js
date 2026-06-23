import crypto from "node:crypto";

const SECURITY_EVENT_TYPES = [
  "security_violation",
  "device_offline",
  "door_open_without_payment",
  "weight_fraud_suspected",
  "secure_zone_mismatch",
  "delivery_failed"
];

export class SambahEcosystemService {
  constructor({ repositories, audit, coreService, walletService, deviceService, autoserveService, voiceService, permissionService, now = () => new Date() } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.core = coreService;
    this.wallet = walletService;
    this.device = deviceService;
    this.autoserve = autoserveService;
    this.voice = voiceService;
    this.permissions = permissionService;
    this.now = now;
  }

  async status() {
    const [
      payments,
      wallets,
      devices,
      products,
      alerts,
      auditLogs,
      sessions,
      releases,
      deliveryEvents,
      voiceMessages,
      voiceSessions,
      securityEvents,
      weightReadings,
      weightValidations,
      weightEvents,
      lockerZones,
      securePickupSessions,
      eventBusEvents,
      eventOutbox,
      eventDeadLetter,
      operationalAlerts,
      traces,
      securityIncidents,
      securityActions,
      privacyRequests
    ] = await Promise.all([
      this.repositories.payments.all(),
      this.repositories.wallets.all(),
      this.repositories.devices.all(),
      this.repositories.deviceProducts.all(),
      this.repositories.machineAlerts.all(),
      this.repositories.auditLogs.all(),
      this.repositories.autoserveSessions.all(),
      this.repositories.releaseTokens.all(),
      this.repositories.deliveryEvents.all(),
      this.repositories.voiceMessages.all(),
      this.repositories.voiceSessions.all(),
      this.repositories.i9acaoSecurityEvents.all(),
      this.repositories.weightReadings.all(),
      this.repositories.weightValidations.all(),
      this.repositories.weightEvents.all(),
      this.repositories.lockerZones.all(),
      this.repositories.securePickupSessions.all(),
      this.repositories.events.all(),
      this.repositories.eventOutbox.all(),
      this.repositories.eventDeadLetter.all(),
      this.repositories.operationalAlerts.all(),
      this.repositories.traces.all(),
      this.repositories.securityIncidents.all(),
      this.repositories.securityActions.all(),
      this.repositories.lgpdPrivacyRequests.all()
    ]);

    const openAlerts = alerts.filter((item) => item.status !== "resolved");
    const weightAlerts = alerts.filter((item) => String(item.type || "").startsWith("weight_"));
    const weightFrauds = weightValidations.filter((item) => item.status === "weight_fraud_suspected");
    const cards = [
      { key: "voice_pay", title: "SamBah Voice Pay", href: "/sambah-voice-pay", status: "mock online", count: voiceMessages.length, summary: "Audio, transcricao, intents, respostas e handoff." },
      { key: "pay", title: "SamBah Pay", href: "/sambah-pay", status: "simulado", count: payments.length, summary: "Pagamentos mockados, wallet, checkout e auditoria." },
      { key: "autoserve", title: "AutoServe", href: "/sambah-autoserve", status: "simulado", count: sessions.length, summary: "Sessoes, carrinho, checkout e release tokens." },
      { key: "devices", title: "Devices", href: "/sambah-devices", status: devices.some((item) => item.status === "online") ? "online mock" : "aguardando demo", count: devices.length, summary: "Dispositivos, produtos, heartbeat e comandos." },
      { key: "wallet", title: "Wallet", href: "/sambah-pay#wallet", status: "simulado", count: wallets.length, summary: "Carteiras internas e movimentos mockados." },
      { key: "weight_control", title: "Weight Control", href: "/sambah-weight", status: weightFrauds.length ? "fraude suspeita" : "peso mock", count: weightValidations.length, summary: "Leituras, validacoes, estoque por peso e fraude simulada." },
      { key: "locker", title: "Locker Frio", href: "/sambah-locker", status: "secure pickup mock", count: lockerZones.length, summary: "PIN unico para retirada multi-item em zonas autorizadas." },
      { key: "event_bus", title: "SamBah Event Bus", href: "/sambah-events", status: eventDeadLetter.length ? "dead letter" : "fila simulada", count: eventBusEvents.length, summary: "Event store, outbox, retry, dead letter e consumidores mockados." },
      { key: "messaging", title: "Mensageria", href: "/sambah-messaging", status: "internal padrao", count: eventBusEvents.filter((item) => String(item.type || "").startsWith("messaging.")).length, summary: "Contratos, roteamento, replay e adapters futuros Redis/RabbitMQ/Kafka." },
      { key: "cockpit", title: "Cockpit Operacional", href: "/sambah-observability", status: operationalAlerts.some((item) => item.status === "open") ? "atencao" : "observavel", count: operationalAlerts.length, summary: "Metricas, traces, alertas e correlacao operacional." },
      { key: "security_bridge", title: "Seguranca / i9ACAO", href: "/sambah-security", status: securityIncidents.some((item) => item.status === "open" && ["high", "critical"].includes(item.severity)) ? "incidente aberto" : "simulado", count: securityIncidents.length, summary: "Incidentes, acoes mockadas e contrato futuro i9ACAO." },
      { key: "lgpd_logs", title: "LGPD e Logs Criticos", href: "/sambah-lgpd", status: privacyRequests.some((item) => item.status === "open") ? "solicitacao aberta" : "governanca", count: privacyRequests.length, summary: "Logs criticos, exportacao mascarada, retencao e solicitacoes LGPD." },
      { key: "database", title: "Banco / PostgreSQL", href: "/sambah-database", status: "json padrao", count: 7, summary: "Database Layer, migrations SQL e PostgreSQL opcional preparado." },
      { key: "audit", title: "Auditoria", href: "/admin/auditoria", status: "ativa", count: auditLogs.length, summary: "Eventos operacionais, negacoes e trilha de seguranca." },
      { key: "permissions", title: "Usuarios e Permissoes", href: "/admin/permissoes", status: "mock/internal", count: this.permissions?.matrix?.().roles?.length || 5, summary: "Perfis ADMIN, CAIXA, OPERADOR, ATENDENTE e AUDITOR." },
      { key: "security", title: "Seguranca e i9ACAO futuro", href: "/sambah-central#seguranca", status: "contrato futuro", count: securityEvents.length, summary: "Eventos preparados sem envio real para i9ACAO." },
      { key: "integrations", title: "Integracoes futuras", href: "/sambah-central#integracoes", status: "contratos", count: 0, summary: "Pix, TEF, ERP, MQTT e hardware seguem desativados." },
      { key: "status", title: "Status do Ecossistema", href: "/sambah-central#status", status: openAlerts.length ? "atencao" : "operacional", count: openAlerts.length, summary: "Saude dos modulos e alertas em aberto." }
    ];

    return {
      ok: true,
      generated_at: this.now().toISOString(),
      mode: "simulated",
      totals: {
        payments: payments.length,
        wallets: wallets.length,
        devices: devices.length,
        products: products.length,
        alerts: alerts.length,
        open_alerts: openAlerts.length,
        audit_logs: auditLogs.length,
        autoserve_sessions: sessions.length,
        release_tokens: releases.length,
        delivery_events: deliveryEvents.length,
        voice_messages: voiceMessages.length,
        voice_sessions: voiceSessions.length,
        security_events: securityEvents.length,
        weight_readings: weightReadings.length,
        weight_validations: weightValidations.length,
        weight_events: weightEvents.length,
        weight_alerts: weightAlerts.length,
        weight_fraud_suspected: weightFrauds.length,
        locker_zones: lockerZones.length,
        secure_pickup_sessions: securePickupSessions.length,
        event_bus_events: eventBusEvents.length,
        event_outbox: eventOutbox.length,
        event_dead_letter: eventDeadLetter.length,
        operational_alerts: operationalAlerts.length,
        traces: traces.length,
        security_incidents: securityIncidents.length,
        security_incidents_open: securityIncidents.filter((item) => item.status === "open").length,
        security_actions_mocked: securityActions.length,
        lgpd_privacy_requests: privacyRequests.length,
        lgpd_privacy_requests_open: privacyRequests.filter((item) => item.status === "open").length
      },
      cards,
      samples: {
        payments: payments.slice(0, 10),
        wallets: wallets.slice(0, 10),
        devices: devices.slice(0, 20),
        products: products.slice(0, 20),
        alerts: alerts.slice(0, 20),
        audit: auditLogs.slice(0, 20),
        autoserve_sessions: sessions.slice(0, 20),
        release_tokens: releases.slice(0, 20),
        delivery_events: deliveryEvents.slice(0, 20),
        security_events: securityEvents.slice(0, 20),
        weight_readings: weightReadings.slice(0, 20),
        weight_validations: weightValidations.slice(0, 20),
        weight_events: weightEvents.slice(0, 20),
        weight_alerts: weightAlerts.slice(0, 20),
        locker_zones: lockerZones.slice(0, 50),
        secure_pickup_sessions: securePickupSessions.slice(0, 20),
        event_bus_events: eventBusEvents.slice(0, 20),
        event_outbox: eventOutbox.slice(0, 20),
        event_dead_letter: eventDeadLetter.slice(0, 20),
        operational_alerts: operationalAlerts.slice(0, 20),
        traces: traces.slice(0, 20),
        security_incidents: securityIncidents.slice(0, 20),
        security_actions: securityActions.slice(0, 20),
        lgpd_privacy_requests: privacyRequests.slice(0, 20)
      }
    };
  }

  async bootstrap() {
    const created = [];
    const beverage = await this.ensureDevice({
      key: "demo-beverage-device",
      name: "Bebidas Demo",
      type: "beverage_machine",
      location: "SamBah Central",
      control_mode: "unit_based"
    });
    if (beverage.created) created.push("device_bebida");

    const locker = await this.ensureDevice({
      key: "demo-cold-locker",
      name: "Cold Locker Demo",
      type: "cold_locker",
      location: "SamBah Central",
      control_mode: "unit_based"
    });
    if (locker.created) created.push("device_cold_locker");

    const agua = await this.ensureProduct(beverage.device.id, { product_id: "agua", name: "Agua Demo", price: 6, quantity_per_release: 1, unit: "unidade", initial_quantity: 24 });
    const refri = await this.ensureProduct(locker.device.id, { product_id: "refri", name: "Refri Demo", price: 8, quantity_per_release: 1, unit: "unidade", initial_quantity: 18 });
    if (agua.created) created.push("produto_agua");
    if (refri.created) created.push("produto_refri");

    const wallet = await this.wallet.createWallet({ customer_id: "cliente-demo" });
    if (!wallet.existing) {
      await this.wallet.addCredit("cliente-demo", { amount: 50, reason: "demo_bootstrap" });
      created.push("wallet_demo");
    }

    let payment = await this.repositories.payments.findOne((item) => item.id === "payment-demo");
    if (!payment) {
      payment = (await this.core.createPayment({ id: "payment-demo", amount: 25, method: "manual_simulated", status: "paid", customer_id: "cliente-demo", channel: "ecosystem_demo", metadata: { demo: true } })).payment;
      created.push("pagamento_demo");
    }

    let alert = await this.repositories.machineAlerts.findOne((item) => item.type === "demo_operational_alert");
    if (!alert) {
      alert = await this.device.createAlert({ device_id: beverage.device.id, type: "demo_operational_alert", severity: "warning", message: "Alerta demo do ecossistema SamBah" });
      created.push("alerta_demo");
    }

    let session = await this.repositories.voiceSessions.findOne((item) => item.id === "voice-session-demo");
    if (!session) {
      session = await this.repositories.voiceSessions.insert({ id: "voice-session-demo", customer_id: "cliente-demo", channel: "whatsapp_mock", status: "open", last_intent: "consultar_status", metadata: { demo: true } });
      created.push("voice_session_demo");
    }

    let security = await this.repositories.i9acaoSecurityEvents.findOne((item) => item.eventType === "door_open_without_payment");
    if (!security) {
      security = await this.repositories.i9acaoSecurityEvents.insert({
        id: crypto.randomUUID(),
        source: "sambah-pay",
        module: "ecosystem-security",
        eventType: "door_open_without_payment",
        severity: "medium",
        deviceId: locker.device.id,
        releaseTokenId: null,
        paymentId: null,
        expectedWeight: null,
        actualWeight: null,
        unit: null,
        timestamp: this.now().toISOString(),
        actionRequired: true,
        simulated: true,
        sent: false
      });
      created.push("evento_i9acao_demo");
    }

    await this.audit.record({ type: "sambah_ecosystem_demo_bootstrap", status: "success", message: "Demo operacional SamBah preparada", context: { created, device_ids: [beverage.device.id, locker.device.id] } });
    return { ok: true, created, devices: [beverage.device, locker.device], payment, alert, voice_session: session, security_event: security, status: await this.status() };
  }

  async createDemoDevice(input = {}) {
    const kind = input.kind || "voice_autoserve";
    const base = kind === "locker"
      ? { key: "demo-cold-locker", name: "Cold Locker Demo", type: "cold_locker", location: "Painel Devices", control_mode: "unit_based" }
      : { key: "demo-voice-autoserve", name: "Geladeira Voice Demo", type: "smart_fridge", location: "Painel Voice", control_mode: "unit_based" };
    const result = await this.ensureDevice(base);
    const product = await this.ensureProduct(result.device.id, { product_id: input.product_id || "agua", name: input.name || "Agua", price: Number(input.price || 6), quantity_per_release: 1, unit: "unidade", initial_quantity: Number(input.initial_quantity || 12) });
    await this.device.heartbeat(result.device.id, { status: "online", source: "demo_device" });
    await this.audit.record({ type: "sambah_ecosystem_demo_device_ready", status: "success", message: "Device demo preparado", context: { device_id: result.device.id, product_id: product.product.product_id } });
    return { ok: true, device: result.device, product: product.product, stock: product.stock, created: result.created || product.created };
  }

  async securityEvents() {
    const items = await this.repositories.i9acaoSecurityEvents.all();
    const counts = SECURITY_EVENT_TYPES.reduce((acc, type) => {
      acc[type] = items.filter((item) => item.eventType === type).length;
      return acc;
    }, {});
    return { ok: true, mode: "future_contract_only", event_types: SECURITY_EVENT_TYPES, counts, total: items.length, items };
  }

  async ensureDevice({ key, name, type, location, control_mode }) {
    const existing = await this.repositories.devices.findOne((item) => item.metadata?.demo_key === key || item.name === name);
    if (existing) return { device: existing, created: false };
    const result = await this.device.createDevice({ name, type, location, control_mode, status: "online", metadata: { demo_key: key } });
    return { device: result.device, created: true };
  }

  async ensureProduct(deviceId, input) {
    const products = await this.repositories.deviceProducts.all();
    const existing = products.find((item) => item.device_id === deviceId && item.product_id === input.product_id);
    if (existing) {
      const stocks = await this.repositories.stockVolumes.all();
      return { product: existing, stock: stocks.find((item) => item.device_id === deviceId && item.product_id === input.product_id) || null, created: false };
    }
    const result = await this.device.addDeviceProduct(deviceId, input);
    return { ...result, created: true };
  }
}
