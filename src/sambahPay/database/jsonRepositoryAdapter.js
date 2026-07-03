import { join } from "node:path";
import { JsonRepository } from "../storage/jsonRepository.js";

export class JsonRepositoryAdapter {
  constructor({ dataDir = "data", fileNames = {}, now = () => new Date() } = {}) {
    this.mode = "json";
    this.dataDir = dataDir;
    this.fileNames = fileNames;
    this.now = now;
  }

  repository(name) {
    return new JsonRepository({ filePath: join(this.dataDir, this.fileNames[name] || `sambah-pay-${name}.json`), now: this.now });
  }

  async health() {
    return { ok: true, mode: "json", status: "operational", dataDir: this.dataDir, message: "Persistencia JSON/local ativa" };
  }

  repositories() {
    return { ok: true, mode: "json", fileNames: this.fileNames };
  }
}
