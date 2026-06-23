export class SambahPayBiService {
  constructor({ repositories, now = () => new Date() } = {}) {
    this.repositories = repositories;
    this.now = now;
  }

  async dashboard() {
    const [payments, releases, alerts, devices, sessions] = await Promise.all([
      this.repositories.payments.all(),
      this.repositories.releaseTokens.all(),
      this.repositories.machineAlerts.all(),
      this.repositories.devices.all(),
      this.repositories.autoserveSessions.all()
    ]);
    return {
      ok: true,
      generated_at: this.now().toISOString(),
      mode: "simulated",
      payments: { total: payments.length, paid: payments.filter((item) => item.status === "paid").length, manual_review: payments.filter((item) => item.status === "manual_review").length },
      releases: { total: releases.length, delivered: releases.filter((item) => item.status === "delivered").length, failed: releases.filter((item) => item.status === "delivery_failed").length },
      devices: { total: devices.length, online: devices.filter((item) => item.status === "online").length, offline: devices.filter((item) => item.status === "offline").length },
      autoserve_sessions: { total: sessions.length },
      machine_alerts: { total: alerts.length, open: alerts.filter((item) => item.status === "open").length }
    };
  }

  async daily() { return this.dashboard(); }
  async products() { return { ok: true, items: await this.repositories.deviceProducts.all() }; }
  async channels() { return { ok: true, items: [{ channel: "autoserve", mode: "simulated" }] }; }
  async operators() { return { ok: true, items: [] }; }
  async events() { return { ok: true, items: await this.repositories.eventAccounts.all() }; }
}
