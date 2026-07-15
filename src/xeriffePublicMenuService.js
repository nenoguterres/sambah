import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";
import { buildMesaOrder } from "./mesaIntegrationService.js";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_QUANTITY = 30;

export class XeriffePublicMenuService {
  constructor({ menuService, mesaService, sessionsFile = "data/xeriffe-public-sessions.json", whatsappNumber = "", now = () => Date.now() } = {}) {
    this.menuService = menuService;
    this.mesaService = mesaService;
    this.sessionsFile = sessionsFile;
    this.whatsappNumber = String(whatsappNumber || "").replace(/\D/g, "");
    this.now = now;
  }

  async ensureSession(candidate = "") {
    const store = await this.readStore();
    this.prune(store);
    let session = store.sessions.find((item) => item.id === candidate);
    let created = false;
    if (!session) {
      const now = this.now();
      session = {
        id: crypto.randomBytes(24).toString("base64url"),
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
        items: [],
        finalized: null
      };
      store.sessions.push(session);
      created = true;
    } else {
      this.touch(session);
    }
    await this.writeStore(store);
    return { id: session.id, created };
  }

  async catalog() {
    const cache = await this.menuService.getMenuCache();
    const items = (cache.items || [])
      .filter((item) => item.available !== false && item.availability?.available !== false)
      .filter((item) => cents(item.price ?? item.preco) > 0)
      .map(publicProduct);
    return {
      ok: true,
      source: "mesa",
      updatedAt: cache.updatedAt || cache.lastSyncAt || null,
      categories: [...new Set(items.map((item) => item.category).filter(Boolean))],
      items,
      whatsappUrl: this.whatsappNumber ? `https://wa.me/${this.whatsappNumber}` : ""
    };
  }

  async cart(sessionId) {
    const { store, session } = await this.requireSession(sessionId);
    const cart = await this.calculate(session.items);
    this.touch(session);
    await this.writeStore(store);
    return { ok: true, ...cart };
  }

  async addItem(sessionId, input = {}) {
    const { store, session } = await this.requireSession(sessionId);
    const normalized = await this.normalizeItem(input);
    session.items.push({ id: crypto.randomUUID(), ...normalized });
    session.finalized = null;
    this.touch(session);
    await this.writeStore(store);
    return { ok: true, ...(await this.calculate(session.items)) };
  }

  async updateItem(sessionId, itemId, input = {}) {
    const { store, session } = await this.requireSession(sessionId);
    const index = session.items.findIndex((item) => item.id === itemId);
    if (index < 0) throw publicError("item_not_found", 404, "Item nao encontrado nesta comanda");
    const current = session.items[index];
    session.items[index] = {
      id: current.id,
      ...(await this.normalizeItem({ ...current, ...input, productId: current.productId }))
    };
    session.finalized = null;
    this.touch(session);
    await this.writeStore(store);
    return { ok: true, ...(await this.calculate(session.items)) };
  }

  async removeItem(sessionId, itemId) {
    const { store, session } = await this.requireSession(sessionId);
    const before = session.items.length;
    session.items = session.items.filter((item) => item.id !== itemId);
    if (session.items.length === before) throw publicError("item_not_found", 404, "Item nao encontrado nesta comanda");
    session.finalized = null;
    this.touch(session);
    await this.writeStore(store);
    return { ok: true, ...(await this.calculate(session.items)) };
  }

  async finalize(sessionId, customer = {}) {
    const { store, session } = await this.requireSession(sessionId);
    if (session.finalized) return { ok: true, duplicate: true, ...session.finalized };
    const calculated = await this.calculate(session.items);
    if (!calculated.items.length) throw publicError("empty_cart", 400, "A comanda esta vazia");

    const order = buildMesaOrder({
      eventId: `xeriffe-public-${session.id}`,
      customer: {
        name: cleanText(customer.name, 100),
        phone: cleanText(customer.phone, 30)
      },
      items: calculated.items.map((item) => ({
        productId: item.productId,
        qty: item.quantity,
        addons: item.addons.map((addon) => addon.id),
        serveMode: "Levar",
        note: item.note
      })),
      notes: cleanText(customer.note, 500),
      total: calculated.total
    });
    order.source = "xeriffe-public-menu";
    order.channel = "samBah";
    order.order.type = "public_menu";

    const entry = await this.mesaService.enqueueOrder(order);
    const sent = await this.mesaService.sendOrderToMesa(entry);
    const result = sent.ok
      ? { status: "accepted", message: "Pedido aceito pelo Mesa", requiresHuman: false, orderId: sent.entry?.id || entry.id }
      : { status: "pending", message: "Comanda registrada e aguardando atendimento humano", requiresHuman: true, orderId: sent.entry?.id || entry.id };
    session.finalized = result;
    session.items = [];
    this.touch(session);
    await this.writeStore(store);
    return { ok: true, duplicate: false, ...result };
  }

