const EVENT_FLOW = "event";
const EVENT_STEPS = new Set([
  "start",
  "askEventType",
  "askCity",
  "askDate",
  "askTime",
  "askPeople",
  "confirmSummary",
  "handoffHuman"
]);

const MONTHS = new Set([
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
]);

export function isEventFlowActive(conversation = {}) {
  return conversation.activeFlow === EVENT_FLOW && EVENT_STEPS.has(conversation.activeStep);
}

export function isEventIntent(intent = "") {
  return ["evento", "food_truck", "corporativo", "xeriffe", "reserva", "festa"].includes(intent);
}

export function processEventFlow({ conversation = {}, text = "", intent = "", now = new Date() } = {}) {
  const normalized = normalizeText(text);
  const active = isEventFlowActive(conversation);
  if (!active && !isEventIntent(intent)) return null;

  if (active && isCancel(normalized)) {
    return {
      clearFlow: true,
      responseText: "Combinado, cancelei esse atendimento de evento por aqui."
    };
  }

  if (active && conversation.activeStep === "confirmSummary") {
    if (isHandoff(normalized)) {
      return {
        patch: buildPatch({
          flowData: getFlowData(conversation),
          activeStep: "handoffHuman",
          now
        }),
        responseText: "Fechado. Vou chamar atendimento humano para seguir com orçamento.",
        status: "humano"
      };
    }
    if (isChangeRequest(normalized)) {
      return {
        patch: buildPatch({ flowData: {}, activeStep: "askEventType", now }),
        responseText: askEventTypeMessage()
      };
    }
  }

  const currentStep = active ? conversation.activeStep : "askEventType";
  const flowData = {
    ...getFlowData(conversation),
    ...extractEventData(text, { activeStep: currentStep })
  };
  if (!flowData.type && flowData.city && flowData.date && flowData.time && flowData.people) {
    flowData.type = "Evento";
  }
  const activeStep = nextMissingStep(flowData);
  const responseText = activeStep === "confirmSummary"
    ? buildEventSummary(flowData)
    : buildMissingFieldPrompt(activeStep, flowData);

  return {
    patch: buildPatch({ flowData, activeStep, now }),
    responseText
  };
}

export function buildEventSummary(flowData = {}) {
  return `Show, anotei:
Tipo: ${flowData.type || ""}
Cidade: ${flowData.city || ""}
Data: ${flowData.date || ""}
Horário: ${flowData.time || ""}
Pessoas: ${flowData.people || ""}

Quer que eu chame atendimento humano para seguir com orçamento?

Sim, chamar atendimento
Alterar dados
Cancelar`;
}

export function extractEventData(text = "", { activeStep = "" } = {}) {
  const rawText = String(text || "").trim();
  const normalized = normalizeText(rawText);
  if (activeStep === "askDate") {
    return compact({ date: extractDate(rawText, normalized) });
  }
  if (activeStep === "askTime") {
    return compact({ time: extractTime(rawText, normalized) });
  }
  if (activeStep === "askPeople") {
    return compact({ people: extractPeople(rawText, normalized, activeStep) });
  }

  const date = extractDate(rawText, normalized);
  const time = extractTime(rawText, normalized);
  const people = extractPeople(rawText, normalized, activeStep);
  const type = extractEventType(normalized);
  const city = extractCity(rawText, normalized, { date, time, people, type, activeStep });
  return compact({
    type,
    city,
    date,
    time,
    people
  });
}

function buildPatch({ flowData = {}, activeStep = "askEventType", now = new Date() } = {}) {
  return {
    activeFlow: EVENT_FLOW,
    activeStep,
    flowData,
    flowUpdatedAt: now.toISOString()
  };
}

function getFlowData(conversation = {}) {
  return conversation.flowData && typeof conversation.flowData === "object" && !Array.isArray(conversation.flowData)
    ? conversation.flowData
    : {};
}

function nextMissingStep(flowData = {}) {
  if (!flowData.type) return "askEventType";
  if (!flowData.city) return "askCity";
  if (!flowData.date) return "askDate";
  if (!flowData.time) return "askTime";
  if (!flowData.people) return "askPeople";
  return "confirmSummary";
}

function buildMissingFieldPrompt(step, flowData = {}) {
  const partial = buildPartialSummary(flowData);
  const prompt = {
    askEventType: askEventTypeMessage(),
    askCity: "Qual cidade vai ser o evento?",
    askDate: "Agora me passa a data do evento.",
    askTime: "Agora me passa o horario aproximado.",
    askPeople: "Agora me passa a quantidade de pessoas."
  }[step] || askEventTypeMessage();
  return partial ? `${partial}\n\n${prompt}` : prompt;
}

