export class SambahEventConsumerService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  consumers() { return this.eventBus.consumers(); }
  process(params) { return this.eventBus.process(params); }
}
