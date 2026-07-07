import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_PRODUCTS = [
  { id: "espeto-carne", name: "Espetinho de carne", category: "Espetinhos", available: true },
  { id: "espeto-frango", name: "Espetinho de frango", category: "Espetinhos", available: true },
  { id: "xis", name: "Xis", category: "Lanches", available: true },
  { id: "hamburguer", name: "Hamburguer", category: "Lanches", available: true },
  { id: "coca-cola", name: "Coca-Cola", category: "Bebidas", available: true },
  { id: "agua", name: "Agua", category: "Bebidas", available: true }
];

export class WhatsAppCatalogService {
  constructor({ filePath, now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
  }

  async list() {
    const data = await this.#read();
    const products = data.products.length ? data.products : DEFAULT_PRODUCTS;
    return { ok: true, products, updatedAt: data.updatedAt || "" };
  }

  async upsertFromMesaStock(input = {}) {
    const products = normalizeMesaProducts(input);
    if (!products.length) return { ok: false, error: "products_required" };
    const now = this.now().toISOString();
    const data = {
      source: "mesa_stock",
      updatedAt: now,
      products,
      audit: [{ type: "catalog_updated_from_mesa", at: now, count: products.length }]
    };
    await this.#write(data);
    return { ok: true, products, updatedAt: now };
  }

  async formatForWhatsApp() {
    const { products } = await this.list();
    const available = products.filter((item) => item.available !== false);
    if (!available.length) {
      return "Cardapio SamBah esta sem itens disponiveis agora. Vou chamar a equipe para conferir.";
    }
    const groups = new Map();
    for (const product of available) {
      const category = product.category || "Cardapio";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(product);
    }
    const lines = ["Cardapio SamBah de hoje:"];
    for (const [category, items] of groups.entries()) {
      lines.push("", category);
      items.slice(0, 8).forEach((item, index) => {
        lines.push(`${index + 1}. ${item.name}`);
      });
    }
    lines.push("", "Me manda o que tu quer pedir que eu monto tua comanda por aqui.");
    return lines.join("\n");
  }

  async #read() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "{}");
      return {
        products: Array.isArray(parsed.products) ? parsed.products : [],
        updatedAt: parsed.updatedAt || ""
      };
    } catch (error) {
      if (error.code === "ENOENT") return { products: DEFAULT_PRODUCTS, updatedAt: "" };
      throw error;
    }
  }

  async #write(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

function normalizeMesaProducts(input = {}) {
  const source = Array.isArray(input) ? input : input.products || input.items || input.stock || [];
  return source
    .map((item, index) => ({
      id: String(item.id || item.productId || item.sku || `mesa_item_${index + 1}`),
      name: String(item.name || item.nome || item.label || "").trim(),
      category: String(item.category || item.categoria || item.group || "Cardapio").trim(),
      available: item.available !== false && item.disponivel !== false && Number(item.stock ?? item.estoque ?? 1) !== 0,
      price: item.price ?? item.preco ?? null,
      mesaProductId: item.mesaProductId || item.productId || item.id || ""
    }))
    .filter((item) => item.name);
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
