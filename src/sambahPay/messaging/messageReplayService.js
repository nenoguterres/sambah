export class MessageReplayService {
  constructor({ eventBus, routingService, now = () => new Date() } = {}) {
    this.eventBus = eventBus;
    this.routing = routingService;
    this.now = now;
  }

  async replay(correlationId, input = {}) {
    if (!correlationId) return { ok: false, error: "correlation_required" };
    const correlation = await this.eventBus.correlation(correlationId);
    if (!correlation.events.length) {
      await this.eventBus.publish({
        type: "messaging.replay.failed",
        source: "sambah-messaging",
        correlationId,
        payload: { reason: "correlation_not_found" },
        metadata: { origin: "messaging_replay" }
      });
      return { ok: false, error: "correlation_not_found", correlationId, events: [], traces: correlation.traces };
    }
    const requested = await this.eventBus.publish({
      type: "messaging.replay.requested",
      source: "sambah-messaging",
      correlationId,
      causationId: correlation.events.at(-1)?.id || null,
      payload: { events: correlation.events.length, requested_by: input.actor || "admin" },
      metadata: { actor: input.actor || "admin", role: input.role || "ADMIN", origin: "messaging_replay" }
    });
    const completed = await this.eventBus.publish({
      type: "messaging.replay.completed",
      source: "sambah-messaging",
      correlationId,
      causationId: requested.event.id,
      payload: { replayed_events: correlation.events.length, simulated: true, completedAt: this.now().toISOString() },
      metadata: { actor: input.actor || "admin", role: input.role || "ADMIN", origin: "messaging_replay" }
    });
    return { ok: true, mode: "simulated", correlationId, replayed: correlation.events.length, requested: requested.event, completed: completed.event, routes: correlation.events.map((event) => this.routing.routeFor(event.type)) };
  }
}
