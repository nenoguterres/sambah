import crypto from "node:crypto";

const DEFAULT_CONSUMERS = ["audit", "erp", "bi", "security", "notification"];
const CRITICAL_EVENT_TYPES = new Set(["locker.pickup.fraud_suspected", "machine_alert.created", "erp.sync.failed", "device.offline", "security.event.prepared"]);

export class SambahEventBusService {
  constructor({ repositories, audit, now = () => new Date(), maxAttempts = 3 } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.now = now;
    this.maxAttempts = maxAttempts;
    this.erpFailureMode = false;
    this.securityBridge = null;
  }

  setSecurityBridge(securityBridge) {
    this.securityBridge = securityBridge;
  }

  async publish(input = {}) {
    const event = {
      id: input.id || "evt_" + crypto.randomUUID(),
      type: input.type || "audit.created",
      source: input.source || "sambah-pay",
      aggregateType: input.aggregateType || this.aggregateTypeFor(input.type),
      aggregateId: input.aggregateId || input.payload?.id || null,
      correlationId: input.correlationId || "corr_" + crypto.randomUUID(),
      causationId: input.causationId || null,
      payload: input.payload || {},
      metadata: {
        actor: input.metadata?.actor || "system",
        role: input.metadata?.role || "SYSTEM",
        origin: input.metadata?.origin || "simulated",
        timestamp: input.metadata?.timestamp || this.now().toISOString(),
        ...(input.metadata || {})
      },
      status: input.status || "pending",
      attempts: Number(input.attempts || 0),
      createdAt: input.createdAt || this.now().toISOString(),
      processedAt: null
    };
    const saved = await this.repositories.events.insert(event);
    await this.repositories.eventOutbox.insert({ ...saved, outbox_id: "out_" + crypto.randomUUID(), status: "pending" });
    await this.recordTrace(saved, "published");
    await this.bumpMetric("total_events", 1);
    if (CRITICAL_EVENT_TYPES.has(saved.type)) await this.createOperationalAlert({ type: saved.type, severity: saved.type === "locker.pickup.fraud_suspected" ? "high" : "warning", message: "Evento critico publicado", event_id: saved.id, correlationId: saved.correlationId });
    await this.securityBridge?.handleEvent?.(saved);
    await this.audit?.record?.({ type: "sambah_event_published", status: "info", message: "Evento SamBah publicado", context: { event_id: saved.id, event_type: saved.type, correlationId: saved.correlationId } });
    return { ok: true, event: saved };
  }

