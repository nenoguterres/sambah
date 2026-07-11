const customerState = {
  name: "",
  phone: "",
  eventDate: "",
  eventTime: "",
  location: "",
  people: "",
  service: "",
  message: "",
  serviceType: "",
  payment: "",
  address: "",
  selectedFlow: "",
  eventType: "",
  drink: ""
};

const preOrderState = {
  status: "rascunho",
  items: [],
  missing: [],
  operation: "",
  payload: null,
  backendResult: null,
  sending: false
};

const WHATSAPP_NUMBERS = {
  general: "5551980413745",
  kazuko: "5551997920292"
};

// Trocar pelo numero oficial do SamBah quando definido.
const SAMBAH_WHATSAPP_NUMBER = WHATSAPP_NUMBERS.general || "55XXXXXXXXXXX";

const WHATSAPP_MESSAGE_TEMPLATES = {
  foodtruck: `Buenas, SamBah!
Quero agendar o Insano para um evento.

Nome:
WhatsApp:
Data:
Local:
Tipo de evento:
Quantidade de pessoas:
Interesse: Food Truck / Beer Truck
Observações:

Pode me ajudar a organizar?`,
  order: `Buenas, SamBah!
Quero fazer um pedido no Insano.

Pedido:
Nome:
WhatsApp:
Retirada, entrega ou local:
Forma de pagamento:
Observações:

Pode organizar minha comanda?`,
  reservation: `Buenas, SamBah!
Quero fazer um pedido no Buteco Xeriffe.

Pedido:
Nome:
WhatsApp:
Retirada, entrega ou local:
Forma de pagamento:
Observações:

Pode organizar minha comanda?`,
  human: `Buenas, SamBah!
Preciso de atendimento da equipe.`
};

const paths = {
  order: {
    title: "Pedidos Insano",
    kicker: "Pedido pelo WhatsApp",
    submit: "Organizar pedido",
    prompt: "Monte tua comanda. O SamBah organiza e te acompanha pelo WhatsApp.",
    operation: "Insano",
    preOrder: true,
    fields: [
      { name: "message", label: "Pedido", type: "textarea", placeholder: "Ex: 2 kachurrasco sem cebola, 1 espetinho de carne e uma coca", full: true, required: true }
    ],
    source: "site"
  },
  foodtruck: {
    title: "Agendar Food Truck ou Beer Truck Insano",
    kicker: "Evento pelo WhatsApp",
    submit: "Continuar atendimento no WhatsApp",
    source: "site"
  },
  reservation: {
    title: "Pedidos Buteco Xeriffe",
    kicker: "Xeriffe pelo WhatsApp",
    submit: "Organizar pedido",
    prompt: "Monte tua comanda. O SamBah organiza e te acompanha pelo WhatsApp.",
    operation: "Buteco Xeriffe",
    preOrder: true,
    editTitle: "Alterar dados do Xeriffe",
    fields: [
      { name: "message", label: "Pedido", type: "textarea", placeholder: "Ex: 2 kachurrasco sem cebola, 1 espetinho de carne e uma coca", full: true, required: true }
    ],
    source: "site"
  },
  human: {
    title: "Falar Watts/ATENDIMENTO",
    kicker: "Atendimento pelo WhatsApp",
    submit: "Abrir conversa com o SamBah",
    prompt: "Me diz em uma frase o que tu precisa. Depois de enviar, o atendimento continua pelo WhatsApp.",
    fields: [
      { name: "message", label: "Mensagem", type: "textarea", placeholder: "Ex: quero falar com o Neno, tirar uma duvida ou pedir atendimento", full: true, required: true }
    ],
    source: "site"
  }
};

const foodtruckServices = {
  food_truck_insano: {
    title: "Agendar Food Truck Insano",
    label: "Food Truck Insano",
    eventType: "food_truck",
    summary: "Lanches, espetinhos, burgers e operacao gastronomica.",
    fields: [
      { name: "name", label: "Nome", type: "text", placeholder: "Teu nome" },
      { name: "phone", label: "WhatsApp", type: "tel", placeholder: "(51) 99999-9999" },
      { name: "date", label: "Data do evento", type: "date" },
      { name: "place", label: "Local", type: "text", placeholder: "Cidade, bairro ou endereco" },
      { name: "people", label: "Numero de pessoas", type: "number", placeholder: "Ex: 80" },
      { name: "eventType", label: "Tipo de evento", type: "text", placeholder: "Empresa, feira, festa, aniversario" },
      { name: "message", label: "Mensagem", type: "textarea", placeholder: "Me conta o que tu ja sabe do evento", full: true }
    ]
  },
  beer_truck_insano: {
    title: "Agendar Beer Truck Insano",
    label: "Beer Truck Insano",
    eventType: "beer_truck",
    summary: "Chope, bebidas e atendimento de bar para evento.",
    fields: [
      { name: "name", label: "Nome", type: "text", placeholder: "Teu nome" },
      { name: "phone", label: "WhatsApp", type: "tel", placeholder: "(51) 99999-9999" },
      { name: "date", label: "Data do evento", type: "date" },
      { name: "place", label: "Local", type: "text", placeholder: "Cidade, bairro ou endereco" },
      { name: "people", label: "Numero de pessoas", type: "number", placeholder: "Ex: 80" },
      { name: "eventType", label: "Tipo de evento", type: "text", placeholder: "Empresa, feira, festa, aniversario" },
      { name: "drink", label: "Bebida desejada", type: "select", options: ["Chope", "Cerveja", "Drinks simples", "Agua e refrigerante", "A definir"] },
      { name: "message", label: "Mensagem", type: "textarea", placeholder: "Me conta o que tu ja sabe do evento", full: true }
    ]
  }
};

