export class SambahWeightControlController {
  constructor({ weightService }) { this.weight = weightService; }
  reading(body) { return this.weight.recordReading(body); }
  validate(body) { return this.weight.validate(body); }
  readings(searchParams) { return this.weight.listReadings({ limit: searchParams.get("limit") }); }
  validations(searchParams) { return this.weight.listValidations({ limit: searchParams.get("limit") }); }
  events(searchParams) { return this.weight.listEvents({ limit: searchParams.get("limit") }); }
  alerts(searchParams) { return this.weight.listAlerts({ limit: searchParams.get("limit") }); }
  calibrate(body) { return this.weight.calibrate(body); }
  simulateLockerZone(body) { return this.weight.simulateLockerZone(body); }
  simulateSelfService(body) { return this.weight.simulateSelfService(body); }
  simulateBeverage(body) { return this.weight.simulateBeverage(body); }
  simulateSmartFridge(body) { return this.weight.simulateSmartFridge(body); }
  simulatePickup(body) { return this.weight.simulatePickup(body); }
}
