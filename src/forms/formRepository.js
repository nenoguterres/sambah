const FORMS = Object.freeze({
  evento: Object.freeze({
    id: "evento",
    version: 1,
    title: "SolicitaÃ§Ã£o de evento",
    destination: "crm_events",
    publicPath: "/evento/insano",
    fields: Object.freeze([
      { name: "nome", label: "Seu nome", type: "text", required: true },
      { name: "telefone", label: "Seu WhatsApp", type: "tel", required: true },
      { name: "dataEvento", label: "Data do evento", type: "date", required: true },
      { name: "cidade", label: "Cidade", type: "text", required: true },
      { name: "local", label: "Local ou endereÃ§o", type: "text", required: true },
      { name: "tipoAmbiente", label: "Tipo de ambiente", type: "select", required: true, options: ["ao_ar_livre", "fechado"] },
      { name: "horarioInicio", label: "HorÃ¡rio de inÃ­cio", type: "time", required: true },
      { name: "horarioTermino", label: "HorÃ¡rio de tÃ©rmino", type: "time", required: false },
      { name: "publicoPrevisto", label: "Quantidade de pessoas", type: "number", required: true, min: 1 },
      { name: "tipoEvento", label: "Tipo de evento", type: "text", required: true },
      { name: "observacoes", label: "ObservaÃ§Ãµes", type: "textarea", required: false }
    ])
  })
});

export function getFormDefinition(id = "") {
  return FORMS[String(id || "").trim().toLowerCase()] || null;
}

export function listFormDefinitions() {
  return Object.values(FORMS);
}

export function buildFormLink(id, { baseUrl = "", conversationId = "", phone = "" } = {}) {
  const form = getFormDefinition(id);
  if (!form) return null;
  const params = new URLSearchParams();
  if (conversationId) params.set("conversationId", conversationId);
  if (phone) params.set("phone", phone);
  return `${String(baseUrl).replace(/\/$/, "")}${form.publicPath}${params.size ? `?${params}` : ""}`;
}
