import { createWhatsAppV2State } from "./conversationState.js";
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import crypto from "node:crypto";

export class InMemoryWhatsAppV2ConversationRepository {
  constructor({ operationLog = [] } = {}) {
    this.states = new Map();
    this.messageStatuses = new Map();
    this.operations = operationLog;
  }

  async reserveMessage(messageId) {
    this.operations.push("reserveMessage");
    if (this.messageStatuses.has(messageId)) return false;
    this.messageStatuses.set(messageId, { status: "reserved", updatedAt: new Date().toISOString() });
    return true;
  }

  async get(conversationId) {
    this.operations.push("loadState");
    return structuredClone(this.states.get(conversationId) || createWhatsAppV2State(conversationId));
  }

  async save(state) {
    this.operations.push("saveState");
    this.states.set(state.conversationId, structuredClone(state));
    return structuredClone(state);
  }

  async markMessageProcessed(messageId) {
    this.operations.push("markProcessed");
    this.messageStatuses.set(messageId, { status: "processed", updatedAt: new Date().toISOString() });
  }

  async markMessageFailed(messageId, error) {
    this.operations.push("markFailed");
    this.messageStatuses.set(messageId, { status: "failed", error: String(error?.message || error), updatedAt: new Date().toISOString() });
  }

  async setAutomatic(conversationId) {
    this.operations.push("setAutomatic");
    const current = this.states.get(conversationId) || createWhatsAppV2State(conversationId);
    const next = {
      ...current,
      mode: "bot",
      serviceState: "AUTOMATICO",
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      updatedAt: new Date().toISOString()
    };
    this.states.set(conversationId, structuredClone(next));
    return structuredClone(next);
  }

  async markMesaOrderReceived(input = {}) {
    this.operations.push("markMesaOrderReceived");
    const transition = buildMesaOrderReceivedTransition(this.states.get(input.phone), input);
    if (transition.changed) this.states.set(input.phone, structuredClone(transition.state));
    return structuredClone(transition.result);
  }

  async confirmCustomerOrder(input = {}) {
    this.operations.push("confirmCustomerOrder");
    const transition = buildCustomerOrderConfirmedTransition(findConversationState(this.states, input), input);
    if (transition.changed) this.states.set(transition.state.conversationId, structuredClone(transition.state));
    return structuredClone(transition.result);
  }
}

export class FileWhatsAppV2ConversationRepository extends InMemoryWhatsAppV2ConversationRepository {
  constructor({ filePath, operationLog = [], atomicWrite = atomicWriteJsonFile } = {}) {
    super({ operationLog });
    this.filePath = filePath;
    this.loaded = false;
    this.mutationQueue = Promise.resolve();
    this.atomicWrite = atomicWrite;
  }

