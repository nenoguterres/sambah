import crypto from "node:crypto";

export class SambahPayAuditService {
  constructor({ repository, auditService, now = () => new Date() } = {}) {
    this.repository = repository;
    this.auditService = auditService;
    this.now = now;
  }

  async record({ type = "sambah_pay_event", status = "info", message = "", source = "sambah-pay", context = {} } = {}) {
    const event = {
      id: crypto.randomUUID(),
      type,
      status,
      source,
      message,
      context,
      created_at: this.now().toISOString()
    };
    if (this.repository) await this.repository.insert(event);
    if (this.auditService?.record) {
      await this.auditService.record({ type, status, source, message, context });
    }
    return event;
  }

  async list({ limit = 100 } = {}) {
    const items = this.repository ? await this.repository.all() : [];
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }
}
