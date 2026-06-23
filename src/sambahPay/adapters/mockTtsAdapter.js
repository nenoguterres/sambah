export class MockTtsAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "mock-tts";
  }

  async synthesize({ text, voice = "sambah" } = {}) {
    return {
      ok: true,
      provider: this.provider,
      audioUrl: `mock://tts/${encodeURIComponent(String(text || "resposta").slice(0, 40))}.ogg`,
      voice,
      synthesizedAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }
}
