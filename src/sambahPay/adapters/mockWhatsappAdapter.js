export class MockWhatsappAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "mock-whatsapp";
  }

  async receiveMedia(payload = {}) {
    return {
      ok: true,
      provider: this.provider,
      messageId: payload.message_id || payload.messageId || `mock-wa-${Date.now()}`,
      from: payload.from || payload.phone || "cliente-simulado",
      mediaUrl: payload.media_url || payload.audio_url || "mock://audio/whatsapp.ogg",
      receivedAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }

  async sendText({ to, text, sessionId } = {}) {
    return {
      ok: true,
      provider: this.provider,
      to,
      text,
      sessionId,
      sentAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }

  async sendAudio({ to, audioUrl, sessionId } = {}) {
    return {
      ok: true,
      provider: this.provider,
      to,
      audioUrl,
      sessionId,
      sentAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }
}
