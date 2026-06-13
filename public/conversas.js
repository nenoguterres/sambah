const GROUPS = [
  ["precisa", "Precisa responder agora"],
  ["em_atendimento", "Em atendimento"],
  ["aguardando_cliente", "Aguardando cliente"],
  ["humano", "Humano"],
  ["resolvido", "Resolvido"]
];

const columns = document.querySelector("#columns");

loadConversas();

async function loadConversas() {
  columns.innerHTML = "<p class=\"empty\">Carregando conversas...</p>";
  try {
    const response = await fetch("/api/conversas");
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Erro ao carregar");
    render(data.items || []);
  } catch (error) {
    columns.innerHTML = `<p class="empty">${escapeHtml(error.message || "Nao foi possivel carregar conversas.")}</p>`;
  }
}

function render(items) {
  columns.innerHTML = "";
  for (const [key, title] of GROUPS) {
    const groupItems = items.filter((item) => groupFor(item) === key);
    const column = document.createElement("section");
    column.className = "column";
    column.innerHTML = `<h2>${title}</h2><div class="cards"></div>`;
    const cards = column.querySelector(".cards");
    if (!groupItems.length) {
      cards.innerHTML = "<p class=\"empty\">Sem conversas.</p>";
    } else {
      groupItems.forEach((item) => cards.appendChild(card(item)));
    }
    columns.appendChild(column);
  }
}

function card(item) {
  const element = document.createElement("article");
  element.className = "card";
  const text = item.transcricao || item.audio?.transcricao || item.ultimaMensagem || "";
  element.innerHTML = `
    <strong>${escapeHtml(item.nome || "Cliente WhatsApp")}</strong>
    <div class="meta">${escapeHtml(item.telefone || "")}</div>
    <div class="meta">${escapeHtml(text)}</div>
    <span class="tag">${escapeHtml(item.intencao || "desconhecido")}</span>
    <span class="tag">${escapeHtml(item.prioridade || "normal")}</span>
    <span class="tag">${escapeHtml(item.status || "novo")}</span>
    <div class="suggestion">${escapeHtml(item.respostaSugerida || "")}</div>
    <div class="actions">
      <button type="button" data-copy>Copiar resposta</button>
      ${item.whatsappUrl ? `<a class="button whatsapp" href="${item.whatsappUrl}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>` : ""}
      <button type="button" data-human>Marcar humano</button>
      <button type="button" data-resolved>Resolvido</button>
    </div>
  `;
  element.querySelector("[data-copy]")?.addEventListener("click", () => navigator.clipboard.writeText(item.respostaSugerida || ""));
  element.querySelector("[data-human]")?.addEventListener("click", () => postAction(item.id, "humano"));
  element.querySelector("[data-resolved]")?.addEventListener("click", () => postAction(item.id, "resolvido"));
  return element;
}

async function postAction(id, action) {
  await fetch(`/api/conversas/${encodeURIComponent(id)}/${action}`, { method: "POST" });
  await loadConversas();
}

function groupFor(item) {
  if (item.status === "resolvido") return "resolvido";
  if (item.status === "humano") return "humano";
  if (item.status === "aguardando_cliente") return "aguardando_cliente";
  if (["alta", "risco_de_perda", "media", "atencao"].includes(item.prioridade)) return "precisa";
  return "em_atendimento";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}
