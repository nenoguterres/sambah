export class SambahSecurityController {
  constructor({ securityBridgeService }) {
    this.security = securityBridgeService;
  }

  incidents(params) { return this.security.listIncidents(params); }
  incident(id) { return this.security.getIncident(id); }
  acknowledge(id, body) { return this.security.action(id, "acknowledge", body); }
  resolve(id, body) { return this.security.action(id, "resolve", body); }
  dismiss(id, body) { return this.security.action(id, "dismiss", body); }
  escalate(id, body) { return this.security.action(id, "escalate", body); }
  mockAction(id, action, body) { return this.security.action(id, action, body); }
  simulate(type, body) { return this.security.simulate(type, body); }
  rules() { return this.security.rules(); }
  createRule(body) { return this.security.createRule(body); }
  deviceMap() { return this.security.deviceMap(); }
  mapDevice(body) { return this.security.mapDevice(body); }
  dashboard() { return this.security.dashboard(); }
}
