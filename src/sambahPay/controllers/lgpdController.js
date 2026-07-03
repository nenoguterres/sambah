export class SambahLgpdController {
  constructor({ lgpdService }) {
    this.lgpd = lgpdService;
  }

  dashboard() { return this.lgpd.dashboard(); }
  criticalLogs(params) { return this.lgpd.criticalLogs(params); }
  exportAudit(params) { return this.lgpd.exportAudit(params); }
  privacyRequests(params) { return this.lgpd.privacyRequests(params); }
  createPrivacyRequest(body) { return this.lgpd.createPrivacyRequest(body); }
  updatePrivacyRequest(id, body) { return this.lgpd.updatePrivacyRequest(id, body); }
  retentionPolicies() { return this.lgpd.retentionPolicies(); }
  createRetentionPolicy(body) { return this.lgpd.createRetentionPolicy(body); }
}