const cards = document.querySelectorAll(".path-card");
const panel = document.querySelector("#entryFormPanel");
const form = document.querySelector("#entryForm");
const formTitle = document.querySelector("#formTitle");
const formKicker = document.querySelector("#formKicker");
const fieldGrid = document.querySelector("#fieldGrid");
const serviceChoiceGrid = document.querySelector("#serviceChoiceGrid");
const quickConfirmCard = document.querySelector("#quickConfirmCard");
const result = document.querySelector("#entryResult");
const changePathBtn = document.querySelector("#changePathBtn");
const submitButton = document.querySelector("#submitButton");
const capbahStage = document.querySelector("#capbahStage");
const capbahOfficial = document.querySelector(".capbah-official");
const topWhatsAppButton = document.querySelector(".whatsapp-button");
const commercialForm = document.querySelector("#commercialForm");
const commercialResult = document.querySelector("#commercialResult");
let activePath = null;
let activeService = null;
let activeMode = null;

if (topWhatsAppButton) {
  topWhatsAppButton.href = buildDirectWhatsAppUrl("neno");
  topWhatsAppButton.target = "_blank";
  topWhatsAppButton.rel = "noopener noreferrer";
}

cards.forEach((card) => {
  card.addEventListener("click", () => selectPath(card.dataset.path));
});

document.querySelectorAll("[data-path-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    selectPath(link.dataset.pathLink);
  });
});

document.querySelectorAll("[data-interest-shortcut]").forEach((link) => {
  link.addEventListener("click", () => {
    const select = commercialForm?.querySelector("[name='interesse']");
    if (select) select.value = link.dataset.interestShortcut;
  });
});

changePathBtn.addEventListener("click", () => {
  resetPanel();
  document.querySelector("#caminhos").scrollIntoView({ behavior: "smooth", block: "start" });
});

serviceChoiceGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-service]");
  if (!button) return;
  activeService = button.dataset.service;
  customerState.service = activeService;
  customerState.selectedFlow = "foodtruck";
  showEventConfirm();
});

quickConfirmCard.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-confirm-action]")?.dataset.confirmAction;
  if (!action) return;
  if (activeMode === "pre-order-review") {
    if (action === "confirm") await confirmPreOrderData();
    if (action === "edit") showSimpleFlow(activePath);
    if (action === "back") resetPanel();
    return;
  }
  if (action === "confirm") await sendCurrentFlow();
  if (action === "edit") showEditForm();
  if (action === "back") {
    if (activePath === "foodtruck") showFoodtruckChoices();
    else resetPanel();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activePath) return;
  updateCustomerState(Object.fromEntries(new FormData(form).entries()));
  if (paths[activePath]?.preOrder) {
    organizePreOrder();
    return;
  }
  await sendCurrentFlow();
});

commercialForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendCommercialLead();
});

