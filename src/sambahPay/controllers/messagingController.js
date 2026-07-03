export class SambahMessagingController {
  constructor({ messagingService }) {
    this.messaging = messagingService;
  }

  config() { return this.messaging.configStatus(); }
  health() { return this.messaging.health(); }
  brokers() { return this.messaging.brokers(); }
  contracts() { return this.messaging.contracts(); }
  routes() { return this.messaging.routes(); }
  publishTest(body) { return this.messaging.publishTest(body); }
  replay(correlationId, body) { return this.messaging.replay(correlationId, body); }
  simulateRedis(body) { return this.messaging.simulateRedis(body); }
  simulateRabbitmq(body) { return this.messaging.simulateRabbitmq(body); }
  simulateBrokerFailure(body) { return this.messaging.simulateBrokerFailure(body); }
}
