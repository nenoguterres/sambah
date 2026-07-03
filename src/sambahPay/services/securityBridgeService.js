import crypto from "node:crypto";

const INCIDENT_STATUSES = new Set(["open", "acknowledged", "investigating", "resolved", "dismissed", "escalated"]);
const MOCK_ACTIONS = new Set(["acknowledge", "resolve", "dismiss", "escalate", "block_device_mock", "block_customer_mock", "mark_camera_clip_mock", "notify_operator_mock", "trigger_siren_mock"]);

const SECURITY_RULES = {
  "locker.pickup.fraud_suspected": { module: "locker", severity: "high", message: "Retirada acima do autorizado detectada no locker", recommendedAction: "Verificar camera, bloquear sessao e acionar operador" },
  "locker.pickup.partial": { module: "locker", severity: "medium", message: "Retirada parcial suspeita no locker", recommendedAction: "Conferir itens pendentes e acompanhar cliente" },
  "machine_alert.created": { module: "devices", severity: "high", message: "Alerta critico de maquina", recommendedAction: "Acionar operador e verificar dispositivo" },
  "weight.fraud_suspected": { module: "weight", severity: "high", message: "Fraude por peso suspeita", recommendedAction: "Conferir peso, camera e sessao" },
  "weight.inventory_mismatch": { module: "weight", severity: "medium", message: "Divergencia entre estoque logico e peso", recommendedAction: "Recontar estoque e revisar leituras" },
  secure_zone_mismatch: { module: "locker", severity: "high", message: "Zona segura divergente", recommendedAction: "Bloquear sessao e investigar porta" },
  zone_not_authorized: { module: "locker", severity: "high", message: "Tentativa de zona nao autorizada", recommendedAction: "Bloquear sessao e acionar operador" },
  door_open_without_payment: { module: "locker", severity: "critical", message: "Porta aberta sem pagamento confirmado", recommendedAction: "Acionar operador e bloquear dispositivo" },
  door_open_without_weight_change: { module: "weight", severity: "high", message: "Porta aberta sem mudanca de peso", recommendedAction: "Conferir camera e sensor de peso" },
  "device.offline": { module: "devices", severity: "high", message: "Dispositivo critico offline", recommendedAction: "Verificar conectividade e operacao manual" },
  delivery_failed: { module: "autoserve", severity: "high", message: "Entrega simulada falhou", recommendedAction: "Revisar liberacao e orientar cliente" },
  over_delivery: { module: "weight", severity: "high", message: "Entrega acima do autorizado", recommendedAction: "Investigar excesso e revisar estoque" },
  under_delivery: { module: "weight", severity: "medium", message: "Entrega abaixo do autorizado", recommendedAction: "Verificar produto e compensar cliente se necessario" },
  pin_invalid_attempts: { module: "locker", severity: "medium", message: "Tentativas invalidas de PIN", recommendedAction: "Monitorar cliente e bloquear se recorrente" },
  secure_pickup_blocked: { module: "locker", severity: "high", message: "Secure Pickup bloqueado", recommendedAction: "Investigar sessao bloqueada" },
  "erp.sync.failed": { module: "erp", severity: "medium", message: "Falha ERP impactando operacao", recommendedAction: "Reprocessar outbox e manter venda conciliada" }
};

const CRITICAL_DEVICE_TYPES = new Set(["cold_locker", "smart_fridge", "beverage_machine", "beer_tap"]);

export class SambahSecurityBridgeService {
  constructor({ repositories, audit, eventBus, now = () => new Date() } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.eventBus = eventBus;
    this.now = now;
  }

  async handleEvent(event = {}) {
    const rule = this.ruleForEvent(event);
    if (!rule) return { ok: true, skipped: true };
    if (event.type === "device.offline" && !(await this.isCriticalDeviceEvent(event))) return { ok: true, skipped: true };
    return this.createIncidentFromEvent(event, rule);
  }

  ruleForEvent(event = {}) {
    if (event.type === "machine_alert.created" && !["high", "critical", "error"].includes(String(event.payload?.severity || "").toLowerCase())) return null;
    if (SECURITY_RULES[event.type]) return SECURITY_RULES[event.type];
    const payloadType = event.payload?.type || event.payload?.eventType || event.payload?.status || event.payload?.reason;
    if (SECURITY_RULES[payloadType]) return SECURITY_RULES[payloadType];
    return null;
  }

  async createIncidentFromEvent(event, rule) {
    const existing = await this.repositories.securityIncidents.findOne((item) => item.sourceEventId === event.id);
    if (existing) return { ok: true, incident: existing, existing: true };
    const payload = event.payload || {};
    const incident = await this.createIncident({
      sourceEventId: event.id,
      source: event.source || "sambah-pay",
      module: rule.module,
      eventType: event.type,
      severity: rule.severity,
      correlationId: event.correlationId,
      causationId: event.causationId || event.id,
      deviceId: payload.device_id || payload.deviceId || payload.device?.id || null,
      zoneId: payload.zone_id || payload.zoneId || payload.zone?.zone_id || null,
      customerId: payload.customer_id || payload.customerId || payload.session?.customer_id || null,
      paymentId: payload.payment_id || payload.paymentId || payload.session?.payment_id || null,
      pickupSessionId: payload.pickup_session_id || payload.pickupSessionId || payload.session?.id || null,
      message: rule.message,
      recommendedAction: rule.recommendedAction,
      payload
    });
    return { ok: true, incident };
  }

