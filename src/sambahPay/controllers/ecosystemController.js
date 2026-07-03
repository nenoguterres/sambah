export class SambahEcosystemController {
  constructor({ ecosystemService }) {
    this.ecosystem = ecosystemService;
  }

  status() { return this.ecosystem.status(); }
  bootstrap() { return this.ecosystem.bootstrap(); }
  createDemoDevice(body) { return this.ecosystem.createDemoDevice(body); }
  securityEvents() { return this.ecosystem.securityEvents(); }
}
