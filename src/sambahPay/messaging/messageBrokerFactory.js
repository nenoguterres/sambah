import { getMessagingConfig } from "./messagingConfig.js";
import { InternalBrokerAdapter } from "./internalBrokerAdapter.js";
import { RedisStreamsAdapter } from "./redisStreamsAdapter.js";
import { RabbitMqAdapter } from "./rabbitMqAdapter.js";
import { KafkaFutureAdapter } from "./kafkaFutureAdapter.js";

export class MessageBrokerFactory {
  constructor({ eventBus, env = globalThis.process?.env || {} } = {}) {
    this.eventBus = eventBus;
    this.config = getMessagingConfig(env);
  }

  create(key = this.config.broker) {
    if (key === "redis_streams") return new RedisStreamsAdapter({ redisUrl: this.config.redisUrl });
    if (key === "rabbitmq") return new RabbitMqAdapter({ rabbitmqUrl: this.config.rabbitmqUrl });
    if (key === "kafka_future") return new KafkaFutureAdapter({ kafkaBrokers: this.config.kafkaBrokers });
    return new InternalBrokerAdapter({ eventBus: this.eventBus });
  }

  current() {
    return this.create(this.config.broker);
  }

  all() {
    return {
      internal: this.create("internal"),
      redis_streams: this.create("redis_streams"),
      rabbitmq: this.create("rabbitmq"),
      kafka_future: this.create("kafka_future")
    };
  }
}
