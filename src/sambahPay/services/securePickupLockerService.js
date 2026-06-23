import crypto from "node:crypto";
import { requireFields } from "../models/schemas.js";

const SESSION_STATUS = ["valid", "started", "doors_opened", "partial_pickup", "completed", "expired", "blocked", "manual_review", "fraud_suspected"];
const ITEM_STATUS = ["pending", "door_opened", "picked_up", "not_picked_up", "extra_quantity_suspected", "wrong_zone_attempt", "manual_review"];
const ZONE_STATUS = ["available", "reserved", "open", "closed", "blocked", "maintenance", "empty"];

export class SambahSecurePickupLockerService {
  constructor({ repositories, audit, coreService, deviceService, eventBus, now = () => new Date(), pinTtlMs = 15 * 60 * 1000, maxAttempts = 3 } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.core = coreService;
    this.device = deviceService;
    this.eventBus = eventBus;
    this.now = now;
    this.pinTtlMs = pinTtlMs;
    this.maxAttempts = maxAttempts;
  }

  async bootstrap() {
    let device = await this.repositories.devices.findOne((item) => item.metadata?.demo_key === "secure-pickup-locker-frio");
    if (!device) {
      device = (await this.device.createDevice({
        name: "Locker Frio Demo",
        type: "cold_locker",
        location: "SamBah Central",
        control_mode: "access_based",
        status: "online",
        metadata: { demo_key: "secure-pickup-locker-frio" }
      })).device;
    }
    const sizes = ["P", "P", "M", "M", "G"];
    const products = ["agua", "refri", "suco", "energetico"];
    const created = [];
    for (let index = 1; index <= 40; index += 1) {
      const zoneId = "Z" + String(index).padStart(2, "0");
      const existing = await this.repositories.lockerZones.findOne((item) => item.device_id === device.id && item.zone_id === zoneId);
      if (existing) continue;
      const productId = products[(index - 1) % products.length];
      const size = sizes[(index - 1) % sizes.length];
      const weight = productId === "agua" ? 520 : productId === "refri" ? 380 : productId === "suco" ? 340 : 270;
      const zone = await this.repositories.lockerZones.insert({
        id: crypto.randomUUID(),
        device_id: device.id,
        zone_id: zoneId,
        label: "Porta " + zoneId,
        size,
        product_id: productId,
        status: "available",
        door_status: "closed",
        stock_quantity: 6,
        current_weight: weight * 6,
        expected_unit_weight: weight
      });
      created.push(zone);
    }
    const zonesResult = await this.listZones();
    await this.audit.record({ type: "sambah_locker_bootstrap", status: "success", message: "Locker frio demo preparado", context: { device_id: device.id, zones_created: created.length } });
    return { ok: true, device, created: created.length, total: zonesResult.total, zones: zonesResult.items };
  }

