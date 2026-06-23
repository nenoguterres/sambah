export class SambahMemoryController {
  constructor({ memoryService }) {
    this.memory = memoryService;
  }

  upsertContact(body) {
    return this.memory.upsertContact(body);
  }

  getContact(phone) {
    return this.memory.getContact(phone);
  }
}
