export class RabbitMqAdapter {
  constructor({ rabbitmqUrl = "" } = {}) {
    this.key = "rabbitmq";
    this.rabbitmqUrl = rabbitmqUrl;
  }

  async health() {
    return {
      ok: true,
      key: this.key,
      status: this.rabbitmqUrl ? "mock_ready" : "not_configured",
      real_connection: false,
      message: "RabbitMQ preparado como contrato futuro; sem conexao real nesta fase."
    };
  }

  async publish(message) {
    return { ok: true, broker: this.key, simulated: true, real_connection: false, message };
  }
}
