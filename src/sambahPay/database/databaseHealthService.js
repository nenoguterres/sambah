export class DatabaseHealthService {
  constructor({ repositoryFactory, migrationService, seedService } = {}) {
    this.repositoryFactory = repositoryFactory;
    this.migrationService = migrationService;
    this.seedService = seedService;
  }

  async health() {
    const adapterHealth = await this.repositoryFactory.health();
    return {
      ok: this.repositoryFactory.config.mode === "json" ? true : adapterHealth.ok,
      mode: this.repositoryFactory.config.mode,
      adapter: this.repositoryFactory.adapter.constructor.name,
      json: { ok: true, status: this.repositoryFactory.config.mode === "json" ? "active" : "available_fallback" },
      postgres: this.repositoryFactory.config.mode === "postgres" ? adapterHealth : { ok: false, status: "not_selected", message: "DATABASE_MODE=json" }
    };
  }

  config() {
    return this.repositoryFactory.info();
  }

  migrations() {
    return this.migrationService.list();
  }

  dryRunMigrations() {
    return this.migrationService.dryRun();
  }

  seedDemo() {
    return this.seedService.seedDemo();
  }

  repositories() {
    return {
      ok: true,
      mode: this.repositoryFactory.config.mode,
      adapter: this.repositoryFactory.adapter.constructor.name,
      plannedTables: [
        "audit_logs", "events", "event_outbox", "event_dead_letter", "payments", "wallets", "devices",
        "locker_zones", "secure_pickup_sessions", "secure_pickup_items", "machine_alerts",
        "security_incidents", "lgpd_requests", "critical_logs", "operational_alerts", "traces", "metrics_snapshots"
      ]
    };
  }
}
