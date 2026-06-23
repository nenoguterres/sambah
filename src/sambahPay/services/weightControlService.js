import crypto from "node:crypto";
import { WEIGHT_STATUSES, WEIGHT_USE_TYPES, assertOneOf, requireFields } from "../models/schemas.js";

const CRITICAL_STATUSES = new Set(["weight_missing", "weight_unstable", "weight_fraud_suspected", "manual_review"]);
const I9_EVENT_BY_STATUS = {
  weight_fraud_suspected: "weight_fraud_suspected",
  weight_unstable: "weight_unstable",
  weight_missing: "door_open_without_weight_change",
  weight_over: "over_delivery",
  weight_under: "under_delivery",
  manual_review: "weight_fraud_suspected"
};

export class SambahWeightControlService {
  constructor({ repositories, audit, scaleAdapter, deviceService, coreService, now = () => new Date() } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.scaleAdapter = scaleAdapter;
    this.device = deviceService;
    this.core = coreService;
    this.now = now;
  }

  async recordReading(input = {}) {
    requireFields(input, ["device_id", "expected_weight"]);
    const adapterReading = await this.scaleAdapter.read(input);
    const expectedWeight = Number(input.expected_weight ?? adapterReading.expected_weight);
    const actualWeight = Number(adapterReading.actual_weight ?? input.actual_weight ?? 0);
    const previousWeight = input.previous_weight === undefined ? null : Number(input.previous_weight);
    const deltaWeight = input.delta_weight === undefined
      ? (previousWeight === null ? actualWeight : Math.round((previousWeight - actualWeight) * 1000) / 1000)
      : Number(input.delta_weight);
    const tolerancePercent = Number(input.tolerance_percent ?? 5);
    const useCase = input.use_case || input.use_type || "generic_weight_check";
    assertOneOf(useCase, WEIGHT_USE_TYPES, "use_case");

    const status = this.resolveStatus({
      ...input,
      expected_weight: expectedWeight,
      actual_weight: actualWeight,
      delta_weight: deltaWeight,
      tolerance_percent: tolerancePercent,
      stable: adapterReading.stable
    });

    const reading = await this.repositories.weightReadings.insert({
      id: crypto.randomUUID(),
      device_id: input.device_id,
      zone_id: input.zone_id || null,
      product_id: input.product_id || null,
      pickup_session_id: input.pickup_session_id || input.session_id || null,
      pickup_item_id: input.pickup_item_id || null,
      release_token_id: input.release_token_id || null,
      source: input.source || "mock-scale-adapter",
      use_case: useCase,
      use_type: useCase,
      expected_weight: expectedWeight,
      actual_weight: actualWeight,
      previous_weight: previousWeight,
      delta_weight: deltaWeight,
      unit: input.unit || adapterReading.unit || "g",
      tolerance_percent: tolerancePercent,
      status,
      stable: input.stable === false ? false : adapterReading.stable,
      raw_payload: adapterReading.raw
    });
    await this.recordEvent("weight_reading_recorded", { reading_id: reading.id, device_id: reading.device_id, zone_id: reading.zone_id, status });
    await this.audit.record({ type: "sambah_weight_reading_recorded", status: "info", message: "Leitura de peso simulada registrada", context: { reading_id: reading.id, device_id: reading.device_id, zone_id: reading.zone_id, status } });
    return { ok: true, reading };
  }

