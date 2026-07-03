import crypto from "node:crypto";
import { CONTROL_MODES, DEVICE_TYPES, STOCK_UNITS, assertOneOf, normalizeMoney, requireFields } from "../models/schemas.js";

export class SambahDeviceControllerService {
  constructor({ repositories, audit, deviceAdapter, sensorAdapter, eventBus, now = () => new Date() } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.deviceAdapter = deviceAdapter;
    this.sensorAdapter = sensorAdapter;
    this.eventBus = eventBus;
    this.now = now;
  }

  async createDevice(input = {}) {
    requireFields(input, ["name", "type", "location", "control_mode"]);
    assertOneOf(input.type, DEVICE_TYPES, "type");
    assertOneOf(input.control_mode, CONTROL_MODES, "control_mode");
    const device = await this.repositories.devices.insert({
      id: crypto.randomUUID(),
      name: input.name,
      type: input.type,
      location: input.location,
      status: input.status || "online",
      control_mode: input.control_mode,
      ip_address: input.ip_address || null,
      mqtt_topic: input.mqtt_topic || null,
      api_endpoint: input.api_endpoint || null,
      relay_channel: input.relay_channel || null,
      last_heartbeat_at: null
    });
    await this.audit.record({ type: "sambah_pay_device_created", status: "success", message: "Dispositivo cadastrado", context: { device_id: device.id, type: device.type } });
    return { ok: true, device };
  }

  async listDevices() {
    const items = await this.repositories.devices.all();
    return { ok: true, total: items.length, items };
  }

  async getDevice(deviceId) {
    return this.repositories.devices.findById(deviceId);
  }

  async updateDevice(deviceId, patch = {}) {
    if (patch.type) assertOneOf(patch.type, DEVICE_TYPES, "type");
    if (patch.control_mode) assertOneOf(patch.control_mode, CONTROL_MODES, "control_mode");
    const device = await this.repositories.devices.update(deviceId, patch);
    if (!device) return { ok: false, error: "device_not_found" };
    await this.audit.record({ type: "sambah_pay_device_updated", status: "success", message: "Dispositivo atualizado", context: { device_id: deviceId } });
    return { ok: true, device };
  }

  async heartbeat(deviceId, payload = {}) {
    const device = await this.getDevice(deviceId);
    if (!device) return { ok: false, error: "device_not_found" };
    const result = await this.deviceAdapter.validateHeartbeat(device);
    const heartbeatAt = this.now().toISOString();
    const updated = await this.repositories.devices.update(deviceId, { status: payload.status || result.status || "online", last_heartbeat_at: heartbeatAt });
    const log = await this.repositories.deviceStatusLogs.insert({ id: crypto.randomUUID(), device_id: deviceId, status: updated.status, heartbeat_at: heartbeatAt, payload });
    await this.audit.record({ type: "sambah_pay_device_heartbeat", status: "info", message: "Heartbeat simulado recebido", context: { device_id: deviceId, status: updated.status } });
    await this.eventBus?.publish?.({ type: "device.heartbeat.received", aggregateType: "device", aggregateId: deviceId, payload: { status: updated.status, device_id: deviceId } });
    if (updated.status === "offline") await this.eventBus?.publish?.({ type: "device.offline", aggregateType: "device", aggregateId: deviceId, payload: { device_id: deviceId, device_type: updated.type, status: updated.status } });
    return { ok: true, device: updated, status_log: log };
  }

  async getStatus(deviceId) {
    const device = await this.getDevice(deviceId);
    if (!device) return { ok: false, error: "device_not_found" };
    const stale = !device.last_heartbeat_at || Date.now() - Date.parse(device.last_heartbeat_at) > 120000;
    const status = stale ? "offline" : device.status;
    if (stale && device.status !== "offline") await this.repositories.devices.update(deviceId, { status });
    const adapterStatus = await this.deviceAdapter.getStatus({ ...device, status });
    return { ok: true, device: { ...device, status }, adapterStatus };
  }

  async addDeviceProduct(deviceId, input = {}) {
    const device = await this.getDevice(deviceId);
    if (!device) return { ok: false, error: "device_not_found" };
    requireFields(input, ["product_id", "price", "quantity_per_release", "unit"]);
    assertOneOf(input.unit, STOCK_UNITS, "unit");
    const product = await this.repositories.deviceProducts.insert({
      id: crypto.randomUUID(),
      device_id: deviceId,
      product_id: input.product_id,
      name: input.name || input.product_name || input.product_id,
      price: normalizeMoney(input.price),
      quantity_per_release: Number(input.quantity_per_release),
      unit: input.unit,
      status: input.status || "active"
    });
    const stock = await this.repositories.stockVolumes.insert({
      id: crypto.randomUUID(),
      product_id: input.product_id,
      device_id: deviceId,
      initial_quantity: Number(input.initial_quantity ?? input.current_quantity ?? 0),
      current_quantity: Number(input.current_quantity ?? input.initial_quantity ?? 0),
      unit: input.unit,
      min_quantity: Number(input.min_quantity ?? 0)
    });
    await this.audit.record({ type: "sambah_pay_device_product_created", status: "success", message: "Produto vinculado ao dispositivo", context: { device_id: deviceId, product_id: input.product_id } });
    return { ok: true, product, stock };
  }

