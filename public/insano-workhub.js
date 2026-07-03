const state = { tasks: [], summary: null, sourceModule: "", targetModule: "", status: "", search: "" };
const STATUSES = [
  { id: "pending", label: "Pendentes" },
  { id: "in_progress", label: "Em andamento" },
  { id: "blocked", label: "Bloqueadas" },
  { id: "completed", label: "Concluídas" }
];
const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  $("#refreshTasks").addEventListener("click", loadWorkhub);
  $("#toggleTaskForm").addEventListener("click", () => toggleComposer(true));
  $("#closeTaskForm").addEventListener("click", () => toggleComposer(false));
  $("#taskForm").addEventListener("submit", createTask);
  $("#sourceFilter").addEventListener("change", (event) => { state.sourceModule = event.target.value; loadTasks(); });
  $("#targetFilter").addEventListener("change", (event) => { state.targetModule = event.target.value; loadTasks(); });
  $("#statusFilter").addEventListener("change", (event) => { state.status = event.target.value; loadTasks(); });
  $("#taskSearch").addEventListener("input", (event) => { state.search = event.target.value.trim().toLowerCase(); renderBoard(); });
  $("#workhubBoard").addEventListener("change", updateTaskStatus);
  loadWorkhub();
});

async function loadWorkhub() {
  setNotice("Atualizando tarefas...");
  try {
    const [summary] = await Promise.all([getJson("/api/insano-workhub/summary"), loadTasks(false)]);
    state.summary = summary;
    renderMetrics();
    renderBoard();
    setNotice(`${state.tasks.length} tarefa(s) na visualização.`);
  } catch (error) {
    setNotice(error.message || "Não foi possível carregar o Workhub.", true);
  }
}

async function loadTasks(render = true) {
  const params = new URLSearchParams();
  if (state.sourceModule) params.set("sourceModule", state.sourceModule);
  if (state.targetModule) params.set("targetModule", state.targetModule);
  if (state.status) params.set("status", state.status);
  const result = await getJson(`/api/insano-workhub/tasks${params.size ? `?${params}` : ""}`);
  state.tasks = result.items || [];
  if (render) {
    renderBoard();
    setNotice(`${state.tasks.length} tarefa(s) na visualização.`);
  }
  return result;
}

async function createTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setFormMessage("Registrando...");
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    const result = await sendJson("/api/insano-workhub/tasks", "POST", body);
    if (!result.ok) throw new Error(result.message || result.error);
    form.reset();
    setFormMessage("Tarefa criada.");
    await loadWorkhub();
  } catch (error) {
    setFormMessage(error.message || "Não foi possível criar a tarefa.", true);
  } finally {
    submit.disabled = false;
  }
}

async function updateTaskStatus(event) {
  const select = event.target.closest("[data-task-status]");
  if (!select) return;
  select.disabled = true;
  try {
    await sendJson(`/api/insano-workhub/tasks/${encodeURIComponent(select.dataset.taskStatus)}`, "PATCH", { status: select.value });
    await loadWorkhub();
  } catch (error) {
    setNotice(error.message || "Não foi possível atualizar a tarefa.", true);
    select.disabled = false;
  }
}

function renderMetrics() {
  const summary = state.summary || {};
  $("#workhubMetrics").innerHTML = [
    metric("Total", summary.total),
    metric("Pendentes", summary.byStatus?.pending),
    metric("Em andamento", summary.byStatus?.in_progress),
    metric("Bloqueadas", summary.byStatus?.blocked, summary.byStatus?.blocked > 0),
    metric("Concluídas", summary.byStatus?.completed),
    metric("Módulo ativo", sourceLabel(summary.mostActiveModule) || "-"),
    metric("Última atividade", formatDate(summary.lastActivityAt))
  ].join("");
}

function renderBoard() {
  const visibleTasks = state.tasks.filter(matchesSearch);
  $("#workhubBoard").innerHTML = STATUSES.map((status) => {
    const items = visibleTasks.filter((task) => task.status === status.id);
    return `<section class="work-column" data-status="${status.id}"><header class="column-head"><h2>${status.label}</h2><span>${items.length}</span></header><div class="column-list">${items.length ? items.map(taskCard).join("") : '<p class="column-empty">Nenhuma tarefa nesta fila.</p>'}</div></section>`;
  }).join("");
}

function taskCard(task) {
  return `<article class="task-card"><div class="task-head"><span class="source-badge ${esc(task.sourceModule)}">${sourceLabel(task.sourceModule)} → ${sourceLabel(task.targetModule)}</span><span class="priority-badge ${esc(task.priority)}">${priorityLabel(task.priority)}</span></div><h3>${esc(task.title)}</h3>${task.description ? `<p class="task-description">${esc(task.description)}</p>` : ""}<footer class="task-footer"><select data-task-status="${esc(task.id)}" aria-label="Status de ${esc(task.title)}">${STATUSES.map((status) => `<option value="${status.id}"${task.status === status.id ? " selected" : ""}>${status.label}</option>`).join("")}</select><time datetime="${esc(task.updatedAt)}">${esc(formatDate(task.updatedAt))}</time></footer></article>`;
}

function matchesSearch(task) {
  if (!state.search) return true;
  return [task.title, task.description, task.sourceModule, task.targetModule].some((value) => String(value || "").toLowerCase().includes(state.search));
}

function metric(label, value, attention = false) {
  return `<article class="metric${attention ? " attention" : ""}"><span>${esc(label)}</span><strong>${esc(value ?? 0)}</strong></article>`;
}

function toggleComposer(open) {
  $("#taskComposer").hidden = !open;
  $("#toggleTaskForm").setAttribute("aria-expanded", String(open));
  if (open) $("#taskForm [name=title]").focus();
}

function setNotice(message, error = false) {
  const notice = $("#workhubNotice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
}

function setFormMessage(message, error = false) {
  const target = $("#taskFormMessage");
  target.textContent = message;
  target.style.color = error ? "var(--danger)" : "";
}

async function getJson(path) {
  const response = await fetch(path);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || "Falha na requisição.");
  return body;
}

async function sendJson(path, method, body) {
  const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || result.error || "Falha na requisição.");
  return result;
}

function sourceLabel(source) { return { mesa: "Mesa", sambah: "SamBah", perola: "Pérola", pay: "Pay", workhub: "WorkHub" }[source] || source; }
function priorityLabel(priority) { return { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" }[priority] || priority; }

function formatDate(value) {
  if (!value) return "Sem atividade";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem atividade";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function esc(value = "") {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