function selectPath(path) {
  activePath = path;
  activeService = path === "foodtruck" ? customerState.service : null;
  activeMode = null;
  customerState.selectedFlow = path;
  if (path === "human") {
    customerState.service = "";
    customerState.message = "";
  }
  cards.forEach((card) => card.classList.toggle("active", card.dataset.path === path));
  panel.hidden = false;
  result.textContent = "";

  if (path === "foodtruck") {
    activeService ? showEventConfirm() : showFoodtruckChoices();
  } else if (path === "human") {
    showHumanDirectOptions();
  } else {
    showSimpleFlow(path);
  }

  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showFoodtruckChoices() {
  activePath = "foodtruck";
  activeMode = "choice";
  formTitle.textContent = "O que tu quer levar para o evento?";
  formKicker.textContent = "Agenda Insano";
  hideFormAndConfirm();
  serviceChoiceGrid.hidden = false;
  serviceChoiceGrid.innerHTML = Object.entries(foodtruckServices).map(([id, service]) => `
    <button class="service-choice-card" type="button" data-service="${id}">
      <strong>${escapeHtml(service.label)}</strong>
      <small>${escapeHtml(service.summary)}</small>
      <em>Depois eu sigo contigo pelo WhatsApp.</em>
    </button>
  `).join("");
}

function showEventConfirm() {
  activeMode = "confirm";
  const service = foodtruckServices[activeService];
  formTitle.textContent = "Confere os dados do teu evento";
  formKicker.textContent = service?.label || "Agenda Insano";
  serviceChoiceGrid.hidden = true;
  form.hidden = true;
  fieldGrid.innerHTML = "";
  quickConfirmCard.hidden = false;
  quickConfirmCard.innerHTML = renderConfirmCard({
    text: "Me passa os dados do evento que eu organizo pra equipe te responder direito pelo WhatsApp.",
    rows: [
      ["Servico", service?.label || "nao informado"],
      ["Nome", customerState.name || "nao informado"],
      ["WhatsApp", customerState.phone || "nao informado"],
      ["Data", customerState.eventDate || "a definir"],
      ["Local", customerState.location || "a definir"],
      ["Pessoas", customerState.people || "a definir"]
    ],
    confirm: "Continuar atendimento no WhatsApp",
    edit: "Alterar dados"
  });
}

function showReservationConfirm() {
  activeMode = "confirm";
  formTitle.textContent = "Confere teu pedido/solicitacao para o Xeriffe";
  formKicker.textContent = paths.reservation.kicker;
  serviceChoiceGrid.hidden = true;
  form.hidden = true;
  fieldGrid.innerHTML = "";
  quickConfirmCard.hidden = false;
  quickConfirmCard.innerHTML = renderConfirmCard({
    text: "Monte tua comanda. O SamBah organiza e te acompanha pelo WhatsApp.",
    rows: [
      ["Nome", customerState.name || "nao informado"],
      ["WhatsApp", customerState.phone || "nao informado"],
      ["Data", customerState.eventDate || "hoje ou a definir"],
      ["Horario", customerState.eventTime || "a definir"],
      ["Pessoas", customerState.people || "a definir"],
      ["Mensagem", customerState.message || "nao informada"]
    ],
    confirm: "Continuar atendimento no WhatsApp",
    edit: "Alterar dados"
  });
}

function showSimpleFlow(path) {
  activeMode = "simple";
  const config = paths[path];
  formTitle.textContent = config.title;
  formKicker.textContent = config.kicker;
  serviceChoiceGrid.hidden = true;
  quickConfirmCard.hidden = true;
  quickConfirmCard.innerHTML = "";
  form.hidden = false;
  submitButton.textContent = config.submit;
  fieldGrid.innerHTML = `
    <p class="form-prompt full">${escapeHtml(config.prompt)}</p>
    <p class="whatsapp-note full">Depois de enviar, o atendimento continua pelo WhatsApp.</p>
    ${renderQuickReplies(config.quickReplies)}
    ${config.fields.map(renderField).join("")}
  `;
  hydrateFormFromState();
}

function organizePreOrder() {
  activeMode = "pre-order-review";
  const config = paths[activePath];
  preOrderState.operation = config.operation;
  preOrderState.items = parseOrderText(customerState.message);
  preOrderState.missing = validatePreOrder();
  preOrderState.status = preOrderState.missing.length ? "aguardando_dados" : "pronto_para_confirmar";
  preOrderState.payload = buildPreOrderPayload();
  formTitle.textContent = "Pré-comanda SamBah";
  formKicker.textContent = config.operation;
  form.hidden = true;
  serviceChoiceGrid.hidden = true;
  quickConfirmCard.hidden = false;
  quickConfirmCard.innerHTML = renderPreOrderCard();
  result.textContent = "Entendi tua comanda assim. Confere comigo antes de seguir.";
}

async function confirmPreOrderData() {
  const fields = quickConfirmCard.querySelectorAll("[data-preorder-field]");
  const data = {};
  fields.forEach((field) => {
    data[field.name] = field.value;
  });
  updateCustomerState(data);
  preOrderState.missing = validatePreOrder();
  preOrderState.status = preOrderState.missing.length ? "aguardando_dados" : "confirmado_pelo_cliente";
  preOrderState.payload = buildPreOrderPayload();
  preOrderState.backendResult = null;
  if (!preOrderState.missing.length) {
    preOrderState.sending = true;
    quickConfirmCard.innerHTML = renderPreOrderCard();
    result.textContent = "Enviando pré-comanda para a equipe...";
    preOrderState.backendResult = await sendPreOrderToBackend();
    preOrderState.sending = false;
  }
  quickConfirmCard.innerHTML = renderPreOrderCard();
  result.textContent = preOrderState.missing.length
    ? "Pra deixar redondo, falta só completar os dados marcados."
    : preOrderState.backendResult?.responseText || "Pré-comanda enviada para a equipe. Agora o SamBah continua contigo pelo WhatsApp.";
}

function renderPreOrderCard() {
  const statusText = {
    rascunho: "Rascunho",
    aguardando_dados: "Faltam dados",
    pronto_para_confirmar: "Pronto para confirmar",
    confirmado_pelo_cliente: "Confirmado"
  }[preOrderState.status] || "Rascunho";
  const hasItems = preOrderState.items.length > 0;
  const canContinue = preOrderState.status === "confirmado_pelo_cliente" && !preOrderState.missing.length;
  const backendText = preOrderState.backendResult?.responseText || "";
  const missingMarkup = preOrderState.missing.length
    ? `<ul class="preorder-missing-list">${preOrderState.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="preorder-ok">Dados completos. O SamBah organiza e a equipe confirma.</p>`;

  return `
    <div class="preorder-card">
      <div class="preorder-heading">
        <div>
          <p>PRÉ-COMANDA SAMBAH</p>
          <h3>Entendi tua comanda assim:</h3>
        </div>
        <strong>${escapeHtml(statusText)}</strong>
      </div>

      <div class="preorder-meta">
        <div><span>Origem</span><strong>SamBah</strong></div>
        <div><span>Canal</span><strong>Site</strong></div>
        <div><span>Marca/Operação</span><strong>${escapeHtml(preOrderState.operation)}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(statusText)}</strong></div>
      </div>

      <div class="preorder-items">
        <h4>Pedido</h4>
        ${hasItems ? `<ul>${preOrderState.items.map(renderPreOrderItem).join("")}</ul>` : `<p>Nenhum item entendido ainda.</p>`}
      </div>

      <div class="preorder-missing">
        <h4>Pra deixar redondo, falta só:</h4>
        ${missingMarkup}
      </div>

      ${backendText ? `<p class="preorder-status-message">${escapeHtml(backendText)}</p>` : ""}

      <div class="preorder-fields">
        ${renderPreOrderField("name", "Nome", "text", "Teu nome")}
        ${renderPreOrderField("phone", "WhatsApp", "tel", "(51) 99999-9999")}
        ${renderPreOrderField("serviceType", "Tipo de atendimento", "select", "", ["retirada", "entrega", "consumir no local"])}
        ${renderPreOrderField("payment", "Forma de pagamento", "select", "", ["Pix", "cartão", "dinheiro", "a combinar"])}
        ${renderPreOrderField("address", "Endereço", "text", "Obrigatório somente para entrega")}
      </div>

      <div class="confirm-actions">
        <button class="confirm-button" type="button" data-confirm-action="confirm"${preOrderState.sending ? " disabled" : ""}>${preOrderState.sending ? "Enviando..." : "Confirmar dados"}</button>
        <button class="edit-button" type="button" data-confirm-action="edit">Editar pré-comanda</button>
        ${canContinue
          ? `<a class="whatsapp-action-button" href="${escapeHtml(buildPreOrderWhatsAppUrl())}" target="_blank" rel="noopener noreferrer">Continuar atendimento no WhatsApp</a>`
          : `<button class="back-button" type="button" disabled>Continuar atendimento no WhatsApp</button>`}
      </div>
      <p class="whatsapp-note">O atendimento continua pelo WhatsApp. O SamBah organiza e a equipe confirma.</p>
    </div>
  `;
}

function renderPreOrderItem(item) {
  return `
    <li>
      <strong>${escapeHtml(item.quantity)}x ${escapeHtml(item.product)}</strong>
      ${item.note ? `<span>Obs: ${escapeHtml(item.note)}</span>` : ""}
      ${item.needsHumanConfirmation ? `<em>item para confirmação humana</em>` : ""}
    </li>
  `;
}

function renderPreOrderField(name, label, type, placeholder = "", options = []) {
  const value = customerState[name] || "";
  if (type === "select") {
    return `
      <label>
        ${escapeHtml(label)}
        <select name="${escapeHtml(name)}" data-preorder-field>
          <option value="">Selecionar</option>
          ${options.map((option) => `<option value="${escapeHtml(option)}"${value === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }
  return `
    <label>
      ${escapeHtml(label)}
      <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" data-preorder-field>
    </label>
  `;
}

function parseOrderText(text = "") {
  return String(text)
    .split(/\s*,\s*|\s+e\s+/i)
    .map((chunk) => parseOrderChunk(chunk))
    .filter(Boolean);
}

function parseOrderChunk(chunk = "") {
  const original = chunk.trim();
  if (!original) return null;
  const normalized = normalizeText(original);
  const quantityMatch = normalized.match(/^(\d+|uma|um|duas|dois)\s+/);
  const quantity = quantityMatch ? quantityFromText(quantityMatch[1]) : 1;
  const rest = quantityMatch ? normalized.slice(quantityMatch[0].length).trim() : normalized;
  const noteMatch = rest.match(/\b(sem\s+.+|com\s+.+|no ponto|bem passado|mal passado)$/);
  const note = noteMatch ? noteMatch[1].trim() : "";
  const productText = note ? rest.slice(0, noteMatch.index).trim() : rest;
  const product = canonicalProductName(productText);
  return {
    quantity,
    product: product.name,
    note,
    original,
    needsHumanConfirmation: product.needsHumanConfirmation
  };
}

function quantityFromText(value) {
  const map = { um: 1, uma: 1, dois: 2, duas: 2 };
  return map[value] || Number(value) || 1;
}

function canonicalProductName(value = "") {
  const normalized = normalizeText(value);
  const rules = [
    { match: ["kachurrasco", "cachurrasco", "ka churrasco"], name: "Kachurrasco" },
    { match: ["espetinho de carne", "espeto de carne", "espetinho carne", "espetinho"], name: "Espetinho de Carne" },
    { match: ["coca", "coca cola", "coca-cola", "refrigerante coca"], name: "Coca-Cola" }
  ];
  const found = rules.find((rule) => rule.match.some((term) => normalized.includes(term)));
  if (found) return { name: found.name, needsHumanConfirmation: false };
  return { name: value.trim() || "item para confirmação humana", needsHumanConfirmation: true };
}

function validatePreOrder() {
  const missing = [];
  if (!customerState.name.trim()) missing.push("nome do cliente");
  if (!customerState.phone.trim()) missing.push("WhatsApp");
  if (!customerState.serviceType.trim()) missing.push("retirada, entrega ou consumir no local");
  if (!customerState.payment.trim()) missing.push("forma de pagamento");
  if (customerState.serviceType === "entrega" && !customerState.address.trim()) missing.push("endereço de entrega");
  if (!preOrderState.items.length) missing.push("pelo menos 1 item");
  return missing;
}

function buildPreOrderPayload() {
  return {
    origin: "SamBah",
    channel: "Site",
    operation: preOrderState.operation,
    status: preOrderState.status,
    customer: {
      name: customerState.name,
      phone: customerState.phone
    },
    serviceType: customerState.serviceType,
    payment: customerState.payment,
    address: customerState.address,
    items: preOrderState.items.map((item) => ({
      quantity: item.quantity,
      product: item.product,
      note: item.note,
      needsHumanConfirmation: item.needsHumanConfirmation
    })),
    missing: preOrderState.missing
  };
}

async function sendPreOrderToBackend() {
  const payload = buildPreOrderBackendPayload();
  try {
    const response = await fetch("/webhook/site", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!body.ok) {
      return {
        ok: false,
        responseText: "Recebi tua pré-comanda. A equipe vai confirmar pelo WhatsApp.",
        error: body.error || "pre_order_not_accepted"
      };
    }
    return body;
  } catch (error) {
    return {
      ok: false,
      responseText: "O sistema de pedidos está em conferência. Recebi tua pré-comanda e a equipe vai confirmar pelo WhatsApp.",
      error: error.message
    };
  }
}

function buildPreOrderBackendPayload() {
  return {
    eventId: `sambah_${Date.now()}`,
    source: "site",
    channel: "sambah",
    origin: "SamBah",
    operation: preOrderState.operation,
    type: "pre_order",
    customer: {
      name: customerState.name,
      phone: customerState.phone,
      serviceType: normalizeServiceType(customerState.serviceType),
      paymentMethod: normalizePaymentMethod(customerState.payment),
      address: customerState.address
    },
    items: preOrderState.items.map((item) => ({
      quantity: item.quantity,
      name: item.product,
      note: item.note
    })),
    notes: "",
    status: "confirmed_by_customer"
  };
}

function normalizeServiceType(value = "") {
  if (value === "consumir no local") return "local";
  return value;
}

function normalizePaymentMethod(value = "") {
  const normalized = normalizeText(value);
  if (normalized === "cartao") return "cartao";
  if (normalized === "a combinar") return "a_combinar";
  return normalized || value;
}

function buildPreOrderWhatsAppUrl() {
  return `https://wa.me/${SAMBAH_WHATSAPP_NUMBER}?text=${encodeURIComponent(buildPreOrderWhatsAppMessage())}`;
}

function buildPreOrderWhatsAppMessage() {
  const items = preOrderState.items.map((item) => {
    const note = item.note ? `\n  Obs: ${item.note}` : "";
    return `- ${item.quantity}x ${item.product}${note}`;
  }).join("\n");
  return `Buenas, SamBah!
Quero confirmar esta pré-comanda.

Operação: ${preOrderState.operation}
Cliente: ${customerState.name}
WhatsApp: ${customerState.phone}
Tipo: ${customerState.serviceType}
Pagamento: ${customerState.payment}
${customerState.serviceType === "entrega" ? `Endereço: ${customerState.address}\n` : ""}
Pedido:
${items}

A equipe vai confirmar contigo pelo WhatsApp.
Pode confirmar pra mim?`;
}

function showHumanDirectOptions() {
  activeMode = "direct-whatsapp";
  formTitle.textContent = paths.human.title;
  formKicker.textContent = "Atendimento direto";
  serviceChoiceGrid.hidden = true;
  serviceChoiceGrid.innerHTML = "";
  form.hidden = true;
  fieldGrid.innerHTML = "";
  result.textContent = "";
  quickConfirmCard.hidden = false;
  quickConfirmCard.innerHTML = `
    <h3>Abrir conversa com o SamBah</h3>
    <p>O atendimento principal acontece pelo WhatsApp. Escolhe abaixo e eu ja deixo a mensagem pronta.</p>
    <div class="confirm-actions human-direct-actions">
      <a class="whatsapp-action-button" href="${escapeHtml(buildDirectWhatsAppUrl("neno"))}" target="_blank" rel="noopener noreferrer">Abrir conversa com o SamBah</a>
      <a class="whatsapp-action-button" href="${escapeHtml(buildDirectWhatsAppUrl("kazuko"))}" target="_blank" rel="noopener noreferrer">Falar com Kazuko</a>
      <button class="back-button" type="button" data-confirm-action="back">Voltar aos caminhos</button>
    </div>
  `;
}

fieldGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick-message]");
  if (!button) return;
  customerState.message = button.dataset.quickMessage;
  setValue("message", customerState.message);
});

