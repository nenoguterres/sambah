export class SambahObservabilityService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  health() { return this.eventBus.health(); }
  metrics() { return this.eventBus.metrics(); }
  traces(params) { return this.eventBus.traces(params); }
  alerts(params) { return this.eventBus.alerts(params); }
  correlation(id) { return this.eventBus.correlation(id); }
  resolveAlert(id, input) { return this.eventBus.resolveAlert(id, input); }
  simulateCriticalAlert(input) { return this.eventBus.simulateCriticalAlert(input); }
}
