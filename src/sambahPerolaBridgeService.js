import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultDataDir = fileURLToPath(new URL("./data/", import.meta.url));

const DEFAULT_FILES = {
  signals: "sambah-perola-signals.json",
  suggestions: "sambah-perola-suggestions.json"
};

export class SambahPerolaBridgeService {
  constructor({ dataDir = defaultDataDir, workhubService = null, now = () => new Date(), idGenerator = () => crypto.randomUUID() } = {}) {
    this.signalsFile = join(dataDir, DEFAULT_FILES.signals);
    this.suggestionsFile = join(dataDir, DEFAULT_FILES.suggestions);
    this.now = now;
    this.idGenerator = idGenerator;
    this.workhubService = workhubService;
    this.writeQueues = new Map();
  }

  async registrarSinalSambah(payload = {}) {
    return this.#append(this.signalsFile, {
      id: this.idGenerator(),
      origem: "sambah",
      ...normalizePayload(payload),
      registradoEm: this.now().toISOString()
    });
  }

  async listarSinais() {
    return this.#readCollection(this.signalsFile);
  }

  async registrarSugestaoPerola(payload = {}) {
    const suggestion = await this.#append(this.suggestionsFile, {
      id: this.idGenerator(),
      origem: "perola",
      ...normalizePayload(payload),
      registradoEm: this.now().toISOString()
    });

    await registerWorkhubTask(this.workhubService, "sambah", suggestion);
    return suggestion;
  }

  async listarSugestoes() {
    return this.#readCollection(this.suggestionsFile);
  }

  async #append(filePath, item) {
    const previous = this.writeQueues.get(filePath) || Promise.resolve();
    const operation = previous.then(async () => {
      const items = await this.#readCollection(filePath);
      items.unshift(item);
      await this.#writeCollection(filePath, items);
      return { ...item };
    });

    this.writeQueues.set(filePath, operation.catch(() => {}));
    return operation;
  }

  async #readCollection(filePath) {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.#writeCollection(filePath, []);
        return [];
      }
      throw error;
    }
  }

  async #writeCollection(filePath, items) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("O registro deve ser um objeto.");
  }

  return structuredClone(payload);
}

function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

async function registerWorkhubTask(workhubService, sourceModule, suggestion = {}) {
  if (!workhubService?.createTask) return null;
  return workhubService.createTask({
    sourceModule,
    targetModule: "perola",
    title: suggestion.titulo || suggestion.title || suggestion.tipo || suggestion.type || "Sugestão para o Pérola",
    description: suggestion.descricao || suggestion.description || suggestion.message || suggestion.resumo || suggestion.summary || "Sugestão automática enviada ao Pérola.",
    status: "pending",
    priority: suggestion.priority || suggestion.prioridade || "medium"
  });
}
