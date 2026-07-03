export class InternalBrokerAdapter {
  constructor({ eventBus }) {
    this.eventBus = eventBus;
    this.key = "internal";
  }

  async health() {
    const health = await this.eventBus.health();
    return { ok: true, key: this.key, status: "active", mode: "event_bus_simulated", eventBusStatus: health.status };
  }

  async publish(message) {
    const result = await this.eventBus.publish({
      id: message.eventId,
      type: message.type,
      source: message.source,
      aggregateType: message.type.split(".")[0],
      aggregateId: message.payload?.id || message.payload?.payment_id || message.payload?.device_id || message.id,
      payload: { ...message.payload, message_id: message.id, topic: message.topic, routingKey: message.routingKey },
      correlationId: message.correlationId,
      causationId: message.causationId,
      metadata: { ...message.headers, origin: message.headers?.origin || "messaging_internal_adapter" }
    });
    return { ok: true, broker: this.key, message, event: result.event };
  }
}
