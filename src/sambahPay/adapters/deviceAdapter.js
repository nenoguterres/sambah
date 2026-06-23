export class SimulatedDeviceAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "simulated_device";
  }

  async getStatus(device) {
    return {
      ok: true,
      provider: this.provider,
      deviceId: device.id,
      status: device.status || "online",
      checkedAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }

  async sendCommand(device, command) {
    const shouldFail = command?.payload?.simulateFailure === true || device?.status === "error";
    return {
      ok: !shouldFail,
      provider: this.provider,
      deviceId: device.id,
      commandType: command.command_type || command.commandType || "release",
      status: shouldFail ? "failed" : "executed",
      executedAt: this.now().toISOString(),
      response: shouldFail ? "simulated_device_failure" : "simulated_delivery_started",
      raw: { simulated: true }
    };
  }

  async validateHeartbeat(device) {
    return {
      ok: true,
      provider: this.provider,
      deviceId: device.id,
      status: device.status || "online",
      heartbeatAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }
}
