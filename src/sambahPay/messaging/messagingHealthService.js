import crypto from "node:crypto";
import { getMessagingConfig, plannedBrokers } from "./messagingConfig.js";
import { MessageBrokerFactory } from "./messageBrokerFactory.js";
import { MessageContractService } from "./messageContractService.js";
import { MessageRoutingService } from "./messageRoutingService.js";
import { MessageReplayService } from "./messageReplayService.js";

export class MessagingHealthService {
  constructor({ eventBus, audit, now = () => new Date(), env = globalThis.process?.env || {} } = {}) {
    this.eventBus = eventBus;
    this.audit = audit;
    this.now = now;
    this.config = getMessagingConfig(env);
    this.contractService = new MessageContractService();
    this.routingService = new MessageRoutingService({ contractService: this.contractService });
    this.factory = new MessageBrokerFactory({ eventBus, env });
    this.replayService = new MessageReplayService({ eventBus, routingService: this.routingService, now });
  }

  configStatus() {
    return {
      ok: true,
      broker: this.config.broker,
      messageBroker: this.config.broker,
      redisUrl: this.config.masked.redisUrl,
      rabbitmqUrl: this.config.masked.rabbitmqUrl,
      kafkaBrokers: this.config.masked.kafkaBrokers,
      redisConfigured: this.config.redisConfigured,
      rabbitmqConfigured: this.config.rabbitmqConfigured,
      kafkaConfigured: this.config.kafkaConfigured
    };
  }

  async health() {
    const adapters = this.factory.all();
    const brokerHealth = {};
    for (const [key, adapter] of Object.entries(adapters)) brokerHealth[key] = await adapter.health();
    await this.eventBus.publish({
      type: "messaging.broker.health_checked",
      source: "sambah-messaging",
      payload: { broker: this.config.broker, statuses: Object.fromEntries(Object.entries(brokerHealth).map(([key, value]) => [key, value.status])) },
      metadata: { origin: "messaging_health" }
    });
    return { ok: true, broker: this.config.broker, current: brokerHealth[this.config.broker], brokers: brokerHealth };
  }

  async brokers() {
    const health = await this.health();
    return { ok: true, current: this.config.broker, brokers: plannedBrokers().map((broker) => ({ ...broker, health: health.brokers[broker.key] })) };
  }

  contracts() {
    return { ok: true, total: this.contractService.contracts().length, topics: this.contractService.topics(), items: this.contractService.contracts() };
  }

  routes() {
    return { ok: true, total: this.routingService.routes().length, topics: this.contractService.topics(), items: this.routingService.routes() };
  }

  async publishTest(input = {}) {
    const type = input.type || "messaging.test.published";
    const route = this.routingService.routeFor(type);
    const correlationId = input.correlationId || "corr_" + crypto.randomUUID();
    const message = {
      id: input.id || "msg_" + crypto.randomUUID(),
      eventId: input.eventId || "evt_" + crypto.randomUUID(),
      type,
      topic: input.topic || route.topic,
      routingKey: input.routingKey || route.routingKey,
      source: input.source || route.source || "sambah-messaging",
      correlationId,
      causationId: input.causationId || null,
      payload: input.payload || { simulated: true, amount: 10 },
      headers: {
        schemaVersion: "1.0",
        actor: input.actor || "admin",
        role: input.role || "ADMIN",
        origin: input.origin || "api"
      },
      createdAt: this.now().toISOString()
    };
    const validation = this.contractService.validate(message);
    await this.eventBus.publish({ type: "messaging.contract.validated", source: "sambah-messaging", correlationId, causationId: message.causationId, payload: { message_id: message.id, validation }, metadata: message.headers });
    const result = await this.factory.current().publish(message);
    await this.eventBus.bumpMetric?.("messaging_test_messages", 1);
    return { ok: true, broker: this.config.broker, validation, message, event: result.event || null };
  }

  replay(correlationId, input) {
    return this.replayService.replay(correlationId, input);
  }

  async simulateRedis(input = {}) {
    const adapter = this.factory.create("redis_streams");
    const health = await adapter.health();
    return { ok: true, broker: "redis_streams", simulated: true, health, message: "Redis Streams mockado preparado; nenhuma conexao real foi aberta.", input };
  }

  async simulateRabbitmq(input = {}) {
    const adapter = this.factory.create("rabbitmq");
    const health = await adapter.health();
    return { ok: true, broker: "rabbitmq", simulated: true, health, message: "RabbitMQ mockado preparado; nenhuma conexao real foi aberta.", input };
  }

  async simulateBrokerFailure(input = {}) {
    const correlationId = input.correlationId || "corr_" + crypto.randomUUID();
    const failure = await this.eventBus.publish({
      type: "messaging.broker.failed",
      source: "sambah-messaging",
      aggregateType: "messaging",
      aggregateId: input.broker || this.config.broker,
      correlationId,
      payload: { broker: input.broker || this.config.broker, reason: input.reason || "broker_failure_simulated", simulated: true },
      metadata: { actor: input.actor || "admin", role: input.role || "ADMIN", origin: "messaging_failure_simulation" }
    });
    const alert = await this.eventBus.createOperationalAlert({
      type: "messaging.broker.failed",
      severity: input.severity || "high",
      message: "Falha simulada de broker de mensageria",
      event_id: failure.event.id,
      correlationId
    });
    await this.eventBus.bumpMetric?.("messaging_failures", 1);
    await this.audit?.record?.({ type: "messaging_broker_failed", status: "warning", message: "Falha simulada de broker registrada", context: { broker: input.broker || this.config.broker, correlationId, event_id: failure.event.id } });
    return { ok: true, simulated: true, failure: failure.event, alert };
  }

  async metrics() {
    const events = await this.eventBus.listEvents({ limit: 10000 });
    return {
      messaging_broker_current: this.config.broker,
      messaging_test_messages: events.items.filter((item) => item.type === "messaging.test.published").length,
      messaging_failures: events.items.filter((item) => item.type === "messaging.broker.failed").length,
      messaging_replays: events.items.filter((item) => item.type === "messaging.replay.completed").length,
      messaging_contracts_count: this.contractService.contracts().length,
      messaging_topics_count: this.contractService.topics().length
    };
  }
}
