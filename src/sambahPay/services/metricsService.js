export class SambahMetricsService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  metrics() { return this.eventBus.metrics(); }
}