function showEditForm() {
  activeMode = "edit";
  const config = paths[activePath];
  const service = activePath === "foodtruck" ? foodtruckServices[activeService] : null;
  formTitle.textContent = service?.title || config.editTitle || config.title;
  formKicker.textContent = activePath === "foodtruck" ? config.kicker : config.kicker;
  serviceChoiceGrid.hidden = true;
  quickConfirmCard.hidden = true;
  quickConfirmCard.innerHTML = "";
  form.hidden = false;
  submitButton.textContent = config.submit;
  fieldGrid.innerHTML = `
    <p class="whatsapp-note full">Depois de enviar, o atendimento continua pelo WhatsApp.</p>
    ${(service?.fields || config.fields).map(renderField).join("")}
  `;
  hydrateFormFromState();
}

function renderConfirmCard({ text, rows, confirm, edit }) {
  return `
    <p>${escapeHtml(text)}</p>
    <div class="confirm-summary">
      ${rows.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `).join("")}
    </div>
    <div class="confirm-actions">
      <button class="confirm-button" type="button" data-confirm-action="confirm">${escapeHtml(confirm)}</button>
      <button class="edit-button" type="button" data-confirm-action="edit">${escapeHtml(edit)}</button>
      <button class="back-button" type="button" data-confirm-action="back">Voltar</button>
    </div>
  `;
}

function renderQuickReplies(replies = []) {
  if (!replies.length) return "";
  return `
    <div class="quick-replies full">
      ${replies.map((reply) => `<button type="button" data-quick-message="${escapeHtml(reply)}">${escapeHtml(reply)}</button>`).join("")}
    </div>
  `;
}

async function sendCurrentFlow() {
  if (!activePath) return;
  const payload = buildPayload();
  submitButton.disabled = true;
  result.textContent = "Recebendo...";
  try {
    const response = await fetch("/webhook/site", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (activePath === "human") {
      showHumanWhatsAppConfirmation();
    } else {
      showWhatsAppContinuation(body);
    }
    if (form.hidden === false) form.reset();
  } catch {
    result.textContent = "Nao consegui enviar agora. Tenta de novo em instantes.";
  } finally {
    submitButton.disabled = false;
  }
}

async function sendCommercialLead() {
  if (!commercialForm) return;
  const data = Object.fromEntries(new FormData(commercialForm).entries());
  const message = buildCommercialWhatsAppMessage(data);
  const payload = {
    nome: data.nome || "",
    whatsapp: data.whatsapp || "",
    origem: "site",
    canal: "site",
    interesse: mapCommercialInterest(data.interesse),
    pipeline: mapCommercialPipeline(data.interesse),
    data: data.data || "",
    local: data.local || "",
    quantidade_pessoas: data.pessoas || "",
    message,
    observacoes: data.observacao || ""
  };
  commercialResult.textContent = "Salvando no SamBah CRM...";
  let whatsappUrl = `https://wa.me/${SAMBAH_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  try {
    const response = await fetch("/api/crm/atendimento", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (body.whatsappUrl) whatsappUrl = body.whatsappUrl;
    commercialResult.innerHTML = `Recebi teu pedido comercial. <a href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener">Continuar no WhatsApp</a>`;
  } catch {
    commercialResult.innerHTML = `Quanto mais dados tu passar, mais rapido vem o orcamento. <a href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener">Continuar no WhatsApp</a>`;
  }
}

