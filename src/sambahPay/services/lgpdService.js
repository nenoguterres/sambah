import crypto from "node:crypto";
import { maskSensitive } from "../../auditService.js";

const DEFAULT_RETENTION_POLICIES = [
  { key: "audit_logs", label: "Auditoria", retention_days: 365, classification: "critical" },
  { key: "financial_logs", label: "Eventos financeiros", retention_days: 365, classification: "critical" },
  { key: "security_incidents", label: "Incidentes de seguranca", retention_days: 730, classification: "critical" },
  { key: "voice_transcriptions", label: "Transcricoes de voz", retention_days: 90, classification: "personal_data" },
  { key: "operational_metrics", label: "Metricas operacionais", retention_days: 180, classification: "operational" }
];

const PRIVACY_REQUEST_TYPES = new Set(["access", "export", "rectification", "delete", "restrict_processing"]);
const PRIVACY_REQUEST_STATUS = new Set(["open", "in_review", "fulfilled", "dismissed"]);

export class SambahLgpdService {
  constructor({ repositories, audit, now = () => new Date() } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.now = now;
  }

  async dashboard() {
    const [criticalLogs, requests, policies] = await Promise.all([
      this.criticalLogs({ limit: 200 }),
      this.privacyRequests(),
      this.retentionPolicies()
    ]);
    return {
      ok: true,
      mode: "simulated",
      generated_at: this.now().toISOString(),
      totals: {
        critical_logs: criticalLogs.total,
        open_privacy_requests: requests.items.filter((item) => item.status === "open").length,
        policies: policies.items.length,
        financial_logs: criticalLogs.items.filter((item) => item.domain === "financial").length,
        security_logs: criticalLogs.items.filter((item) => item.domain === "security").length,
        privacy_logs: criticalLogs.items.filter((item) => item.domain === "privacy").length
      },
      by_domain: countBy(criticalLogs.items, "domain"),
      by_severity: countBy(criticalLogs.items, "severity"),
      recent_critical_logs: criticalLogs.items.slice(0, 20),
      privacy_requests: requests.items.slice(0, 20),
      retention_policies: policies.items
    };
  }