  async validate(input = {}) {
    requireFields(input, ["device_id", "expected_weight"]);
    const readingResult = input.reading_id ? { reading: await this.repositories.weightReadings.findById(input.reading_id) } : await this.recordReading(input);
    const reading = readingResult.reading;
    if (!reading) return { ok: false, error: "weight_reading_not_found" };

    const release = await this.findRelease(input.release_token_id || reading.release_token_id);
    const paymentId = input.payment_id || release?.payment_id || null;
    let status = this.resolveStatus({ ...input, ...reading, actual_weight: reading.actual_weight, expected_weight: reading.expected_weight, tolerance_percent: reading.tolerance_percent });
    if ((status === "weight_over" || input.force_fraud === true) && this.isCriticalDifference(reading, input) && (paymentId || release?.id || input.payment_confirmed === true || input.pickup_session_id || reading.pickup_session_id)) {
      status = "weight_fraud_suspected";
    }
    if (status !== "weight_ok" && input.payment_confirmed === true && input.manual_review !== false && status !== "weight_fraud_suspected") status = "manual_review";
    assertOneOf(status, WEIGHT_STATUSES, "status");

    const severity = this.severityFor(status);
    const validation = await this.repositories.weightValidations.insert({
      id: crypto.randomUUID(),
      weight_reading_id: reading.id,
      reading_id: reading.id,
      device_id: reading.device_id,
      zone_id: reading.zone_id || input.zone_id || null,
      product_id: reading.product_id,
      pickup_session_id: reading.pickup_session_id || input.pickup_session_id || input.session_id || null,
      pickup_item_id: reading.pickup_item_id || input.pickup_item_id || null,
      release_token_id: release?.id || reading.release_token_id || null,
      payment_id: paymentId,
      source: reading.source,
      use_case: input.use_case || input.use_type || reading.use_case || "generic_weight_check",
      use_type: input.use_type || input.use_case || reading.use_type || "generic_weight_check",
      expected_weight: reading.expected_weight,
      actual_weight: reading.actual_weight,
      previous_weight: reading.previous_weight,
      delta_weight: reading.delta_weight,
      unit: reading.unit,
      tolerance_percent: reading.tolerance_percent,
      difference: this.difference(reading),
      difference_percent: this.differencePercent(reading),
      status,
      severity,
      action_required: status !== "weight_ok",
      manual_review: status === "manual_review",
      critical: status === "weight_fraud_suspected" || CRITICAL_STATUSES.has(status),
      release_snapshot: release || null
    });

    let machineAlert = null;
    let deliveryEvent = null;
    let i9acaoEvent = null;
    let stock = null;
    let locker = null;

    if (validation.critical) {
      machineAlert = await this.device.createAlert({
        device_id: reading.device_id,
        release_token_id: validation.release_token_id,
        severity,
        type: status,
        message: "Divergencia critica de peso em modo simulado"
      });
      i9acaoEvent = await this.prepareI9AcaoEvent(validation, I9_EVENT_BY_STATUS[status] || status);
      await this.audit.record({ type: "sambah_weight_critical_divergence", status: "error", message: "Divergencia critica de peso registrada", context: { validation_id: validation.id, status, module: "weight-control", event: I9_EVENT_BY_STATUS[status] || status, alert_id: machineAlert.id, i9acao_event_id: i9acaoEvent.id } });
    }
    if (!i9acaoEvent && ["weight_over", "weight_under"].includes(status)) {
      i9acaoEvent = await this.prepareI9AcaoEvent(validation, I9_EVENT_BY_STATUS[status]);
    }

    if (validation.pickup_item_id) locker = await this.applyLockerValidation(validation);
    if (validation.use_case === "stock_inventory_weight" || validation.use_type === "stock_inventory_weight" || input.check_inventory === true) {
      stock = await this.applyInventoryValidation(validation, input);
      if (stock?.mismatch && !i9acaoEvent) i9acaoEvent = await this.prepareI9AcaoEvent(validation, "weight_inventory_mismatch");
    }

    if (release?.id) {
      deliveryEvent = await this.repositories.deliveryEvents.insert({
        id: crypto.randomUUID(),
        release_token_id: release.id,
        device_id: reading.device_id,
        event_type: status === "weight_ok" ? "weight_confirmed" : "weight_divergence",
        expected_quantity: reading.expected_weight,
        delivered_quantity: reading.actual_weight || 0,
        unit: reading.unit,
        sensor_confirmed: status === "weight_ok",
        error_message: status === "weight_ok" ? "" : status
      });
      if (status !== "weight_ok") await this.repositories.releaseTokens.update(release.id, { status: status === "manual_review" ? "manual_review" : "delivery_failed" });
    }

    if (paymentId && status !== "weight_ok" && (input.payment_confirmed === true || release?.payment_id)) {
      await this.core.markPaymentManualReview(paymentId, "Divergencia de peso simulada");
    }

    if (input.commit_stock === true && status === "weight_ok" && reading.product_id) {
      stock = await this.device.commitStock(reading.device_id, reading.product_id, Number(input.stock_quantity ?? reading.actual_weight ?? reading.expected_weight));
    }

    await this.recordEvent("weight_validation_completed", { validation_id: validation.id, status, device_id: validation.device_id, zone_id: validation.zone_id });
    await this.audit.record({ type: "sambah_weight_validation_completed", status: status === "weight_ok" ? "success" : "warning", message: "Validacao de peso simulada concluida", context: { validation_id: validation.id, status, release_token_id: validation.release_token_id, module: "weight-control" } });
    return { ok: true, reading, validation, machine_alert: machineAlert, delivery_event: deliveryEvent, i9acao_event: i9acaoEvent, stock, locker };
  }

