const EVENT_REQUIRED_SLOTS = ["date", "city", "time", "people"];
const FLOW_TTL_MS = 30 * 60 * 1000;

const EVENT_SLOT_LABELS = {
  date: "data",
  city: "local/cidade",
  time: "horario",
  people: "quantidade de pessoas",
  eventType: "tipo de evento"
};

export function resolveConversationFlow({ conversation = {}, text = "", intent = "", mode = "AUTO", now = new Date().toISOString() } = {}) {
  const normalized = normalizeText(text);
  const currentFlow = normalizeActiveFlow(conversation.activeFlow);

  if (mode !== "AUTO") {
    return { handled: false, activeFlow: currentFlow, reply: "", nextAction: conversation.nextAction || "" };
  }

  if (currentFlow?.type === "evento") {
    if (isExpiredFlow(currentFlow, now)) {
      return {
        handled: true,
        activeFlow: currentFlow,
        nextAction: conversation.nextAction || "",
        reply: "Tu quer continuar o orçamento anterior ou começar de novo?\n\n1. Continuar orçamento anterior\n2. Começar novo atendimento\n3. Falar com humano"
      };
    }
    return resolveEventFlowContinuation({ flow: currentFlow, text, normalized, now });
  }

  if (intent === "evento") {
    return startEventFlow({ text, normalized, now });
  }

  return { handled: false, activeFlow: currentFlow, reply: "", nextAction: conversation.nextAction || "" };
}

export function extractEventSlots(text = "") {
  const raw = String(text || "").trim();
  const normalized = normalizeText(raw);
  const slots = {};

  const date = raw.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);
  if (date) slots.date = date[0];

  const time = raw.match(/\b(?:as|às)?\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)\b/i);
  if (time) {
    slots.time = time[2] ? `${time[1]}:${time[2]}` : `${time[1]}h${time[3] || ""}`;
  }

  const peopleMatches = [...normalized.matchAll(/\b(\d{1,5})\s*(?:pessoas|pessoa|convidados|convidado|pax)?\b/g)];
  for (const match of peopleMatches) {
    const number = Number(match[1]);
    if (Number.isFinite(number) && number > 0 && !isLikelyYear(number) && !looksLikeDateOrTimeNumber(raw, match[1])) {
      slots.people = String(number);
    }
  }

  const city = extractCity(raw, normalized);
  if (city) slots.city = city;

  const eventType = extractEventType(raw, normalized);
  if (eventType) slots.eventType = eventType;

  return slots;
}

function startEventFlow({ text = "", normalized = "", now = "" } = {}) {
  if (isCancel(normalized)) {
    return cancelEventFlow();
  }
  const slots = extractEventSlots(text);
  const activeFlow = buildEventFlow({ slots, now });
  return buildEventFlowResponse(activeFlow, { started: true });
}

function resolveEventFlowContinuation({ flow = {}, text = "", normalized = "", now = "" } = {}) {
  if (isCancel(normalized)) {
    return cancelEventFlow();
  }
  if (flow.status === "ready") {
    return {
      handled: true,
      activeFlow: {
        ...flow,
        updatedAt: now
      },
      nextAction: "create_event_lead",
      reply: "Recebi esse complemento do evento. Vou manter tudo junto no atendimento para a equipe seguir contigo."
    };
  }
  const slots = { ...(flow.slots || {}), ...extractEventSlots(text) };
  const activeFlow = buildEventFlow({ slots, now, previous: flow });
  return buildEventFlowResponse(activeFlow);
}

function buildEventFlow({ slots = {}, now = "", previous = null } = {}) {
  const mergedSlots = {
    date: slots.date || null,
    city: slots.city || null,
    time: slots.time || null,
    people: slots.people || null,
    eventType: slots.eventType || null
  };
  const missing = missingEventSlots(mergedSlots);
  return {
    ...(previous || {}),
    type: "evento",
    status: missing.length ? "collecting" : "ready",
    slots: mergedSlots,
    updatedAt: now
  };
}

