import crypto from "node:crypto";
import { RELEASE_STATUS, assertOneOf, normalizeMoney, requireFields } from "../models/schemas.js";

export class SambahPayAutoServeService {
  constructor({ repositories, audit, coreService, deviceService, erpAdapter, eventBus, now = () => new Date(), tokenTtlMs = 5 * 60 * 1000 } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.core = coreService;
    this.device = deviceService;
    this.erpAdapter = erpAdapter;
    this.eventBus = eventBus;
    this.now = now;
    this.tokenTtlMs = tokenTtlMs;
  }

  async createSession(input = {}) {
    const session = await this.repositories.autoserveSessions.insert({
      id: crypto.randomUUID(),
      customer_id: input.customer_id || input.customerId || null,
      channel: input.channel || "qr_code",
      status: "open",
      cart: [],
      payment_id: null,
      started_at: this.now().toISOString(),
      completed_at: null,
      canceled_at: null
    });
    await this.audit.record({ type: "sambah_pay_autoserve_session_created", status: "success", message: "Sessao AutoServe criada", context: { session_id: session.id } });
    return { ok: true, session };
  }

  async addToCart(input = {}) {
    requireFields(input, ["session_id", "product_id", "device_id"]);
    const session = await this.repositories.autoserveSessions.findById(input.session_id);
    if (!session) return { ok: false, error: "session_not_found" };
    const products = await this.device.listDeviceProducts(input.device_id);
    const product = products.items.find((item) => item.product_id === input.product_id);
    if (!product) return { ok: false, error: "device_product_not_found" };
    const quantity = Number(input.quantity || product.quantity_per_release || 1);
    const hasStock = await this.device.hasStock(input.device_id, input.product_id, quantity);
    if (!hasStock) return { ok: false, error: "stock_unavailable" };
    const item = {
      id: crypto.randomUUID(),
      product_id: input.product_id,
      device_id: input.device_id,
      name: product.name || input.product_id,
      quantity,
      unit: input.unit || product.unit,
      price: normalizeMoney(input.price ?? product.price)
    };
    const cart = [...(session.cart || []), item];
    const updated = await this.repositories.autoserveSessions.update(session.id, { cart });
    await this.audit.record({ type: "sambah_pay_autoserve_cart_updated", status: "success", message: "Carrinho AutoServe atualizado", context: { session_id: session.id, product_id: item.product_id } });
    return { ok: true, session: updated, item };
  }

  async checkout(input = {}) {
    requireFields(input, ["session_id"]);
    const session = await this.repositories.autoserveSessions.findById(input.session_id);
    if (!session) return { ok: false, error: "session_not_found" };
    if (!session.cart?.length) return { ok: false, error: "empty_cart" };
    const amount = normalizeMoney(session.cart.reduce((sum, item) => sum + Number(item.price || 0), 0));
    const paymentResult = await this.core.createPayment({ amount, method: input.method || "manual_simulated", status: input.payment_status || "paid", customer_id: session.customer_id, autoserve_session_id: session.id, channel: "autoserve", metadata: { simulated: true } });
    const updated = await this.repositories.autoserveSessions.update(session.id, { status: "paid", payment_id: paymentResult.payment.id });
    const releases = [];
    for (const item of updated.cart) {
      releases.push((await this.createReleaseToken({ payment_id: paymentResult.payment.id, product_id: item.product_id, device_id: item.device_id, session_id: session.id, quantity: item.quantity, unit: item.unit })).release_token);
    }
    await this.eventBus?.publish?.({
      type: "autoserve.checkout.completed",
      aggregateType: "autoserve_session",
      aggregateId: session.id,
      payload: { session: updated, payment: paymentResult.payment, release_tokens: releases },
      correlationId: paymentResult.payment.metadata?.correlationId || input.correlationId
    });
    return { ok: true, session: updated, payment: paymentResult.payment, release_tokens: releases };
  }

  async getStatus(sessionId) {
    const session = await this.repositories.autoserveSessions.findById(sessionId);
    if (!session) return { ok: false, error: "session_not_found" };
    const releases = (await this.repositories.releaseTokens.all()).filter((item) => item.session_id === sessionId);
    return { ok: true, session, release_tokens: releases };
  }

  async createReleaseToken(input = {}) {
    requireFields(input, ["payment_id", "product_id", "device_id", "session_id", "quantity", "unit"]);
    const payment = await this.core.getPayment(input.payment_id);
    if (!payment) return { ok: false, error: "payment_not_found" };
    if (payment.status !== "paid") return { ok: false, error: "payment_not_confirmed" };
    const hasStock = await this.device.hasStock(input.device_id, input.product_id, input.quantity);
    if (!hasStock) return { ok: false, error: "stock_unavailable" };
    const release = await this.repositories.releaseTokens.insert({
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      payment_id: input.payment_id,
      product_id: input.product_id,
      device_id: input.device_id,
      session_id: input.session_id,
      quantity: Number(input.quantity),
      unit: input.unit,
      expires_at: new Date(this.now().getTime() + this.tokenTtlMs).toISOString(),
      used_at: null,
      status: "release_authorized"
    });
    await this.audit.record({ type: "sambah_pay_release_token_created", status: "success", message: "Token de liberacao criado", context: { release_token_id: release.id, payment_id: release.payment_id, device_id: release.device_id } });
    return { ok: true, release_token: release };
  }

