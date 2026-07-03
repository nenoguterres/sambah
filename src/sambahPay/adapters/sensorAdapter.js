export class SimulatedSensorAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "simulated_sensor";
  }

  async readScale(input = {}) {
    return {
      ok: true,
      provider: this.provider,
      stable: input.stable !== false,
      weight: Number(input.weight || 0),
      unit: input.unit || "kg",
      readAt: this.now().toISOString(),
      raw: { simulated: true, ...input }
    };
  }

  async readFlow(input = {}) {
    return {
      ok: true,
      provider: this.provider,
      volume: Number(input.volume || 0),
      unit: input.unit || "ml",
      readAt: this.now().toISOString(),
      raw: { simulated: true, ...input }
    };
  }
}
