import { isEventFlowActive, isEventIntent, processEventFlow } from "./eventFlow.js";
import { buildSambahHumanSupportMessage, buildSambahInitialMessage } from "./sambahPersonality.js";

export function handleActiveFlow({ conversation = {}, text = "", intent = "", now = new Date() } = {}) {
  const globalCommand = detectGlobalFlowCommand(text);
  if (globalCommand && isEventFlowActive(conversation)) {
    return handleGlobalFlowCommand(globalCommand);
  }
  if (isEventFlowActive(conversation) || isEventIntent(intent)) {
    return processEventFlow({ conversation, text, intent, now });
  }
  return null;
}

export function clearActiveFlowPatch() {
  return {
    activeFlow: "",
    activeStep: "",
    flowData: {},
    flowUpdatedAt: ""
  };
}

export function detectGlobalFlowCommand(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (["cancelar", "cancela", "voltar", "voltar ao inicio", "inicio", "iniciar", "comecar"].includes(normalized)) return "reset";
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

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