  async reserveMessage(messageId) {
    return this.#mutate("reserveMessage", async ({ messageStatuses }) => {
      if (messageStatuses.has(messageId)) return { result: false, changed: false };
      messageStatuses.set(messageId, { status: "reserved", updatedAt: new Date().toISOString() });
      return { result: true, changed: true };
    });
  }

  async get(conversationId) {
    await this.load();
    return super.get(conversationId);
  }

  async save(state) {
    return this.#mutate("saveState", async ({ states }) => {
      const saved = structuredClone(state);
      states.set(saved.conversationId, saved);
      return { result: structuredClone(saved), changed: true };
    });
  }

  async markMessageProcessed(messageId) {
    return this.#mutate("markProcessed", async ({ messageStatuses }) => {
      messageStatuses.set(messageId, { status: "processed", updatedAt: new Date().toISOString() });
      return { result: undefined, changed: true };
    });
  }

  async markMessageFailed(messageId, error) {
    return this.#mutate("markFailed", async ({ messageStatuses }) => {
      messageStatuses.set(messageId, { status: "failed", error: String(error?.message || error), updatedAt: new Date().toISOString() });
      return { result: undefined, changed: true };
    });
  }

  async setAutomatic(conversationId) {
    return this.#mutate("setAutomatic", async ({ states }) => {
      const current = states.get(conversationId) || createWhatsAppV2State(conversationId);
      const next = {
        ...current,
        mode: "bot",
        serviceState: "AUTOMATICO",
        activeFlow: null,
        activeStep: null,
        awaitingInput: false,
        updatedAt: new Date().toISOString()
      };
      states.set(conversationId, next);
      return { result: structuredClone(next), changed: true };
    });
  }

  async markMesaOrderReceived(input = {}) {
    return this.#mutate("markMesaOrderReceived", async ({ states }) => {
      const transition = buildMesaOrderReceivedTransition(states.get(input.phone), input);
      if (transition.changed) states.set(input.phone, transition.state);
      return { result: structuredClone(transition.result), changed: transition.changed };
    });
  }

  async confirmCustomerOrder(input = {}) {
    return this.#mutate("confirmCustomerOrder", async ({ states }) => {
      const transition = buildCustomerOrderConfirmedTransition(findConversationState(states, input), input);
      if (transition.changed) states.set(transition.state.conversationId, transition.state);
      return { result: structuredClone(transition.result), changed: transition.changed };
    });
  }

  async load({ force = false } = {}) {
    if (this.loaded && !force) return;
    if (!this.filePath) {
      this.loaded = true;
      return;
    }
    try {
      await cleanupOwnOrphanTemps(this.filePath);
      const data = parseAndValidateSnapshot(await readFile(this.filePath, "utf8"), "load");
      this.states = new Map(Object.entries(data.states));
      this.messageStatuses = new Map(Object.entries(data.messageStatuses));
      this.loaded = true;
    } catch (error) {
      if (error?.code === "ENOENT") {
        this.loaded = true;
        return;
      }
      if (error?.code === "whatsapp_v2_state_corrupt") throw error;
      throw controlledStateError("whatsapp_v2_state_read_failed", "load", error);
    }
  }

  async persist() {
    if (!this.filePath) return;
    await this.#persistSnapshot(this.states, this.messageStatuses);
  }

  async #mutate(operation, mutator) {
    const previous = this.mutationQueue;
    let release;
    this.mutationQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous.catch(() => {});
    try {
      return await withStateFileLock(this.filePath, async () => {
        await this.load({ force: Boolean(this.filePath) });
        this.operations.push(operation);
        const nextStates = cloneMap(this.states);
        const nextMessageStatuses = cloneMap(this.messageStatuses);
        const mutation = await mutator({ states: nextStates, messageStatuses: nextMessageStatuses });
        if (mutation?.changed !== false) {
          await this.#persistSnapshot(nextStates, nextMessageStatuses);
          this.states = nextStates;
          this.messageStatuses = nextMessageStatuses;
        }
        return mutation?.result;
      });
    } finally {
      release();
    }
  }

  async #persistSnapshot(states, messageStatuses) {
    if (!this.filePath) return;
    const snapshot = {
      states: Object.fromEntries(states.entries()),
      messageStatuses: Object.fromEntries(messageStatuses.entries())
    };
    const payload = serializeAndValidateSnapshot(snapshot);
    try {
      await this.atomicWrite(this.filePath, payload);
    } catch (error) {
      if (String(error?.code || "").startsWith("whatsapp_v2_state_")) throw error;
      throw controlledStateError("whatsapp_v2_state_write_failed", "persist", error);
    }
  }
}

async function withStateFileLock(filePath, callback, { timeoutMs = 5000, retryMs = 25 } = {}) {
  if (!filePath) return callback();
  const directory = dirname(filePath);
  const lockPath = join(directory, `${basename(filePath)}.v2-lock`);
  const startedAt = Date.now();
  let handle = null;
  await mkdir(directory, { recursive: true });
  while (!handle) {
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw controlledStateError("whatsapp_v2_state_lock_failed", "lock", error);
      if (Date.now() - startedAt > timeoutMs) throw controlledStateError("whatsapp_v2_state_lock_timeout", "lock", error);
      await sleep(retryMs);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }), "utf8");
    await handle.sync();
    return await callback();
  } finally {
    try {
      await handle.close();
    } catch {}
    try {
      await unlink(lockPath);
    } catch {}
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneMap(map) {
  return new Map([...map.entries()].map(([key, value]) => [key, structuredClone(value)]));
}

function parseAndValidateSnapshot(raw, operation) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw controlledStateError("whatsapp_v2_state_corrupt", operation, error);
  }
  validateSnapshotObject(parsed, operation);
  return parsed;
}

