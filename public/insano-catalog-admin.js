const statusEl = document.querySelector("#catalogStatus");
const listEl = document.querySelector("#productsList");
const formEl = document.querySelector("#catalogForm");
const addButton = document.querySelector("#addProduct");

let products = [];

document.addEventListener("DOMContentLoaded", () => {
  bindActions();
  loadCatalog();
});

function bindActions() {
  addButton.addEventListener("click", () => {
    products.push({ id: `produto-${Date.now()}`, name: "", description: "", imageUrl: "", active: true });
    renderProducts();
  });
  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCatalog();
  });
}

async function loadCatalog() {
  try {
    const response = await fetch("/api/admin/insano/catalogo");
    const body = await response.json();
    if (!response.ok || body.ok === false) throw new Error(body.error || "catalog_load_failed");
    products = body.items || [];
    statusEl.textContent = `${products.length} produtos`;
    renderProducts();
  } catch (error) {
    statusEl.textContent = "Falha ao carregar catalogo";
    listEl.innerHTML = `<div class="panel">${escapeHtml(error.message)}</div>`;
  }
}

function renderProducts() {
  listEl.innerHTML = products.map((item, index) => productCard(item, index)).join("");
  listEl.querySelectorAll("[data-field]").forEach((field) => {
    field.addEventListener("input", () => {
      const index = Number(field.dataset.index);
      const key = field.dataset.field;
      products[index][key] = field.type === "checkbox" ? field.checked : field.value;
      if (key === "imageUrl") updatePreview(index, field.value);
    });
  });
  listEl.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      products.splice(Number(button.dataset.remove), 1);
      renderProducts();
    });
  });
}

function productCard(item, index) {
  return `<article class="product-card">
    ${item.imageUrl ? `<img class="preview" data-preview="${index}" src="${escapeHtml(item.imageUrl)}" alt="">` : `<div class="preview" data-preview="${index}"></div>`}
    <div class="fields">
      <div class="row">
        <label>Nome<input data-index="${index}" data-field="name" value="${escapeHtml(item.name || "")}" placeholder="Produto"></label>
        <label>URL da foto<input data-index="${index}" data-field="imageUrl" value="${escapeHtml(item.imageUrl || "")}" placeholder="https://..."></label>
      </div>
      <label>Descricao<textarea data-index="${index}" data-field="description" placeholder="Descricao curta">${escapeHtml(item.description || "")}</textarea></label>
      <div class="actions">
        <label class="inline-check"><input data-index="${index}" data-field="active" type="checkbox" ${item.active !== false ? "checked" : ""}> Ativo no catalogo</label>
        <button type="button" data-remove="${index}">Remover</button>
      </div>
    </div>
  </article>`;
}

function updatePreview(index, url) {
  const target = listEl.querySelector(`[data-preview="${index}"]`);
  if (!target) return;
  if (!url) {
    target.outerHTML = `<div class="preview" data-preview="${index}"></div>`;
    return;
  }
  if (target.tagName === "IMG") target.src = url;
  else target.outerHTML = `<img class="preview" data-preview="${index}" src="${escapeHtml(url)}" alt="">`;
}

async function saveCatalog() {
  statusEl.textContent = "Salvando catalogo";
  const response = await fetch("/api/admin/insano/catalogo", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: products })
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    statusEl.textContent = body.error || "Falha ao salvar";
    return;
  }
  products = body.items || products;
  statusEl.textContent = "Catalogo salvo";
  renderProducts();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