  async findReleaseByToken(token) {
    return this.repositories.releaseTokens.findOne((item) => item.token === token || item.id === token);
  }

  async recordAttempt(release, action, result, errorMessage = "") {
    return this.repositories.releaseAttempts.insert({ id: crypto.randomUUID(), release_token_id: release?.id || null, token: release?.token || null, device_id: release?.device_id || null, action, result, error_message: errorMessage });
  }

  async validateReleaseToken(token, action = "validate") {
    const release = await this.findReleaseByToken(token);
    if (!release) return { ok: false, error: "release_token_not_found" };
    if (release.used_at || ["delivered", "partial_delivery", "delivery_failed", "refunded"].includes(release.status)) {
      await this.recordAttempt(release, action, "denied", "release_token_already_used");
      return { ok: false, error: "release_token_already_used", release_token: release };
    }
    if (Date.parse(release.expires_at) <= this.now().getTime()) {
      await this.repositories.releaseTokens.update(release.id, { status: "blocked" });
      await this.recordAttempt(release, action, "denied", "release_token_expired");
      return { ok: false, error: "release_token_expired", release_token: release };
    }
    await this.recordAttempt(release, action, "accepted");
    return { ok: true, release_token: release };
  }

  async startRelease(token, input = {}) {
    const validation = await this.validateReleaseToken(token, "start");
    if (!validation.ok) return validation;
    const release = await this.repositories.releaseTokens.update(validation.release_token.id, { status: "releasing" });
    const commandResult = await this.device.sendCommand(release.device_id, { release_token_id: release.id, command_type: "release", payload: { release_token: release.token, quantity: release.quantity, unit: release.unit, simulateFailure: input.simulateFailure === true } });
    if (!commandResult.ok) return this.failRelease(token, { error_message: commandResult.response?.response || "device_command_failed" });
    await this.audit.record({ type: "sambah_pay_release_started", status: "success", message: "Liberacao simulada iniciada", context: { release_token_id: release.id, command_id: commandResult.command.id } });
    return { ok: true, release_token: release, command: commandResult.command };
  }

  async completeRelease(token, input = {}) {
    const validation = await this.validateReleaseToken(token, "complete");
    if (!validation.ok) return validation;
    const release = validation.release_token;
    const deliveredQuantity = Number(input.delivered_quantity ?? release.quantity);
    const status = deliveredQuantity >= Number(release.quantity) ? "delivered" : "partial_delivery";
    assertOneOf(status, RELEASE_STATUS, "status");
    const delivery = await this.repositories.deliveryEvents.insert({ id: crypto.randomUUID(), release_token_id: release.id, device_id: release.device_id, event_type: status, expected_quantity: release.quantity, delivered_quantity: deliveredQuantity, unit: release.unit, sensor_confirmed: input.sensor_confirmed !== false, error_message: "" });
    await this.repositories.releaseTokens.update(release.id, { status, used_at: this.now().toISOString() });
    await this.device.commitStock(release.device_id, release.product_id, deliveredQuantity);
    await this.erpAdapter.syncSale({ id: release.id, type: "autoserve_delivery", release, delivery });
    await this.audit.record({ type: "sambah_pay_delivery_event", status: "success", message: "Entrega simulada registrada", context: { release_token_id: release.id, event_type: status, delivered_quantity: deliveredQuantity } });
    return { ok: true, status, delivery_event: delivery };
  }

  async failRelease(token, input = {}) {
    const release = await this.findReleaseByToken(token);
    if (!release) return { ok: false, error: "release_token_not_found" };
    await this.recordAttempt(release, "fail", "failed", input.error_message || "delivery_failed");
    const delivery = await this.repositories.deliveryEvents.insert({ id: crypto.randomUUID(), release_token_id: release.id, device_id: release.device_id, event_type: "delivery_failed", expected_quantity: release.quantity, delivered_quantity: Number(input.delivered_quantity || 0), unit: release.unit, sensor_confirmed: false, error_message: input.error_message || "Falha simulada" });
    const updated = await this.repositories.releaseTokens.update(release.id, { status: "delivery_failed" });
    const alert = await this.device.createAlert({ device_id: release.device_id, release_token_id: release.id, severity: "error", type: "delivery_failed", message: input.error_message || "Falha simulada de entrega" });
    await this.core.markPaymentManualReview(release.payment_id, "Pagamento confirmado sem entrega completa");
    await this.audit.record({ type: "sambah_pay_delivery_failed", status: "error", message: "Falha simulada de liberacao", context: { release_token_id: release.id, alert_id: alert.id } });
    return { ok: true, release_token: updated, delivery_event: delivery, machine_alert: alert };
  }
}