function serializeAndValidateSnapshot(snapshot) {
  validateSnapshotObject(snapshot, "serialize");
  let payload;
  try {
    payload = `${JSON.stringify(snapshot, null, 2)}\n`;
  } catch (error) {
    throw controlledStateError("whatsapp_v2_state_snapshot_invalid", "serialize", error);
  }
  if (!payload.trim()) throw controlledStateError("whatsapp_v2_state_snapshot_invalid", "serialize");
  parseAndValidateSnapshot(payload, "serialize");
  return payload;
}

function validateSnapshotObject(snapshot, operation) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw controlledStateError("whatsapp_v2_state_snapshot_invalid", operation);
  }
  if (!isPlainObject(snapshot.states) || !isPlainObject(snapshot.messageStatuses)) {
    throw controlledStateError(operation === "load" ? "whatsapp_v2_state_corrupt" : "whatsapp_v2_state_snapshot_invalid", operation);
  }
  assertNoUndefined(snapshot.states, operation);
  assertNoUndefined(snapshot.messageStatuses, operation);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertNoUndefined(value, operation, seen = new Set()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) throw controlledStateError("whatsapp_v2_state_snapshot_invalid", operation);
  seen.add(value);
  for (const item of Object.values(value)) {
    if (item === undefined) throw controlledStateError("whatsapp_v2_state_snapshot_invalid", operation);
    assertNoUndefined(item, operation, seen);
  }
  seen.delete(value);
}

async function atomicWriteJsonFile(filePath, payload) {
  const directory = dirname(filePath);
  const tempPath = join(directory, `${basename(filePath)}.v2-write-${process.pid}-${Date.now()}-${crypto.randomUUID()}.tmp`);
  let handle = null;
  try {
    await mkdir(directory, { recursive: true });
    await cleanupOwnOrphanTemps(filePath);
    handle = await open(tempPath, "wx");
    await handle.writeFile(payload, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempPath, filePath);
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch {}
    }
    try {
      await unlink(tempPath);
    } catch {}
    throw controlledStateError(renameErrorCode(error) ? "whatsapp_v2_state_rename_failed" : "whatsapp_v2_state_write_failed", "atomic_write", error);
  }
}

async function cleanupOwnOrphanTemps(filePath, { minAgeMs = 60000 } = {}) {
  const directory = dirname(filePath);
  const prefix = `${basename(filePath)}.v2-write-`;
  let entries = [];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw controlledStateError("whatsapp_v2_state_read_failed", "cleanup_temps", error);
  }
  let removed = 0;
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith(".tmp")) continue;
    const tempPath = join(directory, entry);
    try {
      const info = await stat(tempPath);
      if (now - info.mtimeMs < minAgeMs) continue;
      await unlink(tempPath);
      removed += 1;
    } catch {
      // Best-effort cleanup only; active or inaccessible temp files are ignored.
    }
  }
  return removed;
}

function renameErrorCode(error) {
  return ["EEXIST", "EPERM", "EACCES", "ENOENT"].includes(error?.code);
}

function controlledStateError(code, operation, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.operation = operation;
  if (cause?.code) error.errno = cause.code;
  return error;
}

