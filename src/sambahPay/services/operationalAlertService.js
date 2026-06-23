export class SambahOperationalAlertService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  list(params) { return this.eventBus.alerts(params); }
  resolve(id, input) { return this.eventBus.resolveAlert(id, input); }
  simulate(input) { return this.eventBus.simulateCriticalAlert(input); }
}