  async listEvents({ limit = 100 } = {}) {
    const items = await this.repositories.events.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async listOutbox({ limit = 100 } = {}) {
    const items = await this.repositories.eventOutbox.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async listDeadLetter({ limit = 100 } = {}) {
    const items = await this.repositories.eventDeadLetter.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async consumers() {
    const state = await this.repositories.eventConsumerState.all();
    return { ok: true, consumers: DEFAULT_CONSUMERS.map((name) => ({ name, status: "simulated", processed: state.filter((item) => item.consumer === name).length })), state };
  }

  async process({ limit = 50 } = {}) {
    const outbox = (await this.repositories.eventOutbox.all()).filter((item) => ["pending", "failed"].includes(item.status)).slice(0, Number(limit) || 50);
    const processed = [];
    const failed = [];
    for (const event of outbox) {
      const result = await this.processOne(event);
      if (result.ok) processed.push(result.event);
      else failed.push(result.event || event);
    }
    await this.bumpMetric("processed_events", processed.length);
    await this.bumpMetric("failed_events", failed.length);
    return { ok: true, processed: processed.length, failed: failed.length, items: { processed, failed } };
  }

  async processOne(event) {
    try {
      for (const consumer of this.consumersFor(event.type)) {
        await this.processConsumer(consumer, event);
      }
      const updated = await this.repositories.eventOutbox.update(event.id, { status: "processed", processedAt: this.now().toISOString() });
      await this.repositories.events.update(event.id, { status: "processed", processedAt: this.now().toISOString() });
      await this.recordTrace(event, "processed");
      return { ok: true, event: updated || event };
    } catch (error) {
      const attempts = Number(event.attempts || 0) + 1;
      const patch = { attempts, status: attempts >= this.maxAttempts ? "dead_letter" : "failed", last_error: error.message };
      const updated = await this.repositories.eventOutbox.update(event.id, patch);
      await this.repositories.events.update(event.id, patch);
      await this.recordTrace(event, "failed", { error: error.message, attempts });
      if (event.type.startsWith("erp.")) {
        await this.bumpMetric("erp_failures", 1);
        if (event.type === "erp.sync.requested") {
          await this.publish({
            type: "erp.sync.failed",
            aggregateType: "erp",
            aggregateId: event.aggregateId,
            payload: { payment_id: event.payload?.payment_id, failed_event_id: event.id, attempts, reason: error.message },
            correlationId: event.correlationId,
            causationId: event.id,
            metadata: { origin: "event_bus_simulated_failover" }
          });
        }
      }
      if (attempts >= this.maxAttempts) {
        if (event.type === "erp.sync.requested") {
          await this.createOperationalAlert({
            type: "erp.failure.threshold",
            severity: "high",
            message: "ERP simulado falhou 3 vezes consecutivas",
            event_id: event.id,
            correlationId: event.correlationId
          });
        }
        await this.toDeadLetter({ ...(updated || event), ...patch }, error.message);
      }
      return { ok: false, event: updated || event, error: error.message };
    }
  }

  async processConsumer(consumer, event) {
    const key = `${consumer}:${event.id}`;
    const existing = await this.repositories.eventConsumerState.findOne((item) => item.id === key);
    if (existing) return { ok: true, skipped: true };
    if (consumer === "erp" && event.type === "erp.sync.requested" && (this.erpFailureMode || event.payload?.force_fail)) {
      throw new Error("erp_sync_failed_simulated");
    }
    await this.repositories.eventConsumerState.insert({ id: key, consumer, event_id: event.id, event_type: event.type, status: "processed", processedAt: this.now().toISOString() });
    if (consumer === "erp" && event.type === "payment.confirmed") {
      await this.publish({ type: "erp.sync.requested", aggregateType: "payment", aggregateId: event.aggregateId, payload: { payment_id: event.aggregateId, force_fail: event.payload?.force_erp_fail || this.erpFailureMode }, correlationId: event.correlationId, causationId: event.id });
    }
    if (consumer === "erp" && event.type === "erp.sync.requested") {
      await this.publish({ type: "erp.sync.completed", aggregateType: "erp", aggregateId: event.aggregateId, payload: { payment_id: event.payload?.payment_id }, correlationId: event.correlationId, causationId: event.id });
    }
    return { ok: true };
  }

  async retry(eventId) {
    const event = await this.repositories.eventOutbox.findById(eventId);
    if (!event) return { ok: false, error: "event_not_found" };
    const updated = await this.repositories.eventOutbox.update(eventId, { status: "pending", attempts: 0, last_error: null });
    await this.repositories.events.update(eventId, { status: "pending", attempts: 0, last_error: null });
    await this.bumpMetric("erp_retries", event.type.startsWith("erp.") ? 1 : 0);
    return { ok: true, event: updated };
  }

  async retryAll() {
    const items = (await this.repositories.eventOutbox.all()).filter((item) => ["failed", "dead_letter"].includes(item.status));
    for (const item of items) await this.retry(item.id);
    return { ok: true, retried: items.length };
  }

  async correlation(correlationId) {
    const [events, traces] = await Promise.all([this.repositories.events.all(), this.repositories.traces.all()]);
    return { ok: true, correlationId, events: events.filter((item) => item.correlationId === correlationId), traces: traces.filter((item) => item.correlationId === correlationId) };
  }

  async simulatePaymentConfirmed(input = {}) {
    return this.publish({ type: "payment.confirmed", aggregateType: "payment", aggregateId: input.payment_id || "payment-simulated", payload: { amount: Number(input.amount || 10), force_erp_fail: input.force_erp_fail === true }, metadata: { actor: input.actor || "admin", role: input.role || "ADMIN", origin: "simulation" } });
  }

  async simulateErpFailure(input = {}) {
    this.erpFailureMode = input.enabled !== false;
    const event = await this.publish({ type: "payment.confirmed", aggregateType: "payment", aggregateId: input.payment_id || "payment-erp-fail", payload: { force_erp_fail: true }, metadata: { origin: "erp_failure_simulation" } });
    return { ok: true, failure_mode: this.erpFailureMode, event: event.event };
  }

  async toDeadLetter(event, reason) {
    const saved = await this.repositories.eventDeadLetter.insert({ ...event, dead_letter_id: "dlq_" + crypto.randomUUID(), reason, movedAt: this.now().toISOString() });
    await this.createOperationalAlert({ type: "dead_letter.created", severity: "high", message: "Evento enviado para Dead Letter", event_id: event.id, correlationId: event.correlationId });
    await this.bumpMetric("dead_letter_events", 1);
    return saved;
  }

  async metrics() {
    const [events, outbox, deadLetter, alerts, securityEvents, machineAlerts, securityIncidents, securityActions] = await Promise.all([
      this.repositories.events.all(),
      this.repositories.eventOutbox.all(),
      this.repositories.eventDeadLetter.all(),
      this.repositories.operationalAlerts.all(),
      this.repositories.i9acaoSecurityEvents.all(),
      this.repositories.machineAlerts.all(),
      this.repositories.securityIncidents.all(),
      this.repositories.securityActions.all()
    ]);
    const byType = countBy(events, "type");
    const byStatus = countBy(outbox, "status");
    const consumers = await this.consumers();
    return {
      ok: true,
      total_events: events.length,
      pending_events: outbox.filter((item) => item.status === "pending").length,
      processed_events: outbox.filter((item) => item.status === "processed").length,
      failed_events: outbox.filter((item) => item.status === "failed").length,
      dead_letter_events: deadLetter.length,
      erp_failures: events.filter((item) => item.type === "erp.sync.failed").length + outbox.filter((item) => item.last_error?.includes("erp")).length,
      erp_retries: outbox.reduce((sum, item) => sum + Number(item.attempts || 0), 0),
      avg_processing_time_ms: 0,
      locker_fraud_events: events.filter((item) => item.type === "locker.pickup.fraud_suspected").length,
      machine_alerts_open: machineAlerts.filter((item) => item.status !== "resolved").length,
      security_events_prepared: securityEvents.length,
      security_incidents_open: securityIncidents.filter((item) => item.status === "open").length,
      security_incidents_critical: securityIncidents.filter((item) => item.severity === "critical").length,
      security_incidents_by_module: countBy(securityIncidents, "module"),
      security_incidents_by_status: countBy(securityIncidents, "status"),
      security_actions_mocked: securityActions.length,
      messaging_broker_current: "internal",
      messaging_test_messages: events.filter((item) => item.type === "messaging.test.published").length,
      messaging_failures: events.filter((item) => item.type === "messaging.broker.failed").length,
      messaging_replays: events.filter((item) => item.type === "messaging.replay.completed").length,
      messaging_contracts_count: 10,
      messaging_topics_count: 11,
      events_by_type: byType,
      events_by_status: byStatus,
      consumers_status: consumers.consumers
    };
  }

  async health() {
    const metrics = await this.metrics();
    return { ok: true, mode: "simulated", status: metrics.dead_letter_events ? "attention" : "operational", metrics };
  }

  async traces({ limit = 100 } = {}) {
    const items = await this.repositories.traces.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async alerts({ includeResolved = true } = {}) {
    const items = await this.repositories.operationalAlerts.all();
    return { ok: true, total: items.length, items: includeResolved ? items : items.filter((item) => item.status !== "resolved") };
  }

  async resolveAlert(id, input = {}) {
    const alert = await this.repositories.operationalAlerts.update(id, { status: "resolved", resolved_by: input.resolved_by || "system", resolved_at: this.now().toISOString() });
    if (!alert) return { ok: false, error: "alert_not_found" };
    return { ok: true, alert };
  }

  async simulateCriticalAlert(input = {}) {
    const alert = await this.createOperationalAlert({ type: input.type || "simulated.critical", severity: input.severity || "high", message: input.message || "Alerta operacional simulado", correlationId: input.correlationId || "corr_" + crypto.randomUUID() });
    return { ok: true, alert };
  }

  async createOperationalAlert(input = {}) {
    const existing = await this.repositories.operationalAlerts.findOne((item) => item.status === "open" && item.type === input.type && item.event_id === input.event_id);
    if (existing) return existing;
    return this.repositories.operationalAlerts.insert({ id: "op_alert_" + crypto.randomUUID(), type: input.type || "operational_alert", severity: input.severity || "warning", message: input.message || "Alerta operacional", event_id: input.event_id || null, correlationId: input.correlationId || null, status: "open" });
  }

  async recordTrace(event, stage, context = {}) {
    return this.repositories.traces.insert({ id: "trace_" + crypto.randomUUID(), event_id: event.id, correlationId: event.correlationId, causationId: event.causationId || null, stage, context, timestamp: this.now().toISOString() });
  }

  async bumpMetric(key, amount = 1) {
    if (!amount) return null;
    const current = await this.repositories.metrics.findOne((item) => item.id === key);
    if (current) return this.repositories.metrics.update(key, { value: Number(current.value || 0) + Number(amount) });
    return this.repositories.metrics.insert({ id: key, key, value: Number(amount) });
  }

  consumersFor(type) {
    if (type === "payment.confirmed") return ["audit", "erp", "bi", "notification"];
    if (type.startsWith("erp.")) return ["erp", "audit"];
    if (type.startsWith("security.") || type.includes("fraud")) return ["security", "audit", "notification"];
    if (type.startsWith("audit.")) return ["audit"];
    return ["audit", "bi", "notification"];
  }

  aggregateTypeFor(type = "") {
    return type.split(".")[0] || "system";
  }
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}
