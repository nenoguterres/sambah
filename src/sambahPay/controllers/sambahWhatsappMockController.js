export class SambahWhatsappMockController {
  constructor({ whatsappMockService }) {
    this.whatsappMock = whatsappMockService;
  }

  receiveMessage(body) {
    return this.whatsappMock.receiveMessage(body);
  }
}