  async createIncident(input = {}) {
    const incident = await this.repositories.securityIncidents.insert({
      id: input.id || "sec_inc_" + crypto.randomUUID(),
      source: input.source || "sambah-pay",
      module: input.module || "security",
      eventType: input.eventType || "security.manual",
      severity: input.severity || "medium",
      status: "open",
      correlationId: input.correlationId || "corr_" + crypto.randomUUID(),
      causationId: input.causationId || input.sourceEventId || "manual_simulated_security_event",
      sourceEventId: input.sourceEventId || null,
      deviceId: input.deviceId || null,
      zoneId: input.zoneId || null,
      customerId: input.customerId || null,
      paymentId: input.paymentId || null,
      pickupSessionId: input.pickupSessionId || null,
      message: input.message || "Ocorrencia de seguranca simulada",
      payload: input.payload || {},
      recommendedAction: input.recommendedAction || "Acionar operador e registrar evidencia",
      createdAt: this.now().toISOString(),
      resolvedAt: null,
      resolvedBy: null
    });
    await this.repositories.securityEvents.insert({ id: "sec_evt_" + crypto.randomUUID(), incidentId: incident.id, type: "security.incident.created", correlationId: incident.correlationId, causationId: incident.causationId, payload: incident, createdAt: this.now().toISOString() });
    await this.audit.record({ type: "sambah_security_incident_created", status: "warning", message: "Incidente de seguranca simulado criado", context: { incident_id: incident.id, event_type: incident.eventType, severity: incident.severity, correlationId: incident.correlationId } });
    await this.eventBus?.publish?.({ type: "security.incident.created", aggregateType: "security_incident", aggregateId: incident.id, payload: this.futureContract(incident), correlationId: incident.correlationId, causationId: incident.causationId, metadata: { origin: "security_bridge_simulated" } });
    if (["high", "critical"].includes(incident.severity)) {
      await this.eventBus?.createOperationalAlert?.({ type: "security.incident.open", severity: incident.severity, message: incident.message, event_id: incident.id, correlationId: incident.correlationId });
    }
    return incident;
  }

