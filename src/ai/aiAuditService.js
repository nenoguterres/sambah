import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class AiAuditService {
  constructor({ filePath = "", now = () => new Date(), limit = 1000 } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.limit = limit;
  }

  async recordDecision(decision = {}, input = {}) {
    const entries = await this.#read();
    const entry = {
      timestamp: decision.createdAt || this.now().toISOString(),
      phone: maskPhone(input.phone || input.telefone || input.context?.phone || input.context?.telefone || ""),
      intent: decision.classification?.intent || decision.intent || "unknown",
      confidence: Number(decision.classification?.confidence || decision.confidence || 0),
      decision: decision.guardrail?.action || (decision.approvedToSend ? "allow_send" : "block_send"),
      reason: decision.guardrail?.reason || "",
      approvedToSend: decision.approvedToSend === true
    };
    const nextEntries = [entry, ...entries].slice(0, this.limit);
    await this.#write(nextEntries);
    return { ok: true, entry };
  }

  async list({ limit = 50 } = {}) {
    const entries = await this.#read();
    return { ok: true, storage: "json", total: entries.length, items: entries.slice(0, Number(limit || 50)) };
  }

  async #read() {
    if (!this.filePath) return [];
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code !== "ENOENT") return [];
      return [];
    }
  }

  async #write(entries) {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  }
}

function maskPhone(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