  async criticalLogs({ limit = 100 } = {}) {
    const [auditLogs, events, securityIncidents, operationalAlerts] = await Promise.all([
      this.repositories.auditLogs.all(),
      this.repositories.events.all(),
      this.repositories.securityIncidents.all(),
      this.repositories.operationalAlerts.all()
    ]);
    const logs = [
      ...auditLogs.map((item) => this.fromAudit(item)),
      ...events.filter(isCriticalEvent).map((item) => this.fromEvent(item)),
      ...securityIncidents.map((item) => this.fromIncident(item)),
      ...operationalAlerts.map((item) => this.fromAlert(item))
    ].sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));
    return { ok: true, total: logs.length, items: logs.slice(0, Number(limit) || 100) };
  }

  async exportAudit({ limit = 500, domain } = {}) {
    const logs = await this.criticalLogs({ limit });
    const items = domain ? logs.items.filter((item) => item.domain === domain) : logs.items;
    await this.audit.record({ type: "sambah_lgpd_audit_exported", status: "warning", message: "Exportacao simulada de auditoria LGPD", context: { total: items.length, domain: domain || "all" } });
    return {
      ok: true,
      exported_at: this.now().toISOString(),
      mode: "simulated_masked_export",
      total: items.length,
      items: maskSensitive(items)
    };
  }

  async createPrivacyRequest(input = {}) {
    const requestType = input.request_type || input.type || "access";
    if (!PRIVACY_REQUEST_TYPES.has(requestType)) return { ok: false, error: "privacy_request_type_not_supported" };
    const request = await this.repositories.lgpdPrivacyRequests.insert({
      id: "lgpd_req_" + crypto.randomUUID(),
      request_type: requestType,
      status: "open",
      requester: maskSensitive(input.requester || input.customer_id || input.customerId || "cliente"),
      customer_id: maskSensitive(input.customer_id || input.customerId || null),
      reason: maskSensitive(input.reason || ""),
      channel: input.channel || "internal_panel",
      createdAt: this.now().toISOString(),
      resolvedAt: null,
      resolvedBy: null
    });
    await this.audit.record({ type: "sambah_lgpd_privacy_request_created", status: "warning", message: "Solicitacao LGPD simulada criada", context: { request_id: request.id, request_type: request.request_type, requester: request.requester } });
    return { ok: true, request };
  }

  async privacyRequests({ status } = {}) {
    let items = await this.repositories.lgpdPrivacyRequests.all();
    if (status) items = items.filter((item) => item.status === status);
    return { ok: true, total: items.length, items: maskSensitive(items) };
  }

  async updatePrivacyRequest(id, input = {}) {
    const status = input.status || "fulfilled";
    if (!PRIVACY_REQUEST_STATUS.has(status)) return { ok: false, error: "privacy_request_status_not_supported" };
    const request = await this.repositories.lgpdPrivacyRequests.update(id, {
      status,
      resolvedAt: ["fulfilled", "dismissed"].includes(status) ? this.now().toISOString() : null,
      resolvedBy: input.resolved_by || input.actor || "lgpd-operator"
    });
    if (!request) return { ok: false, error: "privacy_request_not_found" };
    await this.audit.record({ type: "sambah_lgpd_privacy_request_updated", status: "success", message: "Solicitacao LGPD simulada atualizada", context: { request_id: id, status } });
    return { ok: true, request: maskSensitive(request) };
  }

  async retentionPolicies() {
    const custom = await this.repositories.lgpdRetentionPolicies.all();
    const merged = [...DEFAULT_RETENTION_POLICIES, ...custom];
    return { ok: true, total: merged.length, items: merged };
  }

  async createRetentionPolicy(input = {}) {
    const policy = await this.repositories.lgpdRetentionPolicies.insert({
      id: "lgpd_policy_" + crypto.randomUUID(),
      key: input.key || "custom_policy",
      label: input.label || "Politica customizada",
      retention_days: Number(input.retention_days || 180),
      classification: input.classification || "operational",
      simulated: true
    });
    await this.audit.record({ type: "sambah_lgpd_retention_policy_created", status: "info", message: "Politica LGPD simulada criada", context: { policy_id: policy.id, key: policy.key } });
    return { ok: true, policy };
  }

  fromAudit(item = {}) {
    return {
      id: item.id,
      source: "audit",
      domain: domainFor(item.type),
      severity: severityFor(item.status, item.type),
      type: item.type,
      status: item.status,
      message: item.message,
      context: maskSensitive(item.context || {}),
      createdAt: item.created_at || item.createdAt
    };
  }

  fromEvent(item = {}) {
    return {
      id: item.id,
      source: "event_bus",
      domain: domainFor(item.type),
      severity: severityFor(item.status, item.type),
      type: item.type,
      status: item.status,
      correlationId: item.correlationId,
      causationId: item.causationId,
      context: maskSensitive(item.payload || {}),
      createdAt: item.createdAt || item.created_at
    };
  }

  fromIncident(item = {}) {
    return {
      id: item.id,
      source: "security",
      domain: "security",
      severity: item.severity || "high",
      type: item.eventType,
      status: item.status,
      correlationId: item.correlationId,
      causationId: item.causationId,
      context: maskSensitive({ deviceId: item.deviceId, zoneId: item.zoneId, customerId: item.customerId, message: item.message }),
      createdAt: item.createdAt || item.created_at
    };
  }

  fromAlert(item = {}) {
    return {
      id: item.id,
      source: "operational_alert",
      domain: domainFor(item.type),
      severity: item.severity || "warning",
      type: item.type,
      status: item.status,
      correlationId: item.correlationId,
      context: maskSensitive({ message: item.message, event_id: item.event_id }),
      createdAt: item.created_at || item.createdAt
    };
  }
}

function isCriticalEvent(item = {}) {
  return /failed|fraud|security|machine_alert|dead_letter|offline|denied|blocked|payment|wallet|lgpd|privacy/i.test(`${item.type} ${item.status}`);
}

function domainFor(type = "") {
  if (/lgpd|privacy|audit_export/i.test(type)) return "privacy";
  if (/security|fraud|machine_alert|offline|blocked|denied|locker|weight/i.test(type)) return "security";
  if (/payment|wallet|checkout|pix|tef|refund/i.test(type)) return "financial";
  return "operational";
}

function severityFor(status = "", type = "") {
  if (/critical|fraud|security|dead_letter|denied|blocked/i.test(`${status} ${type}`)) return "critical";
  if (/error|failed|warning|offline/i.test(`${status} ${type}`)) return "high";
  return "medium";
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}
