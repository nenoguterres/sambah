const CHANNELS = ["whatsapp", "site", "instagram", "facebook", "api"];

export class SambahChannelService {
  constructor({ whatsappMockService } = {}) {
    this.whatsappMock = whatsappMockService;
  }

  async receiveMessage(input = {}) {
    if (!CHANNELS.includes(input.channel)) return { ok: false, statusCode: 400, error: "invalid_channel" };
    return this.whatsappMock.receiveMessage({
      phone: input.phone,
      name: input.name,
      message: input.message,
      channel: input.channel
    });
  }
}
