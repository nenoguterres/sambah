import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const defaultDataFile = fileURLToPath(new URL("./data/insano-workhub.json", import.meta.url));
const SOURCE_MODULES = new Set(["mesa", "sambah", "perola", "pay"]);
const TARGET_MODULES = new Set(["mesa", "sambah", "perola", "pay", "workhub"]);
const STATUSES = new Set(["pending", "in_progress", "blocked", "completed"]);
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

export class InsanoWorkhubService {
  constructor({ dataFile = defaultDataFile, now = () => new Date(), idGenerator = () => crypto.randomUUID() } = {}) {
    this.dataFile = dataFile;
    this.now = now;
    this.idGenerator = idGenerator;
    this.writeQueue = Promise.resolve();
  }

  async createTask(input = {}) {
    const task = normalizeNewTask(input, { now: this.now, idGenerator: this.idGenerator });
    return this.#mutate((tasks) => {
      tasks.unshift(task);
      return task;
    });
  }

  async listTasks({ sourceModule = "", targetModule = "", status = "", limit = 200 } = {}) {
    const source = normalizeFilter(sourceModule, SOURCE_MODULES);
    const target = normalizeFilter(targetModule, TARGET_MODULES);
    const normalizedStatus = normalizeFilter(status, STATUSES);
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
    const tasks = await this.#readTasks();
    const items = tasks
      .filter((task) => !source || task.sourceModule === source)
      .filter((task) => !target || task.targetModule === target)
      .filter((task) => !normalizedStatus || task.status === normalizedStatus)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, normalizedLimit);
    return { ok: true, total: items.length, items };
  }

  async updateTask(id, patch = {}) {
    const taskId = text(id);
    if (!taskId) throw validationError("task_id_required");
    return this.#mutate((tasks) => {
      const index = tasks.findIndex((task) => task.id === taskId);
      if (index < 0) {
        const error = new Error("Tarefa não encontrada.");
        error.code = "task_not_found";
        error.statusCode = 404;
        throw error;
      }

      const current = tasks[index];
      const updated = {
        ...current,
        ...(patch.sourceModule !== undefined ? { sourceModule: enumValue(patch.sourceModule, SOURCE_MODULES, "invalid_source_module") } : {}),
        ...(patch.targetModule !== undefined ? { targetModule: enumValue(patch.targetModule, TARGET_MODULES, "invalid_target_module") } : {}),
        ...(patch.title !== undefined ? { title: requiredText(patch.title, "task_title_required") } : {}),
        ...(patch.description !== undefined ? { description: text(patch.description) } : {}),
        ...(patch.status !== undefined ? { status: enumValue(patch.status, STATUSES, "invalid_task_status") } : {}),
        ...(patch.priority !== undefined ? { priority: enumValue(patch.priority, PRIORITIES, "invalid_task_priority") } : {}),
        updatedAt: this.now().toISOString()
      };
      tasks[index] = updated;
      return updated;
    });
  }

  async summary() {
    const tasks = await this.#readTasks();
    return {
      ok: true,
      total: tasks.length,
      byStatus: countBy(tasks, "status"),
      bySourceModule: countBy(tasks, "sourceModule"),
      byTargetModule: countBy(tasks, "targetModule"),
      urgent: tasks.filter((task) => task.priority === "urgent" && task.status !== "completed").length,
      mostActiveModule: mostActiveModule(tasks),
      lastActivityAt: isoFromTime(tasks.reduce((latest, task) => {
        const value = Date.parse(task.updatedAt || "");
        return Number.isFinite(value) && value > latest ? value : latest;
      }, 0))
    };
  }

  async #mutate(mutation) {
    const operation = this.writeQueue.then(async () => {
      const tasks = await this.#readTasks();
      const result = mutation(tasks);
      await this.#writeTasks(tasks);
      return structuredClone(result);
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async #readTasks() {
    try {
      const raw = await readFile(this.dataFile, "utf8");
      const parsed = JSON.parse(String(raw || "").replace(/^\uFEFF/, "") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.#writeTasks([]);
        return [];
      }
      throw error;
    }
  }

  async #writeTasks(tasks) {
    await mkdir(dirname(this.dataFile), { recursive: true });
    await writeFile(this.dataFile, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
  }
}

function normalizeNewTask(input, { now, idGenerator }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw validationError("invalid_task_payload");
  const timestamp = now().toISOString();
  return {
    id: `work_${idGenerator()}`,
    sourceModule: enumValue(input.sourceModule, SOURCE_MODULES, "invalid_source_module"),
    targetModule: enumValue(input.targetModule, TARGET_MODULES, "invalid_target_module"),
    title: requiredText(input.title, "task_title_required"),
    description: text(input.description),
    status: enumValue(input.status || "pending", STATUSES, "invalid_task_status"),
    priority: enumValue(input.priority || "medium", PRIORITIES, "invalid_task_priority"),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function enumValue(value, allowed, code) {
  const normalized = text(value).toLowerCase();
  if (!allowed.has(normalized)) throw validationError(code);
  return normalized;
}

function requiredText(value, code) {
  const normalized = text(value);
  if (!normalized) throw validationError(code);
  return normalized;
}

function normalizeFilter(value, allowed) {
  const normalized = text(value).toLowerCase();
  return allowed.has(normalized) ? normalized : "";
}

function validationError(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] || 0) + 1;
    return counts;
  }, {});
}

function mostActiveModule(tasks) {
  const counts = countBy(tasks, "sourceModule");
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function isoFromTime(value) {
  return value ? new Date(value).toISOString() : "";
}

function text(value) {
  return String(value ?? "").trim();
}