function askEventTypeMessage() {
  return `Show. Que tipo de evento tu quer orcar?

Aniversario
Casamento
Confraternizacao
Evento corporativo
Food truck`;
}

function buildPartialSummary(flowData = {}) {
  const lines = [];
  if (flowData.type) lines.push(`Tipo: ${flowData.type}`);
  if (flowData.city) lines.push(`Cidade: ${flowData.city}`);
  if (flowData.date) lines.push(`Data: ${flowData.date}`);
  if (flowData.time) lines.push(`Horário: ${flowData.time}`);
  if (flowData.people) lines.push(`Pessoas: ${flowData.people}`);
  return lines.length ? `Show, ja anotei o que tu mandou:\n${lines.join("\n")}` : "";
}

function extractEventType(normalized = "") {
  const checks = [
    ["food truck", "Food truck"],
    ["foodtruck", "Food truck"],
    ["casamento", "Casamento"],
    ["aniversario", "Aniversario"],
    ["confraternizacao", "Confraternizacao"],
    ["formatura", "Formatura"],
    ["corporativo", "Evento corporativo"],
    ["empresa", "Evento corporativo"]
  ];
  return checks.find(([term]) => normalized.includes(term))?.[1] || "";
}

function extractDate(rawText = "", normalized = "") {
  const numeric = rawText.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) return numeric[0];

  const monthAlternation = [...MONTHS].join("|");
  const withMonth = rawText.match(new RegExp(`\\b\\d{1,2}\\s+de\\s+(${monthAlternation})(?:\\s+de\\s+\\d{4})?\\b`, "iu"));
  if (withMonth) return withMonth[0];
  return "";
}

function extractTime(rawText = "", normalized = "") {
  const withH = normalized.match(/\b([01]?\d|2[0-3])h(?:[0-5]\d)?\b/);
  if (withH) return withH[0];
  const withColon = rawText.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  return withColon ? withColon[0] : "";
}

function extractPeople(rawText = "", normalized = "", activeStep = "") {
  if (!["askPeople", "askCity", "askEventType"].includes(activeStep)) return null;
  const marked = normalized.match(/\b(\d{1,5})\s*(?:pessoas?|convidados?|pax)\b/);
  if (marked) return Number(marked[1]);
  if (activeStep === "askPeople") {
    const onlyNumber = rawText.trim().match(/^\d{1,5}$/);
    if (onlyNumber) return Number(onlyNumber[0]);
  }
  return null;
}

function extractCity(rawText = "", normalized = "", { date = "", time = "", people = null, type = "", activeStep = "" } = {}) {
  if (activeStep !== "askCity" && !hasLikelyCity(rawText, normalized, { date, time, people })) return "";
  let city = rawText;
  for (const token of [date, time]) {
    if (token) city = city.replace(new RegExp(escapeRegExp(token), "i"), " ");
  }
  city = city
    .replace(/\b\d{1,5}\s*(pessoas?|convidados?|pax)\b/giu, " ")
    .replace(/\b(evento|festa|casamento|aniversario|confraternizacao|formatura|corporativo|food\s*truck|orcamento|orçar|orcar)\b/giu, " ")
    .replace(/\b(de|em|para|no|na)\b/giu, " ")
    .replace(/[,:;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!city || /^\d+$/.test(city)) return "";
  if (type && normalizeText(city) === normalizeText(type)) return "";
  return titleCase(city);
}

function hasLikelyCity(rawText = "", normalized = "", { date = "", time = "", people = null } = {}) {
  if (date && time && people) return true;
  if (/\b(em|para|no|na)\s+[\p{L}]{3,}/iu.test(rawText)) return true;
  if (rawText.includes(",") && /[\p{L}]{3,}/u.test(rawText) && !normalized.includes(" de ")) return true;
  return false;
}

function isCancel(normalized = "") {
  return ["cancelar", "cancela", "cancelado"].includes(normalized);
}

function isHandoff(normalized = "") {
  return normalized.includes("sim") || normalized.includes("chamar atendimento") || normalized.includes("atendimento humano");
}

function isChangeRequest(normalized = "") {
  return normalized.includes("alterar") || normalized.includes("mudar") || normalized.includes("corrigir");
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== null && item !== undefined));
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