function buildCommercialWhatsAppMessage(data = {}) {
  return `Buenas, SamBah!
Quero informacoes sobre: ${data.interesse || ""}
Nome: ${data.nome || ""}
WhatsApp: ${data.whatsapp || ""}
Data: ${data.data || ""}
Local: ${data.local || ""}
Numero de pessoas: ${data.pessoas || ""}
Observacao: ${data.observacao || ""}

Pode me ajudar a organizar?`;
}

function mapCommercialInterest(value = "") {
  const text = normalizeCommercialText(value);
  if (text.includes("pedido") || text.includes("cardapio")) return "pedido";
  if (text.includes("xeriffe")) return "evento";
  if (text.includes("corporativo") || text.includes("empresa")) return "orcamento";
  if (text.includes("food")) return "food_truck";
  return "outro";
}

function mapCommercialPipeline(value = "") {
  const text = normalizeCommercialText(value);
  if (text.includes("pedido") || text.includes("cardapio")) return "pedido_rapido";
  if (text.includes("xeriffe")) return "festa_xeriffe";
  if (text.includes("corporativo") || text.includes("empresa")) return "orcamento_corporativo";
  if (text.includes("food")) return "food_truck_evento";
  return "atendimento_humano";
}

function normalizeCommercialText(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function showWhatsAppContinuation(body = {}) {
  const config = paths[activePath];
  const title = activePath === "foodtruck"
    ? "Evento recebido pelo SamBah"
    : activePath === "reservation"
    ? "Pedido do Xeriffe recebido"
    : "Pedido recebido pelo SamBah";
  form.hidden = true;
  fieldGrid.innerHTML = "";
  serviceChoiceGrid.hidden = true;
  quickConfirmCard.hidden = false;
  quickConfirmCard.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(responseMessage(body))}<br>O atendimento continua pelo WhatsApp.</p>
    <div class="confirm-actions">
      <a class="whatsapp-action-button" href="${escapeHtml(buildFlowWhatsAppUrl(activePath))}" target="_blank" rel="noopener noreferrer">Continuar atendimento no WhatsApp</a>
      <button class="edit-button" type="button" data-confirm-action="edit">Alterar dados</button>
      <button class="back-button" type="button" data-confirm-action="back">Voltar aos caminhos</button>
    </div>
  `;
  result.textContent = config?.title ? `${config.title}: pronto para seguir no WhatsApp.` : "Pronto para seguir no WhatsApp.";
}

function showHumanWhatsAppConfirmation() {
  const route = detectHumanResponsible(customerState.message);
  form.hidden = true;
  fieldGrid.innerHTML = "";
  serviceChoiceGrid.hidden = true;
  quickConfirmCard.hidden = false;
  quickConfirmCard.innerHTML = `
    <h3>${escapeHtml(route.title)}</h3>
    <p>${escapeHtml(route.line1)}<br>${escapeHtml(route.line2)}</p>
    <div class="confirm-actions">
      <a class="whatsapp-action-button" href="${escapeHtml(buildWhatsAppUrl(route))}" target="_blank" rel="noopener noreferrer">${escapeHtml(route.button)}</a>
      <button class="back-button" type="button" data-confirm-action="back">Voltar aos caminhos</button>
    </div>
  `;
  result.textContent = "";
}

function detectHumanResponsible(message = "") {
  const normalized = normalizeText(message);
  const kazukoTerms = ["kazuko", "kasuko", "kazuca", "dona kazuko", "falar com a kazuko", "quero a kazuko"];
  const isKazuko = kazukoTerms.some((term) => normalized.includes(term));
  if (isKazuko) {
    return {
      responsible: "Kazuko",
      number: WHATSAPP_NUMBERS.kazuko,
      title: "Atendimento para Kazuko",
      line1: "Recebi tua mensagem.",
      line2: "O atendimento continua pelo WhatsApp da Kazuko.",
      button: "Falar com Kazuko no WhatsApp"
    };
  }
  return {
    responsible: "Atendimento",
    number: WHATSAPP_NUMBERS.general,
    title: "Atendimento encaminhado",
    line1: "Recebi tua mensagem.",
    line2: "O SamBah segue contigo pelo WhatsApp até a equipe finalizar.",
    button: "Abrir conversa com o SamBah"
  };
}

function buildFlowWhatsAppUrl(path = activePath) {
  return `https://wa.me/${SAMBAH_WHATSAPP_NUMBER}?text=${encodeURIComponent(buildFlowWhatsAppMessage(path))}`;
}