  async listIncidents({ status, severity, limit = 100 } = {}) {
    let items = await this.repositories.securityIncidents.all();
    if (status) items = items.filter((item) => item.status === status);
    if (severity) items = items.filter((item) => item.severity === severity);
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async getIncident(id) {
    const incident = await this.repositories.securityIncidents.findById(id);
    return incident ? { ok: true, incident, future_contract: this.futureContract(incident) } : { ok: false, error: "security_incident_not_found" };
  }

  async action(id, action, input = {}) {
    if (!MOCK_ACTIONS.has(action)) return { ok: false, error: "security_action_not_supported" };
    const incident = await this.repositories.securityIncidents.findById(id);
    if (!incident) return { ok: false, error: "security_incident_not_found" };
    const status = statusForAction(action, incident.status);
    if (!INCIDENT_STATUSES.has(status)) return { ok: false, error: "security_status_not_supported" };
    const patch = { status };
    if (status === "resolved" || status === "dismissed") {
      patch.resolvedAt = this.now().toISOString();
      patch.resolvedBy = input.operator_id || input.resolved_by || input.actor || "security-operator";
    }
    const updated = await this.repositories.securityIncidents.update(id, patch);
    const actionLog = await this.repositories.securityActions.insert({ id: "sec_act_" + crypto.randomUUID(), incidentId: id, action, status, actor: input.actor || input.operator_id || "security-operator", note: input.note || "", mocked: true, createdAt: this.now().toISOString() });
    await this.audit.record({ type: "sambah_security_incident_" + action, status: "success", message: "Acao de seguranca simulada registrada", context: { incident_id: id, action, mocked: true } });
    const eventType = securityEventForAction(action);
    await this.repositories.securityEvents.insert({ id: "sec_evt_" + crypto.randomUUID(), incidentId: id, type: eventType, correlationId: updated.correlationId, causationId: updated.id, payload: actionLog, createdAt: this.now().toISOString() });
    await this.eventBus?.publish?.({ type: eventType, aggregateType: "security_incident", aggregateId: id, payload: { incident: updated, action: actionLog }, correlationId: updated.correlationId, causationId: updated.id, metadata: { origin: "security_action_simulated" } });
    if (action.endsWith("_mock")) {
      await this.eventBus?.publish?.({ type: "security.action.mocked", aggregateType: "security_incident", aggregateId: id, payload: { incident: updated, action: actionLog }, correlationId: updated.correlationId, causationId: actionLog.id, metadata: { origin: "security_action_simulated" } });
    }
    return { ok: true, incident: updated, action: actionLog };
  }

  async dashboard() {
    const [incidents, actions, securityEvents] = await Promise.all([
      this.repositories.securityIncidents.all(),
      this.repositories.securityActions.all(),
      this.repositories.securityEvents.all()
    ]);
    return {
      ok: true,
      mode: "simulated",
      totals: {
        incidents: incidents.length,
        open: incidents.filter((item) => item.status === "open").length,
        critical: incidents.filter((item) => item.severity === "critical").length,
        actions_mocked: actions.length,
        events: securityEvents.length
      },
      by_severity: countBy(incidents, "severity"),
      by_module: countBy(incidents, "module"),
      by_status: countBy(incidents, "status"),
      recent_incidents: incidents.slice(0, 30).map(maskIncident),
      recent_actions: actions.slice(0, 30),
      future_contracts: incidents.slice(0, 10).map((incident) => this.futureContract(incident))
    };
  }

  async rules() {
    const custom = await this.repositories.securityRules.all();
    return { ok: true, defaults: SECURITY_RULES, items: custom };
  }

  async createRule(input = {}) {
    const saved = await this.repositories.securityRules.insert({ id: "sec_rule_" + crypto.randomUUID(), ...input, simulated: true });
    return { ok: true, rule: saved };
  }

  async deviceMap() {
    const items = await this.repositories.securityDeviceMap.all();
    return { ok: true, total: items.length, items };
  }

  async mapDevice(input = {}) {
    const saved = await this.repositories.securityDeviceMap.insert({ id: input.id || "sec_map_" + crypto.randomUUID(), deviceId: input.deviceId || input.device_id || null, deviceType: input.deviceType || input.device_type || null, cameraId: input.cameraId || input.camera_id || null, sensorId: input.sensorId || input.sensor_id || null, critical: input.critical !== false, simulated: true });
    return { ok: true, map: saved };
  }

  async simulate(type, input = {}) {
    const eventType = simulateTypeToEvent(type);
    const rule = SECURITY_RULES[eventType] || SECURITY_RULES[input.eventType] || SECURITY_RULES["machine_alert.created"];
    return { ok: true, incident: await this.createIncident({ ...input, eventType, module: rule.module, severity: input.severity || rule.severity, message: input.message || rule.message, recommendedAction: rule.recommendedAction, payload: { simulated: true, ...input } }) };
  }

  async isCriticalDeviceEvent(event) {
    const deviceId = event.payload?.device_id || event.payload?.deviceId || event.aggregateId;
    if (!deviceId) return true;
    const mapped = await this.repositories.securityDeviceMap.findOne((item) => item.deviceId === deviceId && item.critical !== false);
    if (mapped) return true;
    const device = await this.repositories.devices.findById(deviceId);
    return !device || CRITICAL_DEVICE_TYPES.has(device.type);
  }

  futureContract(incident = {}) {
    return {
      source: "sambah-pay",
      target: "i9acao-security",
      eventType: "security.incident.created",
      severity: incident.severity,
      correlationId: incident.correlationId,
      deviceId: incident.deviceId,
      zoneId: incident.zoneId,
      cameraId: incident.payload?.cameraId || incident.payload?.camera_id || null,
      sensorId: incident.payload?.sensorId || incident.payload?.sensor_id || null,
      recommendedAction: incident.recommendedAction,
      timestamp: incident.createdAt || this.now().toISOString(),
      payload: incident.payload || {}
    };
  }
}

export class SambahSecurityIncidentService {
  constructor({ bridge }) { this.bridge = bridge; }
  list(params) { return this.bridge.listIncidents(params); }
  get(id) { return this.bridge.getIncident(id); }
}

export class SambahSecurityRuleService {
  constructor({ bridge }) { this.bridge = bridge; }
  list() { return this.bridge.rules(); }
  create(input) { return this.bridge.createRule(input); }
}

export class SambahSecurityActionService {
  constructor({ bridge }) { this.bridge = bridge; }
  action(id, action, input) { return this.bridge.action(id, action, input); }
}

export class SambahSecurityDeviceMapService {
  constructor({ bridge }) { this.bridge = bridge; }
  list() { return this.bridge.deviceMap(); }
  create(input) { return this.bridge.mapDevice(input); }
}

function statusForAction(action, current) {
  if (action === "acknowledge") return "acknowledged";
  if (action === "resolve") return "resolved";
  if (action === "dismiss") return "dismissed";
  if (action === "escalate") return "escalated";
  return current || "open";
}

function securityEventForAction(action) {
  if (action === "acknowledge") return "security.incident.acknowledged";
  if (action === "resolve") return "security.incident.resolved";
  if (action === "dismiss") return "security.incident.dismissed";
  if (action === "escalate") return "security.incident.escalated";
  return "security.action.mocked";
}

function simulateTypeToEvent(type) {
  return {
    "locker-fraud": "locker.pickup.fraud_suspected",
    "zone-mismatch": "zone_not_authorized",
    "device-offline": "device.offline",
    "door-open-without-payment": "door_open_without_payment",
    "weight-fraud": "weight.fraud_suspected"
  }[type] || type || "security.manual";
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function maskIncident(incident) {
  const customerId = incident.customerId ? String(incident.customerId).replace(/^(.{3}).+(.{2})$/, "$1***$2") : null;
  return { ...incident, customerId };
}