  async createSession(input = {}) {
    requireFields(input, ["payment_id", "items"]);
    const payment = await this.core.getPayment(input.payment_id);
    if (!payment || payment.status !== "paid") return { ok: false, error: "payment_not_confirmed", message: "Secure Pickup Session exige pagamento confirmado." };
    const itemsInput = Array.isArray(input.items) ? input.items : [];
    if (!itemsInput.length) return { ok: false, error: "items_required" };
    const zones = await this.repositories.lockerZones.all();
    const pin = input.pin || String(Math.floor(100000 + Math.random() * 900000));
    const session = await this.repositories.securePickupSessions.insert({
      id: crypto.randomUUID(),
      pin_hash: this.mockHash(pin),
      pin_mock: pin,
      payment_id: input.payment_id,
      order_id: input.order_id || input.orderId || "order-" + crypto.randomUUID().slice(0, 8),
      customer_id: input.customer_id || payment.customer_id || null,
      phone: input.phone || null,
      device_id: input.device_id || zones[0]?.device_id || null,
      status: "valid",
      expires_at: new Date(this.now().getTime() + Number(input.ttl_ms || this.pinTtlMs)).toISOString(),
      started_at: null,
      completed_at: null,
      max_open_seconds: Number(input.max_open_seconds || 45),
      max_attempts: Number(input.max_attempts || this.maxAttempts)
    });
    const createdItems = [];
    for (const item of itemsInput) {
      const zone = await this.resolveZone(item, zones, session.device_id);
      if (!zone) return { ok: false, error: "locker_zone_not_found", product_id: item.product_id };
      const quantity = Number(item.quantity || 1);
      const expectedWeight = Number(item.expected_weight || zone.expected_unit_weight * quantity || 0);
      const created = await this.repositories.securePickupItems.insert({
        id: crypto.randomUUID(),
        pickup_session_id: session.id,
        product_id: item.product_id || zone.product_id,
        zone_id: zone.zone_id,
        quantity,
        expected_weight: expectedWeight,
        actual_weight: null,
        tolerance_percent: Number(item.tolerance_percent || 8),
        status: "pending",
        picked_at: null
      });
      createdItems.push(created);
      await this.repositories.lockerZones.update(zone.id, { status: "reserved" });
    }
    await this.recordEvent(session.id, "secure_pickup_session_created", { payment_id: payment.id, items: createdItems.length });
    await this.audit.record({ type: "sambah_secure_pickup_session_created", status: "success", message: "Sessao Secure Pickup criada", context: { session_id: session.id, payment_id: payment.id, items: createdItems.length } });
    await this.eventBus?.publish?.({ type: "locker.pickup.created", aggregateType: "secure_pickup", aggregateId: session.id, payload: { session, items: createdItems } });
    return { ok: true, session, pin, items: createdItems };
  }

  async validatePin(input = {}) {
    const session = await this.findSession(input);
    if (!session) return { ok: false, error: "secure_pickup_session_not_found" };
    const pin = String(input.pin || "");
    if (this.isExpired(session)) {
      const updated = await this.repositories.securePickupSessions.update(session.id, { status: "expired" });
      await this.recordAttempt(session, pin, false, "expired");
      await this.recordEvent(session.id, "pin_expired", {});
      return { ok: false, error: "pin_expired", session: updated };
    }
    if (["blocked", "completed", "fraud_suspected"].includes(session.status)) return { ok: false, error: "session_not_valid", session };
    if (session.pin_hash !== this.mockHash(pin)) {
      const attempts = await this.recordAttempt(session, pin, false, "invalid_pin");
      if (attempts.wrong_attempts >= Number(session.max_attempts || this.maxAttempts)) {
        const blocked = await this.repositories.securePickupSessions.update(session.id, { status: "blocked" });
        await this.recordEvent(session.id, "pin_blocked_max_attempts", { wrong_attempts: attempts.wrong_attempts });
        await this.audit.record({ type: "sambah_secure_pickup_blocked", status: "warning", message: "PIN bloqueado por tentativas", context: { session_id: session.id } });
        return { ok: false, error: "pin_blocked", session: blocked };
      }
      return { ok: false, error: "invalid_pin", attempts_left: Number(session.max_attempts || this.maxAttempts) - attempts.wrong_attempts };
    }
    await this.recordAttempt(session, pin, true, "accepted");
    return { ok: true, session, items: (await this.items(session.id)).items };
  }

  async start(input = {}) {
    const validation = await this.validatePin(input);
    if (!validation.ok) return validation;
    const session = await this.repositories.securePickupSessions.update(validation.session.id, { status: "started", started_at: this.now().toISOString() });
    await this.recordEvent(session.id, "secure_pickup_started", {});
    return { ok: true, session, items: validation.items };
  }