function buildFlowWhatsAppMessage(path = activePath) {
  if (path === "foodtruck") {
    const service = foodtruckServices[activeService];
    return `Buenas, SamBah!
Quero agendar o Insano para um evento.

Nome: ${customerState.name || ""}
WhatsApp: ${customerState.phone || ""}
Data: ${customerState.eventDate || ""}
Local: ${customerState.location || ""}
Tipo de evento: ${customerState.eventType || ""}
Quantidade de pessoas: ${customerState.people || ""}
Interesse: ${service?.label || "Food Truck / Beer Truck"}
Observações: ${customerState.message || ""}

Pode me ajudar a organizar?`;
  }

  if (path === "order") {
    return `Buenas, SamBah!
Quero fazer um pedido no Insano.

Pedido: ${customerState.message || ""}
Nome: ${customerState.name || ""}
WhatsApp: ${customerState.phone || ""}
Retirada, entrega ou local: ${customerState.location || ""}
Forma de pagamento:
Observações:

Pode organizar minha comanda?`;
  }

  if (path === "reservation") {
    return `Buenas, SamBah!
Quero fazer um pedido no Buteco Xeriffe.

Pedido: ${customerState.message || customerState.eventType || ""}
Nome: ${customerState.name || ""}
WhatsApp: ${customerState.phone || ""}
Retirada, entrega ou local: ${customerState.location || ""}
Forma de pagamento:
Observações:

Pode organizar minha comanda?`;
  }

  return WHATSAPP_MESSAGE_TEMPLATES.human;
}

