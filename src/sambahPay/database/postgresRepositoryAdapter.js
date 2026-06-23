export class PostgresRepositoryAdapter {
  constructor({ databaseUrl = "", now = () => new Date() } = {}) {
    this.mode = "postgres";
    this.databaseUrl = databaseUrl;
    this.now = now;
  }

  repository(name) {
    return new PostgresJsonShapeRepository({ name, adapter: this });
  }

  async health() {
    if (!this.databaseUrl) {
      return { ok: false, mode: "postgres", status: "not_configured", error: "DATABASE_URL ausente", message: "PostgreSQL opcional nao configurado" };
    }
    try {
      const pg = await import("pg");
      const client = new pg.Client({ connectionString: this.databaseUrl });
      await client.connect();
      const result = await client.query("select 1 as ok");
      await client.end();
      return { ok: true, mode: "postgres", status: "operational", result: result.rows?.[0] || null };
    } catch (error) {
      return { ok: false, mode: "postgres", status: "unavailable", error: error.code || "postgres_unavailable", message: error.message };
    }
  }
}

class PostgresJsonShapeRepository {
  constructor({ name, adapter }) {
    this.name = name;
    this.adapter = adapter;
  }

  async all() {
    throw new Error(`Postgres repository '${this.name}' preparado, mas nao ativado nesta fase`);
  }

  async findById() {
    throw new Error(`Postgres repository '${this.name}' preparado, mas nao ativado nesta fase`);
  }

  async findOne() {
    throw new Error(`Postgres repository '${this.name}' preparado, mas nao ativado nesta fase`);
  }

  async insert() {
    throw new Error(`Postgres repository '${this.name}' preparado, mas nao ativado nesta fase`);
  }

  async update() {
    throw new Error(`Postgres repository '${this.name}' preparado, mas nao ativado nesta fase`);
  }
}