function buildMesaOrderReceivedTransition(current, input = {}) {
  if (!current) {
    return { changed: false, state: null, result: { ok: false, statusCode: 404, error: "conversation_not_found" } };
  }
  const mesaOrderId = String(input.mesaOrderId || "").trim();
  const phone = String(input.phone || "").replace(/\D/g, "");
  const expectedConversationId = phone ? `wa_${phone}` : String(current.conversationId || "");
  if (!mesaOrderId || String(input.conversationId || "") !== expectedConversationId) {
    return { changed: false, state: current, result: { ok: false, statusCode: 400, error: "mesa_correlation_invalid" } };
  }
  if (current.sambahConversationId && String(input.sambahConversationId || "") !== current.sambahConversationId) {
    return { changed: false, state: current, result: { ok: false, statusCode: 409, error: "mesa_correlation_mismatch" } };
  }
  if (current.serviceState === "PEDIDO_MESA_RECEBIDO" && current.mesaOrderId === mesaOrderId) {
    return { changed: false, state: current, result: { ok: true, statusCode: 200, duplicate: true, state: structuredClone(current) } };
  }
  if (current.serviceState !== "AGUARDANDO_PEDIDO_MESA") {
    return { changed: false, state: current, result: { ok: false, statusCode: 409, error: "conversation_not_waiting_for_mesa" } };
  }
  const next = {
    ...current,
    serviceState: "PEDIDO_MESA_RECEBIDO",
    mesaOrderId,
    mesaOrderReceivedAt: new Date().toISOString(),
    activeMenu: "payment_main_menu",
    activeFlow: null,
    activeStep: null,
    awaitingInput: false,
    updatedAt: new Date().toISOString()
  };
  return { changed: true, state: next, result: { ok: true, statusCode: 200, duplicate: false, state: structuredClone(next) } };
}

function findConversationState(states, input = {}) {
  const phone = String(input.phone || "").replace(/\D/g, "");
  const ids = [input.stateId, phone, input.conversationId, phone ? `wa_${phone}` : ""].filter(Boolean).map(String);
  for (const id of ids) {
    if (states.has(id)) return states.get(id);
  }
  return null;
}

function buildCustomerOrderConfirmedTransition(current, input = {}) {
  if (!current) return { changed: false, state: null, result: { ok: false, statusCode: 404, error: "conversation_not_found" } };
  if (current.serviceState !== "AGUARDANDO_COMANDA_MESA") {
    return { changed: false, state: current, result: { ok: false, statusCode: 409, error: "conversation_not_waiting_for_customer_order" } };
  }
  const now = new Date().toISOString();
  const next = {
    ...current,
    serviceState: "COMANDA_MESA_CONFIRMADA",
    customerOrder: structuredClone(input.order),
    customerOrderConfirmedAt: now,
    customerOrderTokenHash: null,
    customerOrderTokenCreatedAt: null,
    sambahPayPaymentId: String(input.paymentId || ""),
    activeMenu: "fulfillment_main_menu",
    activeFlow: null,
    activeStep: null,
    awaitingInput: false,
    updatedAt: now
  };
  return { changed: true, state: next, result: { ok: true, statusCode: 200, state: structuredClone(next) } };
}

export class InMemoryWhatsAppV2OutboxRepository {
  constructor({ operationLog = [] } = {}) {
    this.items = new Map();
    this.byMessageId = new Map();
    this.sequence = 0;
    this.operations = operationLog;
  }

  async add(entry) {
    this.operations.push("createOutbox");
    const existingId = this.byMessageId.get(entry.messageId);
    if (existingId) return structuredClone(this.items.get(existingId));
    const now = new Date().toISOString();
    const item = {
      id: `wa-v2-outbox-${++this.sequence}`,
      conversationId: entry.conversationId,
      messageId: entry.messageId,
      reply: structuredClone(entry.reply),
      to: entry.to,
      traceId: entry.traceId,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      sentAt: null
    };
    this.items.set(item.id, item);
    this.byMessageId.set(item.messageId, item.id);
    return structuredClone(item);
  }

  async markSending(id) {
    this.operations.push("markSending");
    const item = this.items.get(id);
    if (!item || item.status === "sent" || item.status === "cancelled") return item ? structuredClone(item) : null;
    item.status = "sending";
    item.attempts += 1;
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  }

  async markSent(id) {
    this.operations.push("markOutboxSent");
    const item = this.items.get(id);
    if (!item) return null;
    item.status = "sent";
    item.lastError = null;
    item.updatedAt = new Date().toISOString();
    item.sentAt = item.updatedAt;
    return structuredClone(item);
  }

  async markFailed(id, error) {
    this.operations.push("markOutboxFailed");
    const item = this.items.get(id);
    if (!item) return null;
    item.status = "failed";
    item.lastError = String(error?.message || error);
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  }

  list() {
    return [...this.items.values()].map((item) => structuredClone(item));
  }
}
