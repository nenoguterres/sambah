export class SambahSecurePickupLockerController {
  constructor({ lockerService }) {
    this.locker = lockerService;
  }
  bootstrap() { return this.locker.bootstrap(); }
  create(body) { return this.locker.createSession(body); }
  validatePin(body) { return this.locker.validatePin(body); }
  start(body) { return this.locker.start(body); }
  openAuthorizedZones(body) { return this.locker.openAuthorizedZones(body); }
  confirmItem(body) { return this.locker.confirmItem(body); }
  complete(body) { return this.locker.complete(body); }
  block(body) { return this.locker.block(body); }
  createPendingSession(body) { return this.locker.createPendingSession(body); }
  get(id) { return this.locker.get(id); }
  items(sessionId) { return this.locker.items(sessionId); }
  attempts() { return this.locker.attempts(); }
  events() { return this.locker.events(); }
  zones() { return this.locker.listZones(); }
  openZone(zoneId, body) { return this.locker.openZone(zoneId, body); }
  closeZone(zoneId, body) { return this.locker.closeZone(zoneId, body); }
  weightCheck(zoneId, body) { return this.locker.weightCheck(zoneId, body); }
}
