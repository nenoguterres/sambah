export class SambahErpFailoverService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  simulateFailure(input) { return this.eventBus.simulateErpFailure(input); }
}
