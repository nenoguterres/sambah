const BROKERS = ["internal", "redis_streams", "rabbitmq", "kafka_future"];

export function getMessagingConfig(env = globalThis.process?.env || {}) {
  const broker = BROKERS.includes(env.MESSAGE_BROKER) ? env.MESSAGE_BROKER : "internal";
  const redisUrl = env.REDIS_URL || "";
  const rabbitmqUrl = env.RABBITMQ_URL || "";
  const kafkaBrokers = env.KAFKA_BROKERS || "";
  return {
    ok: true,
    broker,
    redisUrl,
    rabbitmqUrl,
    kafkaBrokers,
    redisConfigured: Boolean(redisUrl),
    rabbitmqConfigured: Boolean(rabbitmqUrl),
    kafkaConfigured: Boolean(kafkaBrokers),
    masked: {
      redisUrl: maskUrl(redisUrl),
      rabbitmqUrl: maskUrl(rabbitmqUrl),
      kafkaBrokers: maskBrokers(kafkaBrokers)
    }
  };
}

export function maskUrl(value = "") {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.password) url.password = "[masked]";
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:\s]+):([^@\s]+)@/, "://$1:[masked]@");
  }
}

function maskBrokers(value = "") {
  if (!value) return "";
  return value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => item.replace(/:\/\/([^:\s]+):([^@\s]+)@/, "://$1:[masked]@")).join(",");
}

export function plannedBrokers() {
  return [
    { key: "internal", label: "Internal Event Bus", status: "active_default", real_connection: false },
    { key: "redis_streams", label: "Redis Streams", status: "mock_ready", real_connection: false },
    { key: "rabbitmq", label: "RabbitMQ", status: "mock_ready", real_connection: false },
    { key: "kafka_future", label: "Kafka", status: "future_documented", real_connection: false }
  ];
}