function buildWhatsAppUrl(route = detectHumanResponsible(customerState.message)) {
  const message = customerState.message?.trim();
  const text = route.responsible === "Kazuko"
    ? message
      ? `Buenas, SamBah!
Preciso de atendimento da equipe.

Quero falar com a Kazuko.
Mensagem: ${message}`
      : `Buenas, SamBah!
Preciso de atendimento da equipe.

Quero falar com a Kazuko.`
    : message
    ? `Buenas, SamBah!
Preciso de atendimento da equipe.

Mensagem: ${message}`
    : WHATSAPP_MESSAGE_TEMPLATES.human;
  return `https://wa.me/${route.number}?text=${encodeURIComponent(text)}`;
}

function buildDirectWhatsAppUrl(target) {
  const route = target === "kazuko"
    ? {
        number: WHATSAPP_NUMBERS.kazuko,
        text: `Buenas, SamBah!
Preciso de atendimento da equipe.

Quero falar com a Kazuko.`
      }
    : {
        number: SAMBAH_WHATSAPP_NUMBER,
        text: WHATSAPP_MESSAGE_TEMPLATES.human
      };
  return `https://wa.me/${route.number}?text=${encodeURIComponent(route.text)}`;
}

function buildPayload() {
  const service = activePath === "foodtruck" ? foodtruckServices[activeService] : null;
  const event = service
    ? {
        type: service.eventType,
        service: activeService,
        date: customerState.eventDate,
        location: customerState.location,
        people: customerState.people,
        notes: customerState.message
      }
    : activePath === "reservation"
    ? {
        type: "reservation",
        date: customerState.eventDate,
        time: customerState.eventTime,
        location: customerState.location,
        people: customerState.people,
        service: "Xeriffe Obirici",
        notes: customerState.message
      }
    : undefined;
  return {
    eventId: `site-${Date.now()}`,
    source: "site",
    customer: {
      name: customerState.name || "",
      phone: customerState.phone || ""
    },
    name: customerState.name || "",
    phone: customerState.phone || "",
    message: buildMessage(),
    formType: activePath,
    selectedFlow: activePath,
    service: activeService || undefined,
    event,
    formData: {
      name: customerState.name,
      phone: customerState.phone,
      date: customerState.eventDate,
      time: customerState.eventTime,
      place: customerState.location,
      people: customerState.people,
      eventType: customerState.eventType,
      drink: customerState.drink,
      message: customerState.message
    }
  };
}

