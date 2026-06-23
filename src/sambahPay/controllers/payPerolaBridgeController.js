export class PayPerolaBridgeController {
  constructor({ payPerolaBridgeService }) {
    if (!payPerolaBridgeService) throw new TypeError("payPerolaBridgeService is required");
    this.service = payPerolaBridgeService;
  }

  async registrarSinal(body) {
    const signal = await this.service.registrarSinalPay(body);
    return { ok: true, signal };
  }

  async listarSinais() {
    const items = await this.service.listarSinais();
    return { ok: true, total: items.length, items };
  }

  async registrarSugestao(body) {
    const suggestion = await this.service.registrarSugestaoPerola(body);
    return { ok: true, suggestion };
  }

  async listarSugestoes() {
    const items = await this.service.listarSugestoes();
    return { ok: true, total: items.length, items };
  }
}

