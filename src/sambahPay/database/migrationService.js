import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationDir = fileURLToPath(new URL("./migrations/", import.meta.url));

export class MigrationService {
  constructor({ directory = migrationDir } = {}) {
    this.directory = directory;
  }

  async list() {
    const entries = await readdir(this.directory, { withFileTypes: true });
    const migrations = [];
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".sql")).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(this.directory, entry.name);
      const sql = await readFile(path, "utf8");
      migrations.push({
        name: entry.name,
        path,
        statements: countStatements(sql),
        indexes: extractIndexes(sql),
        tables: extractTables(sql)
      });
    }
    return { ok: true, directory: this.directory, total: migrations.length, items: migrations };
  }

  async dryRun() {
    const migrations = await this.list();
    return {
      ok: true,
      mode: "dry_run",
      executed: false,
      message: "Migrations listadas sem conexao com banco real",
      migrations: migrations.items
    };
  }
}

function countStatements(sql = "") {
  return sql.split(";").map((item) => item.trim()).filter(Boolean).length;
}

function extractIndexes(sql = "") {
  return [...sql.matchAll(/create\s+index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)].map((match) => match[1]);
}

function extractTables(sql = "") {
  return [...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+([a-z0-9_]+)/gi)].map((match) => match[1]);
}

export function migrationsDirectory() {
  return dirname(join(migrationDir, "x"));
}