function buildMessage() {
  if (activePath === "order") return customerState.message || "pedido a definir";
  if (activePath === "human") return `atendimento humano ${customerState.message || "a definir"}`;
  if (activePath === "reservation") {
    return `reserva no Xeriffe data ${customerState.eventDate || "a definir"} horario ${customerState.eventTime || "a definir"} pessoas ${customerState.people || "a definir"} solicitacao ${customerState.message || customerState.eventType || "a definir"}`;
  }
  const service = foodtruckServices[activeService];
  const drink = customerState.drink ? ` bebida ${customerState.drink}` : "";
  return `${service?.title || "evento Insano"} data ${customerState.eventDate || "a definir"} local ${customerState.location || "a definir"} pessoas ${customerState.people || "a definir"} tipo ${customerState.eventType || "a definir"}${drink}. ${customerState.message || "Solicitacao de evento a definir"}`;
}

function responseMessage(body) {
  if (activePath === "order" && !customerState.phone) return "Recebi teu pedido. Agora abre o WhatsApp pra fechar nome, entrega e pagamento.";
  if (activePath === "human" && !customerState.phone) return "Recebi. Agora chama no WhatsApp pra equipe seguir contigo.";
  if (["foodtruck", "reservation"].includes(activePath) && !customerState.phone) return "Recebi. Se faltar algo, a equipe ajusta contigo pelo WhatsApp.";
  return body.responseText || "Recebido. O SamBah segue contigo pelo WhatsApp.";
}

function updateCustomerState(data) {
  if (data.name !== undefined) customerState.name = data.name;
  if (data.phone !== undefined) customerState.phone = data.phone;
  if (data.date !== undefined) customerState.eventDate = data.date;
  if (data.time !== undefined) customerState.eventTime = data.time;
  if (data.place !== undefined) customerState.location = data.place;
  if (data.location !== undefined) customerState.location = data.location;
  if (data.people !== undefined) customerState.people = data.people;
  if (data.eventType !== undefined) customerState.eventType = data.eventType;
  if (data.drink !== undefined) customerState.drink = data.drink;
  if (data.message !== undefined) customerState.message = data.message;
  if (data.serviceType !== undefined) customerState.serviceType = data.serviceType;
  if (data.payment !== undefined) customerState.payment = data.payment;
  if (data.address !== undefined) customerState.address = data.address;
  customerState.selectedFlow = activePath || customerState.selectedFlow;
  if (activeService) customerState.service = activeService;
}

function hydrateFormFromState() {
  setValue("name", customerState.name);
  setValue("phone", customerState.phone);
  setValue("date", customerState.eventDate);
  setValue("time", customerState.eventTime);
  setValue("place", customerState.location);
  setValue("people", customerState.people);
  setValue("eventType", customerState.eventType);
  setValue("drink", customerState.drink);
  setValue("message", customerState.message);
  setValue("serviceType", customerState.serviceType);
  setValue("payment", customerState.payment);
  setValue("address", customerState.address);
}

function setValue(name, value) {
  const field = form.elements[name];
  if (field && value) field.value = value;
}

function resetPanel() {
  panel.hidden = true;
  activePath = null;
  activeService = null;
  activeMode = null;
  preOrderState.status = "rascunho";
  preOrderState.items = [];
  preOrderState.missing = [];
  preOrderState.operation = "";
  preOrderState.payload = null;
  customerState.selectedFlow = "";
  customerState.service = "";
  customerState.message = "";
  cards.forEach((card) => card.classList.remove("active"));
  serviceChoiceGrid.hidden = true;
  serviceChoiceGrid.innerHTML = "";
  quickConfirmCard.hidden = true;
  quickConfirmCard.innerHTML = "";
  form.hidden = false;
  fieldGrid.innerHTML = "";
  result.textContent = "";
}

function hideFormAndConfirm() {
  form.hidden = true;
  quickConfirmCard.hidden = true;
  quickConfirmCard.innerHTML = "";
}

function renderField(field) {
  const classes = field.full ? " class=\"full\"" : "";
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
  const required = field.required ? " required" : "";
  const input = field.type === "select"
    ? `<select name="${field.name}"${required}>${field.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select>`
    : field.type === "textarea"
    ? `<textarea name="${field.name}"${placeholder}${required}></textarea>`
    : `<input name="${field.name}" type="${field.type}"${placeholder}${required}>`;
  return `
    <label${classes}>
      ${escapeHtml(field.label)}
      ${input}
    </label>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prepareOfficialCapbah() {
  if (!capbahStage || !capbahOfficial) return;
  if (capbahOfficial.complete && capbahOfficial.naturalWidth === 0) {
    capbahOfficial.remove();
    return;
  }
  capbahOfficial.addEventListener("error", () => {
    capbahOfficial.remove();
  }, { once: true });
}

prepareOfficialCapbah();

async function openExternalWhatsApp(url) {
  const shell = window.electron?.shell || window.electronAPI?.shell || window.SamBahElectron?.shell;
  if (shell?.openExternal) return shell.openExternal(url);
  window.open(url, "_blank", "noopener,noreferrer");
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href*='wa.me']");
  if (!link) return;
  event.preventDefault();
  openExternalWhatsApp(link.href);
});
