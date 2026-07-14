import crypto from "node:crypto";

const MAX_LINES = 40;
const MAX_QUANTITY = 20;

export function hashCustomerOrderToken(token = "") {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function matchesCustomerOrderToken(token = "", expectedHash = "") {
  const received = Buffer.from(hashCustomerOrderToken(token), "hex");
  const expected = Buffer.from(String(expectedHash), "hex");
  return received.length === expected.length && expected.length > 0 && crypto.timingSafeEqual(received, expected);
}

export function sanitizePublicMesaMenu(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const publicItems = items
    .filter((item) => item.available !== false && item.availability?.available !== false)
    .map((item) => ({
      id: String(item.productId || item.id || ""),
      name: String(item.name || item.nome || ""),
      category: String(item.category || item.categoria || "Outros"),
      description: String(item.description || item.descricao || ""),
      price: money(item.price ?? item.preco),
      imageUrl: safeMediaUrl(item.imageUrl || item.imagem || item.image),
      addons: (Array.isArray(item.addons) ? item.addons : [])
        .filter((addon) => addon.available !== false && addon.availability?.available !== false)
        .map((addon) => ({
          id: String(addon.id || addon.addonId || addon.name || addon.nome || ""),
          name: String(addon.name || addon.nome || ""),
          price: money(addon.price ?? addon.preco)
        }))
        .filter((addon) => addon.id && addon.name)
    }))
    .filter((item) => item.id && item.name);
  return {
    ok: true,
    source: "mesa-cardapio-cache",
    updatedAt: payload.updatedAt || payload.lastSyncAt || null,
    categories: [...new Set(publicItems.map((item) => item.category).filter(Boolean))],
    items: publicItems
  };
}

export function buildConfirmedCustomerOrder(menuPayload = {}, requestedItems = []) {
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > MAX_LINES) {
    return { ok: false, error: "invalid_order_items" };
  }
  const menu = sanitizePublicMesaMenu(menuPayload);
  const products = new Map(menu.items.map((item) => [item.id, item]));
  const lines = [];
  for (const requested of requestedItems) {
    const product = products.get(String(requested.productId || requested.id || ""));
    const quantity = Number(requested.quantity ?? requested.qty);
    if (!product) return { ok: false, error: "product_unavailable" };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return { ok: false, error: "invalid_quantity" };
    const addonIds = Array.isArray(requested.addonIds) ? requested.addonIds.map(String) : [];
    const addonMap = new Map(product.addons.map((addon) => [addon.id, addon]));
    const addons = [];
    for (const addonId of [...new Set(addonIds)]) {
      const addon = addonMap.get(addonId);
      if (!addon) return { ok: false, error: "addon_unavailable" };
      addons.push(addon);
    }
    const unitPrice = money(product.price + addons.reduce((sum, addon) => sum + addon.price, 0));
    lines.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      total: money(unitPrice * quantity),
      addons
    });
  }
  const total = money(lines.reduce((sum, item) => sum + item.total, 0));
  return { ok: true, order: { items: lines, total, currency: "BRL" } };
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function safeMediaUrl(value = "") {
  const url = String(value || "").trim();
  return /^(https?:\/\/|\/assets\/)/i.test(url) ? url : "";
}
