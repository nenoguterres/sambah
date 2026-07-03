export class SambahTraceService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  traces(params) { return this.eventBus.traces(params); }
  correlation(id) { return this.eventBus.correlation(id); }
}
