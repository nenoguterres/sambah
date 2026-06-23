export class SimulatedErpAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "simulated_erp";
  }

  async syncSale(payload) {
    return this.response("sale_synced", payload);
  }

  async syncPayment(payload) {
    return this.response("payment_synced", payload);
  }

  async syncCashier(payload) {
    return this.response("cashier_synced", payload);
  }

  async response(type, payload) {
    return {
      ok: true,
      provider: this.provider,
      type,
      syncedAt: this.now().toISOString(),
      referenceId: payload?.id || payload?.payment_id || null,
      raw: { simulated: true }
    };
  }
}