  async openAuthorizedZones(input = {}) {
    const validation = await this.validatePin(input);
    if (!validation.ok) return validation;
    const session = validation.session;
    const items = (await this.items(session.id)).items;
    const opened = [];
    for (const item of items.filter((entry) => ["pending", "door_opened", "not_picked_up"].includes(entry.status))) {
      const zone = await this.findZone(item.zone_id, session.device_id);
      if (!zone) continue;
      const updatedZone = await this.repositories.lockerZones.update(zone.id, { status: "open", door_status: "open" });
      const updatedItem = await this.repositories.securePickupItems.update(item.id, { status: "door_opened" });
      await this.recordEvent(session.id, "locker_zone_opened", { zone_id: item.zone_id, product_id: item.product_id });
      opened.push({ zone_id: updatedZone.zone_id, zone: updatedZone, item: updatedItem });
    }
    const updated = await this.repositories.securePickupSessions.update(session.id, { status: "doors_opened", started_at: session.started_at || this.now().toISOString() });
    await this.audit.record({ type: "sambah_secure_pickup_zones_opened", status: "success", message: "Zonas autorizadas abertas", context: { session_id: session.id, zones: opened.map((item) => item.zone.zone_id) } });
    return { ok: true, session: updated, opened_zones: opened };
  }

  async openZone(zoneId, input = {}) {
    const zone = await this.findZone(zoneId, input.device_id);
    if (!zone) return { ok: false, error: "locker_zone_not_found" };
    if (input.session_id) {
      const item = await this.repositories.securePickupItems.findOne((entry) => entry.pickup_session_id === input.session_id && entry.zone_id === zone.zone_id);
      if (!item) {
        await this.recordWrongZone(input.session_id, zone.zone_id);
        const session = await this.repositories.securePickupSessions.findById(input.session_id);
        await this.eventBus?.publish?.({ type: "zone_not_authorized", aggregateType: "secure_pickup", aggregateId: input.session_id, payload: { session, zone_id: zone.zone_id, device_id: zone.device_id, customer_id: session?.customer_id, payment_id: session?.payment_id }, correlationId: session?.correlationId });
        return { ok: false, error: "zone_not_authorized", message: "PIN nao autoriza esta zona." };
      }
    }
    const updated = await this.repositories.lockerZones.update(zone.id, { status: "open", door_status: "open" });
    if (input.session_id) await this.recordEvent(input.session_id, "locker_zone_opened_manual", { zone_id: zone.zone_id });
    return { ok: true, zone: updated };
  }

  async closeZone(zoneId, input = {}) {
    const zone = await this.findZone(zoneId, input.device_id);
    if (!zone) return { ok: false, error: "locker_zone_not_found" };
    const updated = await this.repositories.lockerZones.update(zone.id, { status: zone.stock_quantity > 0 ? "available" : "empty", door_status: "closed" });
    if (input.session_id) await this.recordEvent(input.session_id, "locker_zone_closed", { zone_id: zone.zone_id });
    return { ok: true, zone: updated };
  }

  async confirmItem(input = {}) {
    requireFields(input, ["pickup_session_id", "item_id"]);
    const session = await this.repositories.securePickupSessions.findById(input.pickup_session_id);
    const item = await this.repositories.securePickupItems.findById(input.item_id);
    if (!session || !item || item.pickup_session_id !== session.id) return { ok: false, error: "secure_pickup_item_not_found" };
    const actual = Number(input.actual_weight ?? input.removed_weight ?? 0);
    const tolerance = Math.abs(Number(item.expected_weight || 0) * (Number(item.tolerance_percent || 8) / 100));
    let status = "picked_up";
    if (actual <= 0) status = "not_picked_up";
    if (actual > Number(item.expected_weight || 0) + tolerance) status = "extra_quantity_suspected";
    if (actual > 0 && actual < Math.max(0, Number(item.expected_weight || 0) - tolerance)) status = "manual_review";
    const pickedAt = status === "picked_up" ? this.now().toISOString() : null;
    const updatedItem = await this.repositories.securePickupItems.update(item.id, { status, actual_weight: actual, picked_at: pickedAt });
    const zone = await this.findZone(item.zone_id, session.device_id);
    if (zone) {
      const nextStock = status === "picked_up" ? Math.max(0, Number(zone.stock_quantity || 0) - Number(item.quantity || 1)) : Number(zone.stock_quantity || 0);
      const nextWeight = Math.max(0, Number(zone.current_weight || 0) - actual);
      await this.repositories.lockerZones.update(zone.id, { status: nextStock > 0 ? "available" : "empty", door_status: "closed", stock_quantity: nextStock, current_weight: nextWeight });
    }
    await this.recordEvent(session.id, "secure_pickup_item_confirmed", { item_id: item.id, zone_id: item.zone_id, status, actual_weight: actual });
    if (["extra_quantity_suspected", "manual_review"].includes(status)) await this.criticalDivergence(session, status, { item_id: item.id, zone_id: item.zone_id, expected_weight: item.expected_weight, actual_weight: actual });
    const updatedSession = await this.refreshSessionStatus(session.id);
    return { ok: true, item: updatedItem, session: updatedSession };
  }

