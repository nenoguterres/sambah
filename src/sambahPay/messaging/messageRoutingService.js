export class MessageRoutingService {
  constructor({ contractService }) {
    this.contracts = contractService;
  }

  routes() {
    return this.contracts.contracts().map((contract) => ({
      type: contract.type,
      topic: contract.topic,
      routingKey: contract.routingKey,
      source: contract.source,
      broker: "internal",
      futureBrokers: ["redis_streams", "rabbitmq"],
      kafka: "future_documented"
    }));
  }

  routeFor(type) {
    const contract = this.contracts.find(type);
    return {
      type: contract.type,
      topic: contract.topic,
      routingKey: contract.routingKey,
      source: contract.source
    };
  }
}
