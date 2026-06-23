import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonRepository {
  constructor({ filePath, now = () => new Date() } = {}) {
    if (!filePath) throw new Error("filePath is required");
    this.filePath = filePath;
    this.now = now;
  }

  async all() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.saveAll([]);
        return [];
      }
      throw error;
    }
  }

  async findById(id) {
    const items = await this.all();
    return items.find((item) => item.id === id) || null;
  }

  async findOne(predicate) {
    const items = await this.all();
    return items.find(predicate) || null;
  }

  async insert(item) {
    const items = await this.all();
    const createdAt = this.now().toISOString();
    const entry = { ...item, created_at: item.created_at || createdAt, updated_at: item.updated_at || createdAt };
    items.unshift(entry);
    await this.saveAll(items);
    return entry;
  }

  async update(id, patch) {
    const items = await this.all();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const updated = { ...items[index], ...patch, updated_at: this.now().toISOString() };
    items[index] = updated;
    await this.saveAll(items);
    return updated;
  }

  async updateWhere(predicate, updater) {
    const items = await this.all();
    let changed = false;
    const updatedItems = items.map((item) => {
      if (!predicate(item)) return item;
      changed = true;
      const patch = typeof updater === "function" ? updater(item) : updater;
      return { ...item, ...patch, updated_at: this.now().toISOString() };
    });
    if (changed) await this.saveAll(updatedItems);
    return updatedItems;
  }

  async saveAll(items) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