  async complete(input = {}) {
    const session = await this.repositories.securePickupSessions.findById(input.session_id || input.id);
    if (!session) return { ok: false, error: "secure_pickup_session_not_found" };
    const resultSession = await this.refreshSessionStatus(session.id, true);
    await this.recordEvent(session.id, "secure_pickup_completed_request", { status: resultSession.status });
    await this.eventBus?.publish?.({ type: resultSession.status === "partial_pickup" ? "locker.pickup.partial" : "locker.pickup.completed", aggregateType: "secure_pickup", aggregateId: session.id, payload: { session: resultSession } });
    return { ok: true, session: resultSession, items: (await this.items(session.id)).items };
  }

  async block(input = {}) {
    const session = await this.repositories.securePickupSessions.findById(input.session_id || input.id);
    if (!session) return { ok: false, error: "secure_pickup_session_not_found" };
    const updated = await this.repositories.securePickupSessions.update(session.id, { status: "blocked" });
    await this.recordEvent(session.id, "secure_pickup_blocked", { reason: input.reason || "manual_block" });
    await this.audit.record({ type: "sambah_secure_pickup_blocked", status: "warning", message: "Sessao Secure Pickup bloqueada", context: { session_id: session.id, reason: input.reason || "manual_block" } });
    return { ok: true, session: updated };
  }

  async createPendingSession(input = {}) {
    const source = await this.repositories.securePickupSessions.findById(input.session_id || input.source_session_id);
    if (!source) return { ok: false, error: "secure_pickup_session_not_found" };
    const pending = (await this.items(source.id)).items.filter((item) => !["picked_up", "extra_quantity_suspected"].includes(item.status));
    if (!pending.length) return { ok: false, error: "no_pending_items" };
    return this.createSession({
      payment_id: source.payment_id,
      order_id: source.order_id + "-pending",
      customer_id: source.customer_id,
      phone: source.phone,
      device_id: source.device_id,
      items: pending.map((item) => ({ product_id: item.product_id, zone_id: item.zone_id, quantity: item.quantity, expected_weight: item.expected_weight, tolerance_percent: item.tolerance_percent }))
    });
  }

  async get(id) {
    const session = await this.repositories.securePickupSessions.findById(id);
    if (!session) return { ok: false, error: "secure_pickup_session_not_found" };
    return { ok: true, session, items: (await this.items(id)).items };
  }

  async items(sessionId) {
    const items = (await this.repositories.securePickupItems.all()).filter((item) => item.pickup_session_id === sessionId);
    return { ok: true, total: items.length, items };
  }

  async attempts() {
    const items = await this.repositories.securePickupAttempts.all();
    return { ok: true, total: items.length, items };
  }

  async events() {
    const items = await this.repositories.securePickupEvents.all();
    return { ok: true, total: items.length, items };
  }

  async listZones() {
    const items = await this.repositories.lockerZones.all();
    return { ok: true, total: items.length, items };
  }

  async weightCheck(zoneId, input = {}) {
    const zone = await this.findZone(zoneId, input.device_id);
    if (!zone) return { ok: false, error: "locker_zone_not_found" };
    const updated = await this.repositories.lockerZones.update(zone.id, { current_weight: Number(input.current_weight ?? input.weight ?? zone.current_weight) });
    return { ok: true, zone: updated };
  }

