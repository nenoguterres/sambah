import { getDatabaseConfig } from "./databaseConfig.js";
import { JsonRepositoryAdapter } from "./jsonRepositoryAdapter.js";
import { PostgresRepositoryAdapter } from "./postgresRepositoryAdapter.js";

export class RepositoryFactory {
  constructor({ dataDir = "data", fileNames = {}, now = () => new Date(), env = globalThis.process?.env || {} } = {}) {
    this.config = getDatabaseConfig(env);
    this.dataDir = dataDir;
    this.fileNames = fileNames;
    this.now = now;
    this.adapter = this.createAdapter();
  }

  createAdapter() {
    if (this.config.mode === "postgres") {
      return new PostgresRepositoryAdapter({ databaseUrl: this.config.databaseUrl, now: this.now });
    }
    return new JsonRepositoryAdapter({ dataDir: this.dataDir, fileNames: this.fileNames, now: this.now });
  }

  repository(name) {
    return this.adapter.repository(name);
  }

  async health() {
    return this.adapter.health();
  }

  info() {
    return {
      ok: true,
      mode: this.config.mode,
      databaseUrl: this.config.maskedDatabaseUrl,
      postgresConfigured: this.config.postgresConfigured,
      adapter: this.adapter.constructor.name
    };
  }
}

export function createRepositoryFactory(options = {}) {
  return new RepositoryFactory(options);
}
