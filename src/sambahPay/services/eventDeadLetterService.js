export class SambahEventDeadLetterService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  list(params) { return this.eventBus.listDeadLetter(params); }
}
