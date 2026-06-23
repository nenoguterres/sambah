export class SambahPayDeviceController {
  constructor({ deviceService }) { this.device = deviceService; }
  create(body) { return this.device.createDevice(body); }
  list() { return this.device.listDevices(); }
  get(deviceId) { return this.device.getStatus(deviceId); }
  update(deviceId, body) { return this.device.updateDevice(deviceId, body); }
  heartbeat(deviceId, body) { return this.device.heartbeat(deviceId, body); }
  command(deviceId, body) { return this.device.sendCommand(deviceId, body); }
  status(deviceId) { return this.device.getStatus(deviceId); }
  addProduct(deviceId, body) { return this.device.addDeviceProduct(deviceId, body); }
  listProducts(deviceId) { return this.device.listDeviceProducts(deviceId); }
  scaleReading(body) { return this.device.recordScaleReading(body); }
  flowReading(body) { return this.device.recordFlowReading(body); }
  alerts() { return this.device.listAlerts(); }
  resolveAlert(id, body) { return this.device.resolveAlert(id, body); }
}
