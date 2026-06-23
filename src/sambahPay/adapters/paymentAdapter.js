export class SimulatedPaymentAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "simulated_payment";
  }

  async authorize(payment) {
    const status = payment.forceFailure ? "failed" : payment.status || "paid";
    return {
      ok: status === "paid" || status === "partial",
      provider: this.provider,
      status,
      externalId: `sim-pay-${payment.id}`,
      authorizedAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }

  async refund(payment, { amount, reason } = {}) {
    return {
      ok: true,
      provider: this.provider,
      status: "refunded",
      externalId: `sim-refund-${payment.id}`,
      amount,
      reason,
      refundedAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }
}
