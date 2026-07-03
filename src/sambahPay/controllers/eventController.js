export class SambahPayEventController {
  constructor({ eventService }) { this.event = eventService; }
  create(body) { return this.event.createEvent(body); }
  addParticipant(eventId, body) { return this.event.addParticipant(eventId, body); }
  consume(eventId, body) { return this.event.consume(eventId, body); }
  report(eventId) { return this.event.report(eventId); }
  close(eventId) { return this.event.close(eventId); }
}
