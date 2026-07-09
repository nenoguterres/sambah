import { isEventFlowActive, isEventIntent, processEventFlow } from "./eventFlow.js";
import { buildSambahHumanSupportMessage, buildSambahInitialMessage } from "./sambahPersonality.js";

const FLOW_TTL_MS = 30 * 60 * 1000;

export function handleActiveFlow({ conversation = {}, text = "", intent = "", now = new Date() } = {}) {
  const hasActiveFlow = Boolean(conversation.activeFlow);
  const globalCommand = detectGlobalFlowCommand(text);
  const safeConversation = sanitizeFlowConversation(conversation);
  if (globalCommand && hasActiveFlow) {
    if (globalCommand === "continue") {
      const continued = processEventFlow({ conversation: safeConversation, text: "", intent, now });
      if (!continued) return { ...handleGlobalFlowCommand("reset"), globalCommand };
      return {
        ...continued,
        globalCommand
      };
    }
    const commandResult = handleGlobalFlowCommand(globalCommand);
    if (commandResult && !commandResult.clearFlow) {
      commandResult.patch = {
        ...(commandResult.patch || {}),
        flowData: safeConversation.flowData || {}
      };
    }
    return { ...commandResult, globalCommand };
  }
  if (hasActiveFlow && isFlowExpired(safeConversation, now)) {
    return {
      patch: {
        flowData: safeConversation.flowData || {},
        flowUpdatedAt: now.toISOString()
      },
      responseText: "Tu quer continuar o orçamento antigo ou começar de novo?\n\nContinuar orçamento\nVoltar ao início\nAtendimento humano",
      globalCommand: "ttl_expired"
    };
  }
  if (isEventFlowActive(safeConversation) || isEventIntent(intent)) {
    return {
      ...processEventFlow({ conversation: safeConversation, text, intent, now }),
      globalCommand
    };
  }
  return null;
}

export function clearActiveFlowPatch() {
  return {
    activeFlow: "",
    activeStep: "",
    flowData: {},
    flowUpdatedAt: "",
    eventDraft: null,
    eventBudgetDraft: null,
    eventFlowDraft: null,
    budgetDraft: null
  };
}

export function detectGlobalFlowCommand(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (["cancelar", "cancela", "voltar", "voltar ao inicio", "inicio", "iniciar", "comecar", "reset", "reiniciar", "zerar atendimento", "limpar conversa"].includes(normalized)) return "reset";
  if (["menu", "menu principal"].includes(normalized)) return "menu";
  if (["humano", "atendente", "falar com atendente", "falar com humano", "atendimento humano"].includes(normalized)) return "human";
  if (["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite"].includes(normalized)) return "greeting";
  if (["continuar orcamento", "continuar orçamento"].includes(normalized)) return "continue";
  return "";
}

function handleGlobalFlowCommand(command) {
  if (command === "reset" || command === "menu") {
    return {
      clearFlow: true,
      responseText: buildSambahInitialMessage()
    };
  }
  if (command === "human") {
    return {
      clearFlow: true,
      responseText: buildSambahHumanSupportMessage(),
      status: "humano"
    };
  }
  if (command === "greeting") {
    return {
      responseText: `Tu quer continuar o orçamento em andamento ou voltar ao início?

Continuar orçamento
Voltar ao início
Atendimento humano`
    };
  }
  return null;
}

function sanitizeFlowConversation(conversation = {}) {
  const flowData = conversation.flowData && typeof conversation.flowData === "object" && !Array.isArray(conversation.flowData)
    ? { ...conversation.flowData }
    : {};
  const people = Number(flowData.people);
  if (Number.isFinite(people) && people >= 1900 && people <= 2100) {
    delete flowData.people;
  }
  return { ...conversation, flowData };
}

function isFlowExpired(conversation = {}, now = new Date()) {
  if (!conversation.flowUpdatedAt) return false;
  const updatedAt = Date.parse(conversation.flowUpdatedAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(updatedAt) || !Number.isFinite(current)) return false;
  return current - updatedAt > FLOW_TTL_MS;
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
