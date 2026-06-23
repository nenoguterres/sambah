export class MockSttAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "mock-stt";
  }

  async transcribe(input = {}) {
    const text = input.transcript || input.text || input.mock_text || inferTranscript(input.media_url || input.audio_url || "");
    return {
      ok: true,
      provider: this.provider,
      text,
      confidence: Number(input.confidence ?? 0.92),
      language: input.language || "pt-BR",
      transcribedAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }
}

function inferTranscript(value = "") {
  const normalized = String(value).toLowerCase();
  if (normalized.includes("wallet")) return "quero comprar credito na wallet";
  if (normalized.includes("maquina")) return "a maquina nao liberou meu produto";
  if (normalized.includes("autoserve")) return "quero comprar uma agua na geladeira autoserve";
  if (normalized.includes("humano")) return "quero falar com um humano";
  return "quero fazer um pedido e pagar pelo SamBah Pay";
}
