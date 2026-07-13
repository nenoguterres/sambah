import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_PRODUCTS = [
  product("hamburguer", "Hamburguer", "Food truck de hamburguer para eventos e grupos."),
  product("pizzas", "Pizzas", "Pizzas para eventos, confraternizacoes e festas."),
  product("churrasquinho", "Churrasquinho", "Espetinhos e churrasquinho para atendimento em evento."),
  product("porcoes-boteco", "Porcoes de buteco", "Porcoes para eventos no estilo boteco Insano."),
  product("joelho-porco", "Joelho de Porco", "Joelho de porco para eventos sob consulta.")
];

export class InsanoCatalogService {
  constructor({ filePath = "data/insano-catalog.json", now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
  }

  async list() {
    const stored = await this.readCatalog();
    const items = stored.length ? stored : DEFAULT_PRODUCTS;
    return { ok: true, items: items.map(normalizeProduct).filter((item) => item.active !== false) };
  }

  async adminList() {
    const stored = await this.readCatalog();
    const items = stored.length ? stored : DEFAULT_PRODUCTS;
    return { ok: true, items: items.map(normalizeProduct) };
  }

  async saveItems(items = []) {
    if (!Array.isArray(items)) return { ok: false, error: "items_required" };
    const normalized = items.map(normalizeProduct).filter((item) => item.name);
    if (!normalized.length) return { ok: false, error: "at_least_one_product_required" };
    const now = this.now().toISOString();
    const withTimestamps = normalized.map((item, index) => ({
      ...item,
      order: Number(item.order || index + 1),
      updatedAt: now
    }));
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(withTimestamps, null, 2)}\n`, "utf8");
    return { ok: true, items: withTimestamps };
  }

  async readCatalog() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      if (error instanceof SyntaxError) return [];
      throw error;
    }
  }
}

function product(id, name, description) {
  return { id, name, description, imageUrl: "", active: true };
}

function normalizeProduct(item = {}) {
  const id = cleanId(item.id || item.slug || item.name);
  return {
    id,
    name: cleanText(item.name || item.nome || ""),
    description: cleanText(item.description || item.descricao || ""),
    imageUrl: cleanUrl(item.imageUrl || item.image || item.foto || ""),
    active: item.active !== false,
    order: Number(item.order || item.ordem || 0) || 0
  };
}

function cleanText(value = "") {
  return String(value || "").trim().slice(0, 500);
}

function cleanId(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `produto-${Date.now()}`;
}

function cleanUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString().slice(0, 600) : "";
  } catch {
    return "";
  }
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
