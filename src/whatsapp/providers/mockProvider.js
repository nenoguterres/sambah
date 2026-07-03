export class MockWhatsAppProvider {
  constructor({ logger = console } = {}) {
    this.name = "mock";
    this.logger = logger;
  }

  status() {
    return {
      provider: this.name,
      configured: true,
      phoneNumberIdConfigured: false,
      accessTokenConfigured: false,
      verifyTokenConfigured: false
    };
  }

  async sendText({ to, text, metadata = {} } = {}) {
    const safeTo = maskPhone(to);
    this.logger.info?.("[whatsapp:mock] mensagem registrada", {
      to: safeTo,
      messageId: metadata.messageId,
      intent: metadata.intent
    });
    return {
      ok: true,
      provider: this.name,
      sent: false,
      status: "mock_logged",
      to: safeTo
    };
  }
}

function maskPhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : "";
}