  async refreshSessionStatus(sessionId, completeRequested = false) {
    const session = await this.repositories.securePickupSessions.findById(sessionId);
    const items = (await this.items(sessionId)).items;
    let status = session.status;
    if (items.some((item) => item.status === "extra_quantity_suspected")) status = "fraud_suspected";
    else if (items.every((item) => item.status === "picked_up")) status = "completed";
    else if (items.some((item) => item.status === "picked_up") && completeRequested) status = "partial_pickup";
    else if (items.some((item) => item.status === "not_picked_up") && completeRequested) status = "partial_pickup";
    const patch = { status };
    if (["completed", "partial_pickup", "fraud_suspected"].includes(status)) patch.completed_at = this.now().toISOString();
    return this.repositories.securePickupSessions.update(sessionId, patch);
  }

  async criticalDivergence(session, type, context = {}) {
    const alert = await this.device.createAlert({ device_id: session.device_id, type, severity: "error", message: "Divergencia critica no Secure Pickup Locker" });
    const event = await this.repositories.i9acaoSecurityEvents.insert({
      id: crypto.randomUUID(),
      source: "sambah-pay",
      module: "secure-pickup-locker",
      eventType: type === "extra_quantity_suspected" ? "security_violation" : type,
      severity: "high",
      deviceId: session.device_id,
      releaseTokenId: null,
      paymentId: session.payment_id,
      expectedWeight: context.expected_weight ?? null,
      actualWeight: context.actual_weight ?? null,
      unit: "g",
      timestamp: this.now().toISOString(),
      actionRequired: true,
      simulated: true,
      sent: false
    });
    await this.audit.record({ type: "sambah_secure_pickup_critical_divergence", status: "error", message: "Divergencia critica Secure Pickup", context: { session_id: session.id, alert_id: alert.id, i9acao_event_id: event.id, ...context } });
    await this.repositories.securePickupSessions.update(session.id, { status: "fraud_suspected" });
    await this.eventBus?.publish?.({ type: "locker.pickup.fraud_suspected", aggregateType: "secure_pickup", aggregateId: session.id, payload: { session_id: session.id, alert, event, ...context } });
    return { alert, event };
  }

  async recordWrongZone(sessionId, zoneId) {
    await this.recordEvent(sessionId, "wrong_zone_attempt", { zone_id: zoneId });
    await this.audit.record({ type: "sambah_secure_pickup_wrong_zone_attempt", status: "warning", message: "Tentativa de abrir zona nao autorizada", context: { session_id: sessionId, zone_id: zoneId } });
  }

  async recordAttempt(session, pin, accepted, reason) {
    const attempt = await this.repositories.securePickupAttempts.insert({ id: crypto.randomUUID(), pickup_session_id: session.id, pin_hash: this.mockHash(pin), accepted, reason, device_id: session.device_id });
    const attempts = (await this.repositories.securePickupAttempts.all()).filter((item) => item.pickup_session_id === session.id && item.accepted === false);
    return { attempt, wrong_attempts: attempts.length };
  }

  async recordEvent(sessionId, type, context = {}) {
    return this.repositories.securePickupEvents.insert({ id: crypto.randomUUID(), pickup_session_id: sessionId, type, context });
  }

  async resolveZone(item, zones, deviceId) {
    if (item.zone_id) return zones.find((zone) => zone.zone_id === item.zone_id || zone.id === item.zone_id);
    return zones.find((zone) => zone.device_id === deviceId && zone.product_id === item.product_id && ["available", "reserved", "closed"].includes(zone.status));
  }

  async findSession(input = {}) {
    if (input.session_id || input.id) return this.repositories.securePickupSessions.findById(input.session_id || input.id);
    if (input.pin) {
      return this.repositories.securePickupSessions.findOne((session) => session.pin_hash === this.mockHash(input.pin));
    }
    return null;
  }

  async findZone(zoneId, deviceId) {
    const zones = await this.repositories.lockerZones.all();
    return zones.find((zone) => (zone.zone_id === zoneId || zone.id === zoneId) && (!deviceId || zone.device_id === deviceId)) || null;
  }

  isExpired(session) {
    return Date.parse(session.expires_at) <= this.now().getTime();
  }

  mockHash(pin) {
    return "mock-pin-" + String(pin || "").split("").reverse().join("");
  }
}
