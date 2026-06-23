export class SambahHandoffController {
  constructor({ handoffService }) {
    this.handoff = handoffService;
  }

  pending() {
    return this.handoff.pending();
  }

  list(query) {
    return this.handoff.list({
      status: query.get("status"),
      phone: query.get("phone")
    });
  }

  updateStatus(id, body) {
    return this.handoff.updateStatus(id, body.status);
  }
}