  async listDeviceProducts(deviceId) {
    const products = await this.repositories.deviceProducts.all();
    const stock = await this.repositories.stockVolumes.all();
    const items = products.filter((item) => item.device_id === deviceId).map((item) => ({ ...item, stock: stock.find((entry) => entry.device_id === deviceId && entry.product_id === item.product_id) || null }));
    return { ok: true, total: items.length, items };
  }

  async sendCommand(deviceId, input = {}) {
    const device = await this.getDevice(deviceId);
    if (!device) return { ok: false, error: "device_not_found" };
    const command = await this.repositories.deviceCommands.insert({
      id: crypto.randomUUID(),
      device_id: deviceId,
      release_token_id: input.release_token_id || null,
      command_type: input.command_type || "release",
      payload: input.payload || {},
      status: "pending",
      response: null,
      executed_at: null
    });
    const response = await this.deviceAdapter.sendCommand(device, command);
    const updated = await this.repositories.deviceCommands.update(command.id, { status: response.status, response, executed_at: response.executedAt });
    await this.audit.record({ type: "sambah_pay_device_command", status: response.ok ? "success" : "error", message: "Comando simulado enviado ao dispositivo", context: { device_id: deviceId, command_id: command.id, ok: response.ok } });
    return { ok: response.ok, command: updated, response };
  }

  async recordScaleReading(input = {}) {
    const reading = await this.sensorAdapter.readScale(input);
    const saved = await this.repositories.scaleReadings.insert({ id: crypto.randomUUID(), device_id: input.device_id || null, session_id: input.session_id || null, product_id: input.product_id || null, weight: reading.weight, unit: reading.unit, stable: reading.stable, raw_payload: reading.raw });
    await this.audit.record({ type: "sambah_pay_scale_reading", status: "info", message: "Leitura de balanca simulada registrada", context: { reading_id: saved.id } });
    return { ok: true, reading: saved };
  }

  async recordFlowReading(input = {}) {
    const reading = await this.sensorAdapter.readFlow(input);
    const saved = await this.repositories.flowMeterReadings.insert({ id: crypto.randomUUID(), device_id: input.device_id || null, product_id: input.product_id || null, release_token_id: input.release_token_id || null, volume: reading.volume, unit: reading.unit, raw_payload: reading.raw });
    await this.audit.record({ type: "sambah_pay_flow_reading", status: "info", message: "Leitura de fluxo simulada registrada", context: { reading_id: saved.id } });
    return { ok: true, reading: saved };
  }

  async createAlert(input = {}) {
    const alert = await this.repositories.machineAlerts.insert({ id: crypto.randomUUID(), device_id: input.device_id || null, release_token_id: input.release_token_id || null, severity: input.severity || "warning", type: input.type || "simulated_failure", message: input.message || "Falha simulada", status: "open", resolved_by: null, resolved_at: null });
    await this.audit.record({ type: "sambah_pay_machine_alert", status: "error", message: "Alerta de maquina registrado", context: { alert_id: alert.id, device_id: alert.device_id } });
    await this.eventBus?.publish?.({ type: "machine_alert.created", aggregateType: "machine_alert", aggregateId: alert.id, payload: alert });
    return alert;
  }

  async listAlerts() {
    const items = await this.repositories.machineAlerts.all();
    return { ok: true, total: items.length, items };
  }

  async resolveAlert(id, input = {}) {
    const alert = await this.repositories.machineAlerts.update(id, { status: "resolved", resolved_by: input.operator_id || input.resolved_by || "system", resolved_at: this.now().toISOString() });
    if (!alert) return { ok: false, error: "alert_not_found" };
    await this.audit.record({ type: "sambah_pay_machine_alert_resolved", status: "success", message: "Alerta de maquina resolvido", context: { alert_id: id } });
    return { ok: true, alert };
  }

  async commitStock(deviceId, productId, quantity) {
    const stocks = await this.repositories.stockVolumes.all();
    const stock = stocks.find((item) => item.device_id === deviceId && item.product_id === productId);
    if (!stock) return { ok: false, error: "stock_not_found" };
    const current = Number(stock.current_quantity || 0);
    const next = current - Number(quantity || 0);
    if (next < 0) return { ok: false, error: "stock_unavailable" };
    const updated = await this.repositories.stockVolumes.update(stock.id, { current_quantity: next });
    if (next <= Number(stock.min_quantity || 0)) {
      await this.createAlert({ device_id: deviceId, type: "low_stock", severity: "warning", message: "Estoque minimo atingido" });
    }
    return { ok: true, stock: updated };
  }

  async hasStock(deviceId, productId, quantity) {
    const stocks = await this.repositories.stockVolumes.all();
    const stock = stocks.find((item) => item.device_id === deviceId && item.product_id === productId);
    return Boolean(stock && Number(stock.current_quantity || 0) >= Number(quantity || 0));
  }
}
