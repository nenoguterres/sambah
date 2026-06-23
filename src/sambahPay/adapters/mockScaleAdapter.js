export class MockScaleAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.provider = "mock-scale";
    this.now = now;
  }

  async read(input = {}) {
    const expected = Number(input.expected_weight ?? input.expectedWeight ?? 0);
    const actual = input.actual_weight ?? input.actualWeight;
    const drift = input.drift_percent === undefined ? 0 : Number(input.drift_percent);
    const calculated = actual === undefined || actual === null || actual === "" ? expected + (expected * drift) / 100 : Number(actual);
    return {
      expected_weight: expected,
      actual_weight: Number.isFinite(calculated) ? Math.round(calculated * 1000) / 1000 : null,
      unit: input.unit || "g",
      stable: input.stable !== false,
      raw: {
        provider: this.provider,
        simulated: true,
        measured_at: this.now().toISOString()
      }
    };
  }
}
