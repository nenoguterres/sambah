import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_CONVERSION = Object.freeze({
  events: [],
  intentDetected: {},
  origins: {},
  ordersStarted: 0,
  ordersCompleted: 0,
  leadsCreated: 0,
  quotesRequested: 0,
  confirmedConversions: 0
});

const EVENT_TYPES = new Set([
  "intent_detected",
  "order_started",
  "order_completed",
  "lead_created",
  "quote_requested",
  "sale_confirmed"
]);

export class AiConversionService {
  constructor({ filePath = "", now = () => new Date(), limit = 2000 } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.limit = limit;
  }

  async recordEvent(event = {}) {
    const type = normalizeType(event.type);
    if (!type) return { ok: false, error: "invalid_conversion_event" };
    if (type === "sale_confirmed" && event.confirmed !== true) {
      return { ok: false, error: "sale_requires_internal_confirmation" };
    }

    const data = await this.#read();
    const entry = {
      timestamp: event.timestamp || this.now().toISOString(),
      type,
      intent: normalizeIntent(event.intent || "unknown"),
      origin: String(event.origin || "unknown").trim() || "unknown",
      source: String(event.source || "internal").trim() || "internal",
      confirmed: event.confirmed === true,
      referenceId: String(event.referenceId || "").trim()
    };

    data.events = [entry, ...data.events].slice(0, this.limit);
    data.intentDetected[entry.intent] = (data.intentDetected[entry.intent] || 0) + 1;
    data.origins[entry.origin] = (data.origins[entry.origin] || 0) + 1;
    if (type === "order_started") data.ordersStarted += 1;
    if (type === "order_completed") data.ordersCompleted += 1;
    if (type === "lead_created") data.leadsCreated += 1;
    if (type === "quote_requested") data.quotesRequested += 1;
    if (type === "sale_confirmed") data.confirmedConversions += 1;
    data.updatedAt = this.now().toISOString();

    await this.#write(data);
    return { ok: true, event: entry, summary: this.summaryFrom(data) };
  }

  async summary() {
    return this.summaryFrom(await this.#read());
  }

  summaryFrom(data = {}) {
    const conversion = normalizeConversion(data);
    return {
      ok: true,
      storage: "json",
      leadsCreated: conversion.leadsCreated,
      quotesRequested: conversion.quotesRequested,
      ordersStarted: conversion.ordersStarted,
      ordersCompleted: conversion.ordersCompleted,
      confirmedConversions: conversion.confirmedConversions,
      intentRanking: buildRanking(conversion.intentDetected, "intent"),
      origins: buildRanking(conversion.origins, "origin"),
      recentEvents: conversion.events.slice(0, 20),
      updatedAt: conversion.updatedAt || null
    };
  }

  async #read() {
    if (!this.filePath) return normalizeConversion();
    try {
      return normalizeConversion(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") return normalizeConversion();
      return normalizeConversion();
    }
  }

  async #write(data) {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(normalizeConversion(data), null, 2)}\n`, "utf8");
  }
}

function normalizeConversion(data = {}) {
  return {
    ...EMPTY_CONVERSION,
    ...data,
    events: Array.isArray(data.events) ? data.events : [],
    intentDetected: { ...(data.intentDetected || {}) },
    origins: { ...(data.origins || {}) },
    ordersStarted: Number(data.ordersStarted || 0),
    ordersCompleted: Number(data.ordersCompleted || 0),
    leadsCreated: Number(data.leadsCreated || 0),
    quotesRequested: Number(data.quotesRequested || 0),
    confirmedConversions: Number(data.confirmedConversions || 0)
  };
}

function normalizeType(type = "") {
  const value = String(type || "").trim().toLowerCase();
  return EVENT_TYPES.has(value) ? value : "";
}

function normalizeIntent(intent = "") {
  return String(intent || "unknown").trim().toLowerCase() || "unknown";
}

function buildRanking(values = {}, keyName = "key") {
  return Object.entries(values)
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((left, right) => right.count - left.count || String(left[keyName]).localeCompare(String(right[keyName])));
}
