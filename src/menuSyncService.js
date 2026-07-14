import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getMesaConfig } from "./mesaIntegrationService.js";

const DEFAULT_CACHE_FILE = "data/menu-cache.json";
const DEFAULT_MENU_PATH = "/api/menu";

export function getMenuConfig() {
  return {
    ...getMesaConfig(),
    menuPath: process.env.MESA_MENU_PATH || DEFAULT_MENU_PATH
  };
}

export class MenuSyncService {
  constructor({ cacheFile = DEFAULT_CACHE_FILE, config = getMenuConfig(), fetchImpl = globalThis.fetch } = {}) {
    this.cacheFile = cacheFile;
    this.config = config;
    this.fetch = fetchImpl;
  }

  async status() {
    const cache = await this.readCache();
    const activeItems = cache.items.filter((item) => item.available !== false && item.availability?.available !== false).length;
    const unavailableItems = cache.items.length - activeItems;
    return {
      ok: true,
      mesaBaseUrl: this.config.baseUrl,
      menuPath: this.config.menuPath,
      cached: cache.items.length > 0,
      totalItems: cache.items.length,
      activeItems,
      unavailableItems,
      updatedAt: cache.updatedAt || null,
      lastSyncAt: cache.lastSyncAt || null
    };
  }

  async fetchMenuFromMesa() {
    const response = await this.fetch(`${this.config.baseUrl}${this.config.menuPath}`, {
      method: "GET",
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Mesa respondeu HTTP ${response.status} ao sincronizar cardapio`);
    }
    const payload = await response.json();
    return normalizeMenuPayload(payload);
  }

  async saveMenuCache(cache) {
    const normalized = normalizeMenuPayload(cache);
    await this.writeCache(normalized);
    return normalized;
  }

  async getMenuCache() {
    return this.readCache();
  }

  async syncMenu() {
    const normalized = await this.fetchMenuFromMesa();
    await this.saveMenuCache(normalized);
    return normalized;
  }

  async cacheSnapshot() {
    return this.getMenuCache();
  }

  async validateOrder(order) {
    return this.validateOrderItemsAgainstMenu(order);
  }

  async validateOrderItemsAgainstMenu(order) {
    const cache = await this.readCache();
    const productById = new Map(cache.items.map((item) => [item.productId, item]));
    const items = order?.order?.items || [];
    const problems = [];

    if (!items.length) {
      return {
        ok: false,
        reason: "pedido_sem_itens",
        message: "Pedido nao contem itens para validar no cardapio do Mesa"
      };
    }

    if (!cache.items.length) {
      return {
        ok: false,
        reason: "menu_nao_sincronizado",
        message: "Cardapio do Mesa ainda nao foi sincronizado no samBah!"
      };
    }

    for (const item of items) {
      const qty = Number(item.qty ?? item.quantity ?? item.quantidade ?? 0);
      if (!item.productId) {
        problems.push({ reason: "produto_sem_productId", item });
        continue;
      }
      const product = productById.get(item.productId);
      if (!product) {
        problems.push({ reason: "productId_invalido", item });
        continue;
      }
      if (product.available === false || product.availability?.available === false) {
        problems.push({ reason: "produto_indisponivel", item });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        problems.push({ reason: "quantidade_invalida", item });
      }
      if (item.serveMode && Array.isArray(product.serviceModes) && !product.serviceModes.includes(item.serveMode)) {
        problems.push({ reason: "modo_servico_invalido", item });
      }
      for (const addon of normalizeRequestedAddons(item.addons)) {
        const addonMatch = product.addons.find((candidate) => (candidate.id || candidate.addonId || candidate.name) === addon.id);
        if (!addonMatch) {
          problems.push({ reason: "addon_invalido", item, addon });
          continue;
        }
        if (addonMatch.available === false || addonMatch.availability?.available === false) {
          problems.push({ reason: "addon_indisponivel", item, addon });
        }
      }
    }

    if (problems.length) {
      const primaryReason = problems[0].reason;
      return {
        ok: false,
        reason: primaryReason,
        message: validationMessage(primaryReason),
        invalidItems: problems.map((problem) => problem.item),
        problems
      };
    }

    return { ok: true, items: items.length };
  }

  async readCache() {
    try {
      const raw = await readFile(this.cacheFile, "utf8");
      return normalizeMenuPayload(JSON.parse(stripBom(raw) || "{}"));
    } catch (error) {
      if (error.code === "ENOENT") {
        const empty = normalizeMenuPayload({});
        await this.writeCache(empty);
        return empty;
      }
      throw error;
    }
  }

  async writeCache(cache) {
    await mkdir(dirname(this.cacheFile), { recursive: true });
    await writeFile(this.cacheFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  }
}

export function normalizeMenuPayload(payload = {}) {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems.map((item) => ({
    id: item.productId || item.id,
    productId: item.productId || item.id,
    name: item.name || item.nome || "",
    category: item.category || item.categoria || "",
    price: Number(item.price ?? item.preco ?? 0),
    description: item.description || item.descricao || "",
    imageUrl: item.imageUrl || item.imagem || item.image || "",
    videoUrl: item.videoUrl || item.video || "",
    available: item.available ?? item.availability?.available ?? true,
    availability: item.availability || { available: item.available ?? true },
    serviceModes: Array.isArray(item.serviceModes) ? item.serviceModes : ["Mesa", "Levar"],
    addons: Array.isArray(item.addons) ? item.addons.map(normalizeAddon).filter((addon) => addon.id) : []
  })).filter((item) => item.productId);

  return {
    ok: payload.ok !== false,
    source: payload.source || "mesa-do-xeriffe",
    updatedAt: payload.updatedAt || null,
    lastSyncAt: payload.lastSyncAt || new Date().toISOString(),
    categories: Array.isArray(payload.categories) ? payload.categories : [...new Set(items.map((item) => item.category).filter(Boolean))],
    serviceModes: Array.isArray(payload.serviceModes) ? payload.serviceModes : ["Mesa", "Levar"],
    items
  };
}

function normalizeAddon(addon = {}) {
  const id = addon.id || addon.addonId || addon.name || addon.nome;
  return {
    ...addon,
    id,
    name: addon.name || addon.nome || id,
    price: Number(addon.price ?? addon.preco ?? 0),
    available: addon.available ?? addon.availability?.available ?? true,
    availability: addon.availability || { available: addon.available ?? true }
  };
}

function normalizeRequestedAddons(addons = []) {
  if (!Array.isArray(addons)) return [];
  return addons.map((addon) => {
    if (typeof addon === "string") return { id: addon };
    return { ...addon, id: addon.id || addon.addonId || addon.name || addon.nome };
  }).filter((addon) => addon.id);
}

function validationMessage(reason) {
  const messages = {
    produto_sem_productId: "Pedido contem item sem productId e precisa de conferencia manual",
    productId_invalido: "Pedido contem productId inexistente no cardapio sincronizado",
    produto_indisponivel: "Pedido contem produto indisponivel no cardapio do Mesa",
    quantidade_invalida: "Pedido contem quantidade invalida",
    modo_servico_invalido: "Pedido contem modo de servico indisponivel para o produto",
    addon_invalido: "Pedido contem adicional inexistente para o produto",
    addon_indisponivel: "Pedido contem adicional indisponivel"
  };
  return messages[reason] || "Pedido precisa de conferencia manual antes de enviar ao Mesa";
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
