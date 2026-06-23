export class KafkaFutureAdapter {
  constructor({ kafkaBrokers = "" } = {}) {
    this.key = "kafka_future";
    this.kafkaBrokers = kafkaBrokers;
  }

  async health() {
    return {
      ok: true,
      key: this.key,
      status: "future_documented",
      real_connection: false,
      configured: Boolean(this.kafkaBrokers),
      message: "Kafka permanece apenas documentado para uma fase futura."
    };
  }

  async publish(message) {
    return { ok: false, broker: this.key, error: "kafka_future_not_implemented", simulated: true, message };
  }
}