function buildEventFlowResponse(activeFlow = {}, { started = false } = {}) {
  const missing = missingEventSlots(activeFlow.slots || {});
  if (!missing.length) {
    return {
      handled: true,
      activeFlow,
      nextAction: "create_event_lead",
      reply: `${eventSummary(activeFlow.slots, "Show, Recebi os dados iniciais e ja anotei:")}\n\nFechado, vivente. Ja tenho as informacoes principais do teu evento. Vou deixar isso encaminhado para nossa equipe comercial te retornar.`
    };
  }
  return {
    handled: true,
    activeFlow,
    nextAction: "",
    reply: started
      ? `Show. Para orcamento de evento, me passa ${formatMissingSlots(missing)}.`
      : `${eventSummary(activeFlow.slots, "Show, ja anotei o que tu mandou:")}\n\nAgora me passa ${formatMissingSlots(missing)}.`
  };
}

function cancelEventFlow() {
  return {
    handled: true,
    activeFlow: null,
    nextAction: "",
    reply: "Feito! Cancelei esse atendimento de evento. Me diz, o que tu precisa agora?"
  };
}

function normalizeActiveFlow(flow = null) {
  if (!flow || typeof flow !== "object") return null;
  if (flow.type !== "evento") return flow;
  return {
    type: "evento",
    status: flow.status || "collecting",
    slots: {
      date: flow.slots?.date || null,
      city: flow.slots?.city || null,
      time: flow.slots?.time || null,
      people: normalizePeopleSlot(flow.slots?.people),
      eventType: flow.slots?.eventType || null
    },
    updatedAt: flow.updatedAt || ""
  };
}

function normalizePeopleSlot(value) {
  const number = Number(value);
  if (Number.isFinite(number) && isLikelyYear(number)) return null;
  return value || null;
}

function missingEventSlots(slots = {}) {
  return EVENT_REQUIRED_SLOTS.filter((slot) => !slots[slot]);
}

function formatMissingSlots(missing = []) {
  const labels = missing.map((slot) => EVENT_SLOT_LABELS[slot] || slot);
  if (labels.length <= 1) return labels[0] || "os dados do evento";
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}

function eventSummary(slots = {}, title = "Show, ja anotei:") {
  const lines = [title];
  if (slots.date) lines.push(`Data: ${slots.date}`);
  if (slots.city) lines.push(`Cidade: ${slots.city}`);
  if (slots.time) lines.push(`Horario: ${slots.time}`);
  if (slots.people) lines.push(`Pessoas: ${slots.people}`);
  if (slots.eventType) lines.push(`Tipo: ${slots.eventType}`);
  return lines.join("\n");
}

function extractCity(raw = "", normalized = "") {
  if (normalized.includes("porto alegre") || /\bpoa\b/.test(normalized)) return "Porto Alegre";
  const parts = raw.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.find((part) => {
    const value = normalizeText(part);
    if (!value || /\d{1,2}[/-]\d{1,2}/.test(value) || /\b\d{1,2}(?::\d{2}|h\d{0,2})\b/.test(value)) return false;
    if (/\b\d{1,5}\s*(pessoas|pessoa|convidados|convidado|pax)?\b/.test(value)) return false;
    if (["evento", "orcamento", "festa"].includes(value)) return false;
    return /[a-z]{3,}/.test(value);
  });
  return candidate || "";
}

function extractEventType(raw = "", normalized = "") {
  const types = ["casamento", "aniversario", "corporativo", "formatura", "festa", "evento teste"];
  const found = types.find((type) => normalized.includes(type));
  if (!found || found === "festa") return found || "";
  return raw.match(new RegExp(found, "i"))?.[0] || found;
}

function looksLikeDateOrTimeNumber(raw = "", value = "") {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}[/-]`).test(raw) || new RegExp(`\\b${escaped}(?::|h)`).test(raw);
}

function isLikelyYear(number) {
  return number >= 1900 && number <= 2100;
}

function isExpiredFlow(flow = {}, nowIso = "") {
  const updatedAt = Date.parse(flow.updatedAt || "");
  const now = Date.parse(nowIso || "");
  if (!Number.isFinite(updatedAt) || !Number.isFinite(now)) return false;
  return now - updatedAt > FLOW_TTL_MS;
}

function isCancel(normalized = "") {
  return ["cancelar", "cancela", "desistir", "deixa pra depois"].some((term) => normalized.includes(term));
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
