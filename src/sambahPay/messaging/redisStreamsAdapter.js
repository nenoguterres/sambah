export class RedisStreamsAdapter {
  constructor({ redisUrl = "" } = {}) {
    this.key = "redis_streams";
    this.redisUrl = redisUrl;
  }

  async health() {
    return {
      ok: true,
      key: this.key,
      status: this.redisUrl ? "mock_ready" : "not_configured",
      real_connection: false,
      message: "Redis Streams preparado como contrato futuro; sem conexao real nesta fase."
    };
  }

  async publish(message) {
    return { ok: true, broker: this.key, simulated: true, real_connection: false, message };
  }
}