  async normalizeItem(input) {
    const quantity = Math.trunc(Number(input.quantity ?? input.qty ?? 1));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw publicError("invalid_quantity", 400, "Quantidade invalida");
    }
    const cache = await this.menuService.getMenuCache();
    const product = (cache.items || []).find((item) => String(item.productId || item.id) === String(input.productId || ""));
    if (!product || product.available === false || product.availability?.available === false) {
      throw publicError("product_unavailable", 400, "Produto invalido ou indisponivel");
    }
    const requested = [...new Set(Array.isArray(input.addonIds) ? input.addonIds.map(String) : Array.isArray(input.addons) ? input.addons.map((item) => String(item?.id || item)) : [])];
    const availableAddons = product.addons || [];
    for (const addonId of requested) {
      const addon = availableAddons.find((item) => String(item.id || item.addonId) === addonId);
      if (!addon || addon.available === false || addon.availability?.available === false) {
        throw publicError("invalid_addon", 400, "Adicional invalido ou indisponivel");
      }
    }
    return { productId: String(product.productId || product.id), quantity, addonIds: requested, note: cleanText(input.note, 300) };
  }

  async calculate(rawItems = []) {
    const cache = await this.menuService.getMenuCache();
    const productById = new Map((cache.items || []).map((item) => [String(item.productId || item.id), item]));
    const items = rawItems.map((raw) => {
      const product = productById.get(String(raw.productId));
      if (!product || product.available === false || product.availability?.available === false) {
        throw publicError("product_unavailable", 409, "Um produto da comanda nao esta mais disponivel");
      }
      const addons = (raw.addonIds || []).map((addonId) => {
        const addon = (product.addons || []).find((item) => String(item.id || item.addonId) === String(addonId));
        if (!addon || addon.available === false || addon.availability?.available === false) {
          throw publicError("invalid_addon", 409, "Um adicional da comanda nao esta mais disponivel");
        }
        return { id: String(addon.id || addon.addonId), name: addon.name || addon.nome || "", price: cents(addon.price ?? addon.preco) / 100 };
      });
      const unitPriceCents = cents(product.price ?? product.preco) + addons.reduce((sum, addon) => sum + cents(addon.price), 0);
      const totalCents = unitPriceCents * raw.quantity;
      return {
        id: raw.id,
        productId: String(product.productId || product.id),
        code: String(product.productId || product.id),
        name: product.name || product.nome || "",
        imageUrl: product.imageUrl || "",
        quantity: raw.quantity,
        basePrice: cents(product.price ?? product.preco) / 100,
        addons,
        note: raw.note || "",
        unitPrice: unitPriceCents / 100,
        total: totalCents / 100,
        compositeCode: [String(product.productId || product.id), ...addons.map((addon) => addon.id)].join("-")
      };
    });
    return {
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      total: items.reduce((sum, item) => sum + cents(item.total), 0) / 100
    };
  }

  async requireSession(sessionId) {
    const store = await this.readStore();
    this.prune(store);
    const session = store.sessions.find((item) => item.id === sessionId);
    if (!session) throw publicError("invalid_session", 401, "Sessao da comanda expirada");
    return { store, session };
  }

  touch(session) {
    const now = this.now();
    session.updatedAt = new Date(now).toISOString();
    session.expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  }

  prune(store) {
    const now = this.now();
    store.sessions = (store.sessions || []).filter((session) => Date.parse(session.expiresAt) > now);
  }

  async readStore() {
    try {
      const parsed = JSON.parse(await readFile(this.sessionsFile, "utf8"));
      return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return { sessions: [] };
    }
  }

  async writeStore(store) {
    await mkdir(dirname(this.sessionsFile), { recursive: true });
    await writeFile(this.sessionsFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }
}

function publicProduct(item) {
  return {
    id: String(item.productId || item.id),
    code: String(item.productId || item.id),
    name: item.name || item.nome || "",
    category: item.category || item.categoria || "Outros",
    description: item.description || item.descricao || "",
    price: cents(item.price ?? item.preco) / 100,
    imageUrl: item.imageUrl || "",
    addons: (item.addons || [])
      .filter((addon) => addon.available !== false && addon.availability?.available !== false)
      .map((addon) => ({ id: String(addon.id || addon.addonId), code: String(addon.id || addon.addonId), name: addon.name || addon.nome || "", price: cents(addon.price ?? addon.preco) / 100 }))
  };
}

function cents(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function publicError(code, statusCode, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
