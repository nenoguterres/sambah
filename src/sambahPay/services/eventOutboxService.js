export class SambahEventOutboxService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  list(params) { return this.eventBus.listOutbox(params); }
  process(params) { return this.eventBus.process(params); }
}
