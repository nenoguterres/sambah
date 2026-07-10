export class FakeWhatsAppV2MetaSender {
  constructor({ failNext = false } = {}) {
    this.failNext = failNext;
    this.sent = [];
  }

  async send(message) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("FAKE_WHATSAPP_V2_SENDER_FAILURE");
    }
    this.sent.push(structuredClone(message));
    return { providerMessageId: `fake-wa-v2-${this.sent.length}` };
  }
}
