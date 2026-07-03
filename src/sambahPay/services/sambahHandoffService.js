import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STATUSES = ["pendente", "em_atendimento", "resolvido"];

export class SambahHandoffService {
  constructor({ dataDir = "data", now = () => new Date() } = {}) {
    this.filePath = join(dataDir, "sambah-crm", "handoffs.json");
    this.now = now;
  }

  async upsertPending(input = {}) {
    const phone = normalizePhone(input.phone);
    if (!phone) return { ok: false, statusCode: 400, error: "phone_required" };
    const handoffs = await this.readHandoffs();
    const index = handoffs.findIndex((item) => item.phone === phone && item.status === "pendente");
    const timestamp = this.now().toISOString();
    const existing = index >= 0 ? handoffs[index] : null;
    const handoff = {
      id: existing?.id || crypto.randomUUID(),
      phone,
      name: input.name || existing?.name || "",
      reason: input.reason || existing?.reason || "humano",
      status: "pendente",
      summaryText: input.summaryText || existing?.summaryText || "",
      recentMessages: Array.isArray(input.recentMessages) ? input.recentMessages : existing?.recentMessages || [],
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };
    if (existing) handoffs[index] = handoff;
    else handoffs.unshift(handoff);
    await this.writeHandoffs(handoffs);
    return { ok: true, created: !existing, handoff };
  }

  async pending() {
    return this.list({ status: "pendente" });
  }

  async list(filters = {}) {
    if (filters.status && !STATUSES.includes(filters.status)) return { ok: false, statusCode: 400, error: "invalid_status" };
    const phone = filters.phone ? normalizePhone(filters.phone) : "";
    const handoffs = await this.readHandoffs();
    const items = handoffs.filter((item) => {
      if (filters.status && item.status !== filters.status) return false;
      if (phone && item.phone !== phone) return false;
      return true;
    });
    return { ok: true, total: items.length, items };
  }

  async updateStatus(id, status) {
    if (!STATUSES.includes(status)) return { ok: false, statusCode: 400, error: "invalid_status" };
    const handoffs = await this.readHandoffs();
    const index = handoffs.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, statusCode: 404, error: "handoff_not_found" };
    handoffs[index] = { ...handoffs[index], status, updatedAt: this.now().toISOString() };
    await this.writeHandoffs(handoffs);
    return { ok: true, handoff: handoffs[index] };
  }

  async readHandoffs() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeHandoffs([]);
        return [];
      }
      throw error;
    }
  }

  async writeHandoffs(handoffs) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(handoffs, null, 2)}\n`, "utf8");
  }
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "");
}