  async listReadings({ limit = 50 } = {}) {
    const items = await this.repositories.weightReadings.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 50) };
  }

  async listValidations({ limit = 50 } = {}) {
    const items = await this.repositories.weightValidations.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 50) };
  }

  async listEvents({ limit = 50 } = {}) {
    const items = await this.repositories.weightEvents.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 50) };
  }

  async listAlerts({ limit = 50 } = {}) {
    const alerts = await this.repositories.machineAlerts.all();
    const items = alerts.filter((item) => WEIGHT_STATUSES.includes(item.type) || String(item.type || "").startsWith("weight_")).slice(0, Number(limit) || 50);
    return { ok: true, total: items.length, items };
  }

  async calibrate(input = {}) {
    requireFields(input, ["device_id"]);
    const calibration = await this.repositories.weightCalibrations.insert({
      id: crypto.randomUUID(),
      device_id: input.device_id,
      zone_id: input.zone_id || null,
      source: input.source || "mock-scale-adapter",
      reference_weight: Number(input.reference_weight ?? 0),
      unit: input.unit || "g",
      offset: Number(input.offset ?? 0),
      status: "calibrated",
      simulated: true
    });
    await this.recordEvent("weight_calibration_completed", { calibration_id: calibration.id, device_id: calibration.device_id, zone_id: calibration.zone_id });
    await this.audit.record({ type: "sambah_weight_calibrated", status: "success", message: "Calibracao simulada registrada", context: { calibration_id: calibration.id, device_id: input.device_id } });
    return { ok: true, calibration };
  }

  async simulateLockerZone(input = {}) {
    const zones = await this.repositories.lockerZones.all();
    const zone = input.zone_id ? zones.find((item) => item.zone_id === input.zone_id || item.id === input.zone_id) : zones[0];
    const expected = Number(input.expected_weight ?? zone?.expected_unit_weight ?? 520);
    const previous = Number(input.previous_weight ?? zone?.current_weight ?? expected);
    const actual = Number(input.actual_weight ?? Math.max(0, previous - expected));
    return this.validate({
      ...input,
      use_case: "locker_zone_weight",
      device_id: input.device_id || zone?.device_id || "mock-locker-scale",
      zone_id: input.zone_id || zone?.zone_id || "Z01",
      product_id: input.product_id || zone?.product_id || "agua",
      expected_weight: expected,
      previous_weight: previous,
      actual_weight: actual,
      unit: input.unit || "g",
      tolerance_percent: input.tolerance_percent ?? 8
    });
  }

  async simulateSelfService(input = {}) {
    return this.simulate({ ...input, use_case: "self_service_by_weight", device_id: input.device_id || "mock-buffet-scale", product_id: input.product_id || "buffet-kg", expected_weight: input.expected_weight ?? 450, actual_weight: input.actual_weight ?? 450, unit: input.unit || "g", tolerance_percent: input.tolerance_percent ?? 3, commit_stock: input.commit_stock === true });
  }

  async simulateBeverage(input = {}) {
    return this.simulate({ ...input, use_case: "beverage_cup_weight", device_id: input.device_id || "mock-beverage-scale", product_id: input.product_id || "copo-bebida", expected_weight: input.expected_weight ?? 400, actual_weight: input.actual_weight ?? 400, unit: input.unit || "g", tolerance_percent: input.tolerance_percent ?? 5 });
  }

  async simulateSmartFridge(input = {}) {
    return this.simulate({ ...input, use_case: "smart_fridge_shelf_weight", device_id: input.device_id || "mock-smart-fridge", product_id: input.product_id || "agua-500", expected_weight: input.expected_weight ?? 520, actual_weight: input.actual_weight ?? 520, unit: input.unit || "g", tolerance_percent: input.tolerance_percent ?? 4 });
  }

  async simulatePickup(input = {}) {
    return this.simulate({ ...input, use_case: "pickup_weight_check", device_id: input.device_id || "mock-pickup-locker", product_id: input.product_id || "pedido-retirada", expected_weight: input.expected_weight ?? 800, actual_weight: input.actual_weight ?? 800, unit: input.unit || "g", tolerance_percent: input.tolerance_percent ?? 6 });
  }

  async simulate(input = {}) {
    const useCase = input.use_case || input.use_type || "generic_weight_check";
    assertOneOf(useCase, WEIGHT_USE_TYPES, "use_case");
    return this.validate({ ...input, use_case: useCase, use_type: useCase });
  }

  resolveStatus(input = {}) {
    if (input.force_status) return input.force_status;
    if (input.stable === false || input.unstable === true || Number(input.oscillation_percent || 0) > Number(input.tolerance_percent ?? 5)) return "weight_unstable";
    if (input.product_detected === false || input.actual_weight === null || input.actual_weight === undefined || input.actual_weight === "") return "weight_missing";
    const expected = Number(input.expected_weight || 0);
    const actual = Number(input.actual_weight || 0);
    if (actual <= 0 && expected > 0) return input.pickup_item_id || input.pickup_session_id ? "weight_missing" : "weight_missing";
    const tolerance = Math.abs(expected * (Number(input.tolerance_percent ?? 5) / 100));
    if (actual < expected - tolerance) return "weight_under";
    if (actual > expected + tolerance) return input.force_fraud === true ? "weight_fraud_suspected" : "weight_over";
    return "weight_ok";
  }

  isCriticalDifference(reading, input = {}) {
    if (input.force_fraud === true) return true;
    const status = this.resolveStatus({ ...input, ...reading });
    if (["weight_missing", "weight_unstable"].includes(status)) return true;
    if (status === "weight_over" && (input.pickup_session_id || reading.pickup_session_id || input.payment_confirmed === true)) return true;
    const percent = Math.abs(this.differencePercent(reading));
    const criticalPercent = Number(input.critical_percent ?? Math.max(Number(reading.tolerance_percent || 5) * 2, 20));
    return percent >= criticalPercent;
  }

  difference(reading) {
    return Math.round((Number(reading.actual_weight || 0) - Number(reading.expected_weight || 0)) * 1000) / 1000;
  }

  differencePercent(reading) {
    const expected = Number(reading.expected_weight || 0);
    if (!expected) return 0;
    return Math.round((this.difference(reading) / expected) * 10000) / 100;
  }

  severityFor(status) {
    if (status === "weight_ok") return "info";
    if (status === "weight_fraud_suspected" || status === "manual_review") return "high";
    if (status === "weight_over" || status === "weight_missing" || status === "weight_unstable") return "medium";
    return "low";
  }

  async findRelease(releaseTokenId) {
    if (!releaseTokenId) return null;
    const releases = await this.repositories.releaseTokens.all();
    return releases.find((item) => item.id === releaseTokenId || item.token === releaseTokenId) || null;
  }

  async applyLockerValidation(validation) {
    const item = await this.repositories.securePickupItems.findById(validation.pickup_item_id);
    if (!item) return { ok: false, error: "secure_pickup_item_not_found" };
    const nextStatus = validation.status === "weight_ok"
      ? "picked_up"
      : validation.status === "weight_missing"
        ? "not_picked_up"
        : validation.status === "weight_fraud_suspected" || validation.status === "weight_over"
          ? "extra_quantity_suspected"
          : "manual_review";
    const updatedItem = await this.repositories.securePickupItems.update(item.id, { status: nextStatus, actual_weight: validation.actual_weight, picked_at: nextStatus === "picked_up" ? this.now().toISOString() : item.picked_at || null });
    const items = (await this.repositories.securePickupItems.all()).filter((entry) => entry.pickup_session_id === item.pickup_session_id);
    let sessionStatus = "partial_pickup";
    if (items.some((entry) => entry.id === item.id ? nextStatus === "extra_quantity_suspected" : entry.status === "extra_quantity_suspected")) sessionStatus = "fraud_suspected";
    else if (items.every((entry) => entry.id === item.id ? nextStatus === "picked_up" : entry.status === "picked_up")) sessionStatus = "completed";
    const session = await this.repositories.securePickupSessions.update(item.pickup_session_id, { status: sessionStatus, completed_at: ["completed", "partial_pickup", "fraud_suspected"].includes(sessionStatus) ? this.now().toISOString() : null });
    const zone = await this.findLockerZone(validation.zone_id, validation.device_id);
    let updatedZone = null;
    if (zone) {
      const nextStock = nextStatus === "picked_up" ? Math.max(0, Number(zone.stock_quantity || 0) - Number(item.quantity || 1)) : Number(zone.stock_quantity || 0);
      const nextWeight = Math.max(0, Number(zone.current_weight || 0) - Number(validation.actual_weight || 0));
      updatedZone = await this.repositories.lockerZones.update(zone.id, { stock_quantity: nextStock, current_weight: nextWeight, status: nextStock > 0 ? zone.status : "empty" });
    }
    await this.recordEvent("weight_locker_item_applied", { validation_id: validation.id, pickup_session_id: item.pickup_session_id, pickup_item_id: item.id, status: nextStatus });
    return { ok: true, item: updatedItem, session, zone: updatedZone };
  }

  async applyInventoryValidation(validation, input = {}) {
    const zone = await this.findLockerZone(validation.zone_id, validation.device_id);
    const unitWeight = Number(input.unit_weight || zone?.expected_unit_weight || validation.expected_weight || 1);
    const physicalQuantity = unitWeight > 0 ? Math.round(Number(validation.actual_weight || 0) / unitWeight) : 0;
    const logicalQuantity = Number(input.logical_quantity ?? zone?.stock_quantity ?? 0);
    const mismatch = Math.abs(physicalQuantity - logicalQuantity) > Number(input.quantity_tolerance ?? 0);
    let updatedZone = null;
    if (zone) updatedZone = await this.repositories.lockerZones.update(zone.id, { stock_quantity: physicalQuantity, current_weight: validation.actual_weight, status: physicalQuantity > 0 ? "available" : "empty", product_availability: physicalQuantity > 0 ? "available" : "product_unavailable" });
    if (mismatch) {
      const alert = await this.device.createAlert({ device_id: validation.device_id, type: "weight_inventory_mismatch", severity: "warning", message: "Divergencia entre estoque logico e estoque por peso" });
      await this.audit.record({ type: "sambah_weight_inventory_mismatch", status: "warning", message: "Divergencia de estoque por peso", context: { validation_id: validation.id, alert_id: alert.id, zone_id: validation.zone_id, physicalQuantity, logicalQuantity } });
    }
    await this.recordEvent("weight_inventory_checked", { validation_id: validation.id, zone_id: validation.zone_id, physicalQuantity, logicalQuantity, mismatch });
    return { ok: true, mismatch, physical_quantity: physicalQuantity, logical_quantity: logicalQuantity, zone: updatedZone };
  }

  async findLockerZone(zoneId, deviceId) {
    if (!zoneId && !deviceId) return null;
    const zones = await this.repositories.lockerZones.all();
    if (zoneId) return zones.find((zone) => zone.zone_id === zoneId || zone.id === zoneId) || null;
    return zones.find((zone) => (!zoneId || zone.zone_id === zoneId || zone.id === zoneId) && (!deviceId || zone.device_id === deviceId)) || null;
  }

  async recordEvent(type, context = {}) {
    return this.repositories.weightEvents.insert({
      id: crypto.randomUUID(),
      type,
      source: "sambah-pay",
      module: "weight-control",
      context,
      simulated: true
    });
  }

  async prepareI9AcaoEvent(validation, eventType) {
    const event = {
      id: crypto.randomUUID(),
      source: "sambah-pay",
      module: "weight-control",
      eventType,
      severity: eventType === "weight_fraud_suspected" || eventType === "pickup_extra_quantity" ? "high" : "medium",
      deviceId: validation.device_id,
      zoneId: validation.zone_id || null,
      productId: validation.product_id || null,
      pickupSessionId: validation.pickup_session_id || null,
      pickupItemId: validation.pickup_item_id || null,
      releaseTokenId: validation.release_token_id || null,
      paymentId: validation.payment_id || null,
      expectedWeight: validation.expected_weight,
      actualWeight: validation.actual_weight,
      unit: validation.unit,
      timestamp: this.now().toISOString(),
      actionRequired: true,
      deliveryEvent: eventType === "delivery_failed" ? "delivery_failed" : null,
      simulated: true,
      sent: false
    };
    const saved = await this.repositories.i9acaoSecurityEvents.insert(event);
    await this.audit.record({ type: "sambah_weight_i9acao_event_prepared", status: "warning", message: "Evento futuro i9ACAO Security preparado em modo simulado", context: { event_id: saved.id, eventType, module: "weight-control" } });
    return saved;
  }
}
