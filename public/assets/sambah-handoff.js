const state = { status: "", items: [] };
const list = document.querySelector("#handoffList");
const count = document.querySelector("#handoffCount");
const refresh = document.querySelector("#refreshHandoffs");
const filters = [...document.querySelectorAll(".filter")];

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Falha na requisicao");
  return data;
}

async function patchJson(url, body) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "Falha na requisicao");
  return data;
}

async function load() {
  const query = state.status ? `?status=${encodeURIComponent(state.status)}` : "";
  try {
    const data = await getJson(`/api/sambah-handoff${query}`);
    state.items = data.items || [];
    count.textContent = `${state.items.length} atendimentos`;
    render();
  } catch (error) {
    count.textContent = error.message;
  }
}

function render() {
  if (!state.items.length) {
    list.innerHTML = '<div class="empty-state">Nenhum atendimento encontrado.</div>';
    return;
  }
  list.replaceChildren(...state.items.map(renderItem));
}

function renderItem(item) {
  const card = document.createElement("article");
  card.className = "handoff-card";

  const main = document.createElement("div");
  main.className = "handoff-main";
  main.append(
    field(item.name || "Cliente sem nome", "Nome", true),
    field(item.phone || "-", "Telefone"),
    chip(item.status || "-"),
    field(formatDate(item.createdAt), "Data")
  );

  const summary = document.createElement("div");
  summary.className = "summary";
  summary.textContent = item.summaryText || "Sem resumo.";

  const messages = document.createElement("div");
  messages.className = "messages";
  const recent = Array.isArray(item.recentMessages) ? item.recentMessages : [];
  messages.append(...recent.slice(-5).map((message) => {
    const line = document.createElement("div");
    line.className = "message-line";
    line.textContent = `${message.direction || "-"}: ${message.text || ""}`;
    return line;
  }));

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(actionButton("Assumir atendimento", "em_atendimento", item.id), actionButton("Marcar resolvido", "resolvido", item.id));

  card.append(main, summary);
  if (recent.length) card.append(messages);
  card.append(actions);
  return card;
}

function field(value, meta, strong = false) {
  const wrap = document.createElement("div");
  const valueEl = document.createElement(strong ? "strong" : "span");
  valueEl.textContent = value;
  const metaEl = document.createElement("div");
  metaEl.className = "meta";
  metaEl.textContent = meta;
  wrap.append(valueEl, metaEl);
  return wrap;
}

function chip(value) {
  const span = document.createElement("span");
  span.className = "chip";
  span.textContent = value;
  return span;
}

function actionButton(label, status, id) {
  const button = document.createElement("button");
  button.className = status === "em_atendimento" ? "action-button primary" : "action-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", async () => {
    await patchJson(`/api/sambah-handoff/${encodeURIComponent(id)}/status`, { status });
    await load();
  });
  return button;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

filters.forEach((button) => {
  button.addEventListener("click", () => {
    state.status = button.dataset.status || "";
    filters.forEach((item) => item.classList.toggle("active", item === button));
    load();
  });
});

refresh.addEventListener("click", load);
load();
