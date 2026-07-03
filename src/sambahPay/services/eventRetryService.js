export class SambahEventRetryService {
  constructor({ eventBus }) { this.eventBus = eventBus; }
  retry(eventId) { return this.eventBus.retry(eventId); }
  retryAll() { return this.eventBus.retryAll(); }
}
