export class SambahDatabaseController {
  constructor({ databaseHealthService }) {
    this.database = databaseHealthService;
  }

  health() { return this.database.health(); }
  config() { return this.database.config(); }
  migrations() { return this.database.migrations(); }
  dryRunMigrations() { return this.database.dryRunMigrations(); }
  seedDemo() { return this.database.seedDemo(); }
  repositories() { return this.database.repositories(); }
}
