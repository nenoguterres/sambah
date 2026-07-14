const params = new URLSearchParams(location.search);
const correlation = Object.fromEntries(["conversationId", "sambahConversationId", "phone", "origin", "unit", "token"].map((key) => [key, params.get(key) || ""]));
const validSession = /^wa_\d{8,15}$/.test(correlation.conversationId)
  && /^\d{8,15}$/.test(correlation.phone)
  && correlation.conversationId === `wa_${correlation.phone}`
  && Boolean(correlation.sambahConversationId)
  && correlation.origin === "WHATSAPP_SAMBAH"
  && correlation.unit === "XERIFFE_OBIRICI"
  && correlation.token.length >= 24;
const productsElement = document.querySelector("#products");
const categoriesElement = document.querySelector("#categories");
const reviewButton = document.querySelector("#review-order");
const confirmButton = document.querySelector("#confirm-order");
const dialog = document.querySelector("#review-dialog");
const cart = new Map();
let products = [];
let activeCategory = "Todos";

if (!validSession) {
  document.querySelector("#session-status").textContent = "Acesso invalido";
  productsElement.innerHTML = '<div class="error">Abra o cardapio pelo botao recebido na conversa do WhatsApp.</div>';
} else {
  document.querySelector("#session-status").textContent = "Comanda segura";
  loadMenu();
}

async function loadMenu() {
  try {
    const response = await fetch("/api/mesa/cardapio-publico", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("menu_unavailable");
    const payload = await response.json();
    products = payload.items || [];
    renderCategories(payload.categories || []);
    renderProducts();
  } catch {
    productsElement.innerHTML = '<div class="error">Cardapio temporariamente indisponivel.</div>';
  }
}

function renderCategories(categories) {
  categoriesElement.replaceChildren(...["Todos", ...categories].map((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category;
    button.className = category === activeCategory ? "active" : "";
    button.addEventListener("click", () => { activeCategory = category; renderCategories(categories); renderProducts(); });
    return button;
  }));
}

function renderProducts() {
  const visible = activeCategory === "Todos" ? products : products.filter((item) => item.category === activeCategory);
  productsElement.replaceChildren(...visible.map(productCard));
}

function productCard(product) {
  const article = document.createElement("article");
  article.className = "product";
  if (product.imageUrl) {
    const image = document.createElement("img");
    image.src = product.imageUrl;
    image.alt = product.name;
    image.loading = "lazy";
    article.append(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = "✦";
    article.append(placeholder);
  }
  const body = document.createElement("div");
  body.className = "product-body";
  const title = document.createElement("h2"); title.textContent = product.name;
  const description = document.createElement("p"); description.textContent = product.description || product.category;
  const price = document.createElement("div"); price.className = "price"; price.textContent = formatMoney(product.price);
  const addons = document.createElement("div"); addons.className = "addons";
  for (const addon of product.addons || []) {
    const label = document.createElement("label");
    const input = document.createElement("input"); input.type = "checkbox"; input.value = addon.id;
    label.append(input, document.createTextNode(`${addon.name} (+${formatMoney(addon.price)})`)); addons.append(label);
  }
  const row = document.createElement("div"); row.className = "add-row";
  const quantity = document.createElement("input"); quantity.type = "number"; quantity.min = "1"; quantity.max = "20"; quantity.value = "1"; quantity.setAttribute("aria-label", "Quantidade");
  const add = document.createElement("button"); add.type = "button"; add.textContent = "Adicionar";
  add.addEventListener("click", () => addToCart(product, Number(quantity.value), [...addons.querySelectorAll("input:checked")].map((item) => item.value)));
  row.append(quantity, add); body.append(title, description, price, addons, row); article.append(body); return article;
}

function addToCart(product, quantity, addonIds) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
  const key = `${product.id}:${[...addonIds].sort().join(",")}`;
  const previous = cart.get(key);
  cart.set(key, { productId: product.id, name: product.name, quantity: Math.min(20, (previous?.quantity || 0) + quantity), addonIds });
  updateCart();
}

function updateCart() {
  const lines = [...cart.values()];
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  const total = lines.reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId);
    const addonTotal = (product?.addons || []).filter((addon) => line.addonIds.includes(addon.id)).reduce((value, addon) => value + addon.price, 0);
    return sum + ((product?.price || 0) + addonTotal) * line.quantity;
  }, 0);
  document.querySelector("#cart-count").textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  document.querySelector("#cart-total").textContent = formatMoney(total);
  reviewButton.disabled = count === 0;
}

reviewButton.addEventListener("click", () => {
  const lines = [...cart.values()];
  document.querySelector("#review-lines").replaceChildren(...lines.map((line) => {
    const element = document.createElement("div"); element.className = "review-line";
    const product = products.find((item) => item.id === line.productId);
    const addons = (product?.addons || []).filter((addon) => line.addonIds.includes(addon.id));
    const unit = (product?.price || 0) + addons.reduce((sum, addon) => sum + addon.price, 0);
    element.textContent = `${line.quantity}x ${line.name}${addons.length ? ` + ${addons.map((item) => item.name).join(", ")}` : ""}`;
    const value = document.createElement("strong"); value.textContent = formatMoney(unit * line.quantity); element.append(value); return element;
  }));
  document.querySelector("#review-total").textContent = document.querySelector("#cart-total").textContent;
  dialog.showModal();
});

confirmButton.addEventListener("click", async () => {
  confirmButton.disabled = true; confirmButton.textContent = "Confirmando...";
  try {
    const response = await fetch("/api/mesa/comanda-cliente", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...correlation, items: [...cart.values()].map(({ productId, quantity, addonIds }) => ({ productId, quantity, addonIds })) })
    });
    const result = await response.json();
    if (!response.ok || result.payment?.status !== "pending") throw new Error(result.error || "order_failed");
    dialog.innerHTML = `<h2>Comanda confirmada</h2><p>Seu pedido foi registrado. O pagamento permanece pendente e nada foi liberado para producao.</p><p class="review-total">${formatMoney(result.order.total)}</p>`;
    history.replaceState({}, "", "/cardapio/xeriffe");
  } catch {
    confirmButton.disabled = false; confirmButton.textContent = "Tentar novamente";
  }
});

function formatMoney(value) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0)); }
