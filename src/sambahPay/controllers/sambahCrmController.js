export class SambahCrmController {
  constructor({ crmService }) {
    this.crm = crmService;
  }

  status() {
    return this.crm.status();
  }

  createLead(body) {
    return this.crm.createLead(body);
  }

  listLeads(query) {
    return this.crm.listLeads({
      stage: query.get("stage"),
      source: query.get("source"),
      phone: query.get("phone")
    });
  }

  updateStage(id, body) {
    return this.crm.updateStage(id, body);
  }

  updateNotes(id, body) {
    return this.crm.updateNotes(id, body);
  }
}
