import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

const PHONE_PATTERN = /(?<!\d)(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}(?!\d)/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN_PATTERN = /\b(?:token|authorization|apikey|api_key|secret|password|senha)\b\s*[:=]\s*["']?[^"',\s}]+/gi;

export function maskSensitive(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    return value
      .replace(TOKEN_PATTERN, (match) => `${match.split(/[:=]/)[0].trim()}: [masked]`)
      .replace(EMAIL_PATTERN, (email) => {
        const [name, domain] = email.split("@");
        return `${name.slice(0, 2)}***@${domain}`;
      })
      .replace(PHONE_PATTERN, (phone) => maskPhone(phone));
  }
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (/phone|whats|telefone|celular|token|authorization|apikey|api_key|secret|password|senha/i.test(key)) {
          return [key, "[masked]"];
        }
        return [key, maskSensitive(entry)];
      })
    );
  }
  return value;
}

function maskPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "[masked-phone]";
  return `***${digits.slice(-4)}`;
}

function eventSignature(event) {
  return [
    event.type || "system",
    event.status || "info",
    event.dedupeKey || "",
    stableStringify(event.context || {}),
    stableStringify(event.error || {})
  ].join("|");
}

function stableStringify(value) {
  if (!value || typeof value !== "object") return String(value ?? "");
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${key}:${stableStringify(value[key])}`).join(",")}}`;
}

function summarize(items) {
  const byType = {};
  const byStatus = {};
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  }
  return { byType, byStatus };
}

export class AuditService {
  constructor({ filePath = "data/audit-logs.json", now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
  }

  async listLogs({ limit = DEFAULT_LIMIT, offset = 0, type, status } = {}) {
    const events = await this.readAll();
    const filtered = events.filter((event) => {
      if (type && event.type !== type) return false;
      if (status && event.status !== status) return false;
      return true;
    });
    const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return {
      total: filtered.length,
      limit: safeLimit,
      offset: safeOffset,
      items: filtered.slice(safeOffset, safeOffset + safeLimit)
    };
  }

  async stats() {
    const events = await this.readAll();
    const lastError = events.find((event) => event.status === "error") || null;
    return {
      total: events.length,
      ...summarize(events),
      lastEventAt: events[0]?.createdAt || null,
      lastErrorAt: lastError?.createdAt || null,
      health: lastError ? "attention" : "ok"
    };
  }

  async record(input) {
    const all = await this.readAll();
    const createdAt = this.now().toISOString();
    const event = {
      id: crypto.randomUUID(),
      createdAt,
      type: input.type || "system_event",
      status: input.status || "info",
      source: input.source || "system",
      message: maskSensitive(input.message || ""),
      context: maskSensitive(input.context || {}),
      error: input.error ? maskSensitive({ name: input.error.name, message: input.error.message }) : undefined,
      dedupeKey: input.dedupeKey || undefined
    };

    if (this.isDuplicate(all, event)) {
      return { event: all.find((entry) => eventSignature(entry) === eventSignature(event)), duplicated: true };
    }

    all.unshift(event);
    await this.writeAll(all);
    return { event, duplicated: false };
  }

  async readAll() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeAll([]);
        return [];
      }
      throw error;
    }
  }

  async writeAll(events) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  }

  isDuplicate(events, event) {
    if (event.type !== "processing_error") return false;
    const signature = eventSignature(event);
    const eventTime = Date.parse(event.createdAt);
    return events.some((entry) => {
      if (eventSignature(entry) !== signature) return false;
      const entryTime = Date.parse(entry.createdAt);
      return Number.isFinite(entryTime) && eventTime - entryTime <= DEDUPE_WINDOW_MS;
    });
  }
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
