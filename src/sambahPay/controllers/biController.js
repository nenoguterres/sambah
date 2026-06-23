export class SambahPayBiController {
  constructor({ biService }) { this.bi = biService; }
  dashboard() { return this.bi.dashboard(); }
  daily() { return this.bi.daily(); }
  products() { return this.bi.products(); }
  channels() { return this.bi.channels(); }
  operators() { return this.bi.operators(); }
  events() { return this.bi.events(); }
}
