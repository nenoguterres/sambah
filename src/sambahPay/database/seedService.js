export class SeedService {
  constructor({ repositoryFactory, now = () => new Date() } = {}) {
    this.repositoryFactory = repositoryFactory;
    this.now = now;
  }

  async seedDemo() {
    return {
      ok: true,
      mode: this.repositoryFactory?.config?.mode || "json",
      simulated: true,
      executed: false,
      seededAt: this.now().toISOString(),
      message: "Seed demo preparado em modo simulado; nenhum dado real foi sobrescrito"
    };
  }
}
