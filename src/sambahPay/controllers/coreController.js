export class SambahPayCoreController {
  constructor({ coreService }) { this.core = coreService; }
  status() { return this.core.status(); }
  listPayments(query) { return this.core.listPayments({ limit: query.get("limit") }); }
  createPayment(body) { return this.core.createPayment(body); }
}
