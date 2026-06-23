export class MockHumanHandoffAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "mock-human-handoff";
  }

  async createTicket(input = {}) {
    return {
      ok: true,
      provider: this.provider,
      ticketId: `mock-human-${Date.now()}`,
      status: "queued",
      reason: input.reason || "voice_handoff",
      createdAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }
}
