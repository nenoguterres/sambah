import crypto from "node:crypto";
import { normalizeMoney, PAYMENT_STATUS, assertOneOf } from "../models/schemas.js";

export class SambahPayCoreService {
  constructor({ paymentsRepository, paymentMethodsRepository, audit, paymentAdapter, erpAdapter, eventBus, now = () => new Date() } = {}) {
    this.payments = paymentsRepository;
    this.paymentMethods = paymentMethodsRepository;
    this.audit = audit;
    this.paymentAdapter = paymentAdapter;
    this.erpAdapter = erpAdapter;
    this.eventBus = eventBus;
    this.now = now;
  }

  async status() {
    const payments = await this.payments.all();
    return {
      ok: true,
      module: "sambah-pay-core",
      mode: "simulated",
      payments: payments.length,
      adapters: { payment: this.paymentAdapter?.provider || "none", erp: this.erpAdapter?.provider || "none" }
    };
  }

  async listPayments({ limit = 50 } = {}) {
    const items = await this.payments.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 50) };
  }

  async createPayment(input = {}) {
    const id = input.id || crypto.randomUUID();
    const status = input.status || (input.confirmed === false ? "pending" : "paid");
    assertOneOf(status, PAYMENT_STATUS, "status");
    const payment = {
      id,
      amount: normalizeMoney(input.amount),
      currency: input.currency || "BRL",
      status,
      methods: Array.isArray(input.methods) && input.methods.length ? input.methods : [{ method: input.method || "manual", amount: normalizeMoney(input.amount) }],
      channel: input.channel || "sambah_pay",
      source: input.source || "simulated",
      customer_id: input.customer_id || null,
      table_account_id: input.table_account_id || null,
      event_account_id: input.event_account_id || null,
      autoserve_session_id: input.autoserve_session_id || null,
      operator_id: input.operator_id || null,
      metadata: input.metadata || {}
    };
    const authorization = await this.paymentAdapter.authorize(payment);
    payment.status = input.status || authorization.status;
    payment.provider = authorization.provider;
    payment.provider_reference = authorization.externalId;
    payment.authorized_at = authorization.authorizedAt;
    const saved = await this.payments.insert(payment);
    await this.audit.record({ type: "sambah_pay_payment_created", status: saved.status === "paid" ? "success" : "info", message: "Pagamento SamBah Pay registrado", context: { payment_id: saved.id, amount: saved.amount, status: saved.status } });
    await this.eventBus?.publish?.({ type: "payment.created", aggregateType: "payment", aggregateId: saved.id, payload: saved });
    if (saved.status === "paid") await this.eventBus?.publish?.({ type: "payment.confirmed", aggregateType: "payment", aggregateId: saved.id, payload: saved });
    if (saved.status === "failed") await this.eventBus?.publish?.({ type: "payment.failed", aggregateType: "payment", aggregateId: saved.id, payload: saved });
    if (saved.status === "paid") await this.erpAdapter.syncPayment(saved);
    return { ok: true, payment: saved };
  }

  async getPayment(id) {
    return this.payments.findById(id);
  }

  async markPaymentManualReview(id, reason) {
    const payment = await this.payments.update(id, { status: "manual_review", manual_review_reason: reason });
    if (payment) {
      await this.audit.record({ type: "sambah_pay_payment_manual_review", status: "warning", message: "Pagamento enviado para revisao manual", context: { payment_id: id, reason } });
    }
    return payment;
  }

  async refundPayment(id, { amount, reason } = {}) {
    const payment = await this.getPayment(id);
    if (!payment) return { ok: false, error: "payment_not_found" };
    const refund = await this.paymentAdapter.refund(payment, { amount, reason });
    const updated = await this.payments.update(id, { status: "refunded", refund });
    await this.audit.record({ type: "sambah_pay_payment_refunded", status: "success", message: "Estorno simulado registrado", context: { payment_id: id, amount, reason } });
    return { ok: true, payment: updated };
  }
}
