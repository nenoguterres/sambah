const GROUPS = [
  ["acaoAgora", "Precisa de acao agora", "is-hot"],
  ["aguardandoCliente", "Aguardando cliente", ""],
  ["riscoPerda", "Risco de perda", ""],
  ["eventosImportantes", "Eventos importantes", ""]
];

const summary = document.querySelector("#summary");
const columns = document.querySelector("#columns");

loadOpportunities();

columns.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    await navigator.clipboard.writeText(copyButton.dataset.copy || "");
    copyButton.textContent = "Copiado";
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  button.disabled = true;
  button.textContent = "Atualizando...";
  const response = await fetch(`/api/oportunidades/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: action === "nota" ? JSON.stringify({ nota: "Atualizado pela Central de Oportunidades" }) : "{}"
  });
  button.textContent = response.ok ? "Atualizado" : "Erro";
  await loadOpportunities();
});

async function loadOpportunities() {
  const response = await fetch("/api/oportunidades");
  const body = await response.json();
  renderSummary(body.groups || {});
  renderColumns(body.groups || {});
}

function renderSummary(groups) {
  summary.innerHTML = GROUPS.map(([key, label]) => `
    <article class="metric">
      <span>${label}</span>
      <strong>${(groups[key] || []).length}</strong>
    </article>
  `).join("");
}

function renderColumns(groups) {
  columns.innerHTML = GROUPS.map(([key, label, className]) => {
    const items = groups[key] || [];
    return `
      <section class="opp-column ${className}">
        <h2>${label}</h2>
        ${items.length ? items.map(renderCard).join("") : `<p class="empty">Nenhuma oportunidade aqui.</p>`}
      </section>
    `;
  }).join("");
}

function renderCard(item) {
  return `
    <article class="opp-card">
      <header>
        <div>
          <h3>${escapeHtml(item.nome)}</h3>
          <p class="meta">${escapeHtml(item.id)}</p>
        </div>
        <span class="pill">${escapeHtml(item.prioridade || "BAIXA")} | ${escapeHtml(item.tempoParado)}</span>
      </header>
      <div class="fields">
        ${field("Telefone", item.telefone)}
        ${field("Operacao", item.operacao)}
        ${field("Origem", item.origem)}
        ${field("Tipo", item.tipo)}
        ${field("Pipeline", item.pipeline)}
        ${field("Alerta", item.alerta)}
        ${field("Ultima interacao", formatDate(item.ultimaInteracao))}
        ${field("Acao sugerida", item.acaoSugerida)}
        ${field("Mensagem sugerida", item.mensagemSugerida)}
      </div>
      <div class="card-actions">
        ${item.whatsappUrl ? `<a href="${escapeAttr(item.whatsappUrl)}" data-whatsapp-url>Chamar no WhatsApp</a>` : ""}
        ${item.mensagemSugerida ? `<button type="button" data-copy="${escapeAttr(item.mensagemSugerida)}">Copiar mensagem</button>` : ""}
        <button type="button" data-action="retornado" data-id="${escapeAttr(item.id)}">Marcar como retornado</button>
        <button type="button" data-action="arquivar" data-id="${escapeAttr(item.id)}">Arquivar oportunidade</button>
      </div>
    </article>
  `;
}

function field(label, value) {
  if (!value) return "";
  return `<p><span>${label}:</span> ${escapeHtml(value)}</p>`;
}

function formatDate(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function openExternalWhatsApp(url) {
  const shell = window.electron?.shell || window.electronAPI?.shell || window.SamBahElectron?.shell;
  if (shell?.openExternal) return shell.openExternal(url);
  window.open(url, "_blank", "noopener,noreferrer");
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-whatsapp-url], a[href*='wa.me']");
  if (!link) return;
  event.preventDefault();
  openExternalWhatsApp(link.href);
});

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}
