import { response, responseWithReplies } from "./responseContract.js";
import { portalInsanoContract } from "./portalInsanoContract.js";
import { getRuntimeConfig } from "../../config.js";

export function routePortalInsanoMessage({ state, message, contract = portalInsanoContract }) {
  const text = normalizeText(message.text);
  const routedState = normalizeLegacyFoodtruckState(state, contract);
  if (routedState.mode === "human" || routedState.serviceState === "HUMANO") return humanState(routedState);
  if (isPaymentClaim(text)) return startFlow(routedState, contract, "payment_receipt_review", "paymentSafety");
  if (routedState.activeFlow) return handleActiveFlow(routedState, contract, text, message.text);
  const command = routeNavigationCommand(text);
  if (command) return handleNavigationCommand(routedState, contract, command);
  const currentMenuId = routedState.activeMenu || contract.welcome.menuId;
  const selected = resolveMenuOption(contract.menus[currentMenuId], text);
  if (selected) return executeAction(routedState, contract, selected.action, selected.id);
  if (isWelcome(text)) return openMenu(resetToPortal(routedState, contract), contract, contract.welcome.menuId, "welcomeFlow", []);
  return response("fallbackMenu", routedState, renderMenu(contract.menus[currentMenuId]));
}

export function renderMenu(menu) {
  if (!menu) return "Nao consegui localizar o menu atual. Digita inicio para voltar ao Portal Insano.";
  return `${menu.title}\n${menu.body}\n${menu.fallbackText || menu.options.map((item) => `${item.order}. ${item.title}`).join("\n")}`;
}

export function renderMenuReply(menu) {
  if (!menu) return { type: "text", text: renderMenu(menu) };
  return {
    type: "menu",
    text: renderMenu(menu),
    menu: {
      id: menu.id,
      title: menu.title,
      body: menu.body,
      buttonText: menu.buttonText || menu.title,
      options: menu.options.map((item) => ({
        id: item.id,
        order: item.order,
        title: item.title,
        description: item.description || "",
        fallbackText: `${item.order}. ${item.title}`
      }))
    }
  };
}

export function resolveMenuOption(menu, text) {
  if (!menu) return null;
  const normalized = normalizeText(text);
  if (menu.strictInteractiveIds) {
    return menu.options.find((item) => normalizeText(item.id) === normalized) || null;
  }
  return menu.options.find((item) => {
    return String(item.order) === normalized || normalizeText(item.id) === normalized || normalizeText(item.title) === normalized;
  }) || null;
}

function executeAction(state, contract, action, source) {
  if (action.type === "open_menu") {
    const nextState = {
      ...state,
      areaId: Object.prototype.hasOwnProperty.call(action, "areaId") ? action.areaId : state.areaId,
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      foodtruckSubstate: action.clearFoodtruckSubstate || source === "INSANO_ORCAMENTO" ? null : state.foodtruckSubstate || null
    };
    const stack = action.target === contract.welcome.menuId ? [] : [...(state.menuStack || []), state.activeMenu || contract.welcome.menuId];
    return openMenu({ ...nextState, menuStack: stack }, contract, action.target, source);
  }
  if (action.type === "start_flow") return startFlow(state, contract, action.target, source);
  if (action.type === "open_url_button") return openUrlButton(state, contract, action.target, source);
  if (action.type === "show_catalog") return showCatalog(state, contract, action.target, source);
  if (action.type === "open_authorized_link") return integrationDisabled(state, source);
  return response("invalidAction", state, "Essa funcao ainda nao esta habilitada. Vou encaminhar para atendimento.", [{ type: "safe_handoff" }]);
}

function normalizeLegacyFoodtruckState(state, contract) {
  if (!isLegacyFoodtruckState(state)) return state;
  return {
    ...state,
    areaId: "insano_food_truck",
    activeMenu: "foodtruck_main_menu",
    activeFlow: null,
    activeStep: null,
    awaitingInput: false,
    menuStack: [],
    foodtruckSubstate: null,
    legacyFoodtruckClearedAt: new Date().toISOString()
  };
}

function isLegacyFoodtruckState(state = {}) {
  const legacyMenus = new Set(["foodtruck_services_menu", "foodtruck_event_menu"]);
  const legacyFlows = new Set(["foodtruck_event_request", "foodtruck_quote_request", "foodtruck_request_tracking"]);
  return state.areaId === "insano_food_truck" && (
    legacyMenus.has(state.activeMenu) || legacyFlows.has(state.activeFlow)
  );
}

function openUrlButton(state, contract, target, source) {
  const baseUrl = resolveContractPath(contract, target);
  const url = buildUrlButtonTarget(baseUrl, target, state);
  if (!url) {
    return response("missingCatalogUrl", state, "CONFIGURAÇÃO AUSENTE: integration.insano_food_truck.catalog_url", [{ type: "missing_config", source, target }]);
  }
  if (target === "integration.insano_food_truck.event_form_url") {
    return responseWithReplies(
      source,
      {
        ...state,
        areaId: "insano_food_truck",
        activeFlow: null,
        activeStep: null,
        awaitingInput: false,
        foodtruckSubstate: { selectedAction: source, target: "evento" }
      },
      [{
        type: "url_button",
        text: "Evento — Insano Food Truck\n\nPreenche os dados do teu evento para nossa equipe verificar a agenda e responder nesta mesma conversa.",
        buttonText: "PREENCHER SOLICITAÇÃO",
        url
      }],
      [{ type: "event_form_url_button", source, url }]
    );
  }
  return responseWithReplies(
    source,
    {
      ...state,
      areaId: "insano_food_truck",
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      foodtruckSubstate: { selectedAction: source, target: target === "integration.insano_food_truck.event_form_url" ? "evento" : "catalogo" }
    },
    [{
      type: "url_button",
      text: "Conheça o catálogo de produtos do Insano Food Truck.",
      buttonText: "ABRIR CATÁLOGO",
      url
    }],
    [{ type: "catalog_url_button", source, url }]
  );
}

function openMenu(state, contract, menuId, source, stack = state.menuStack || []) {
  const menu = contract.menus[menuId];
  return responseWithReplies(
    source,
    { ...state, activeMenu: menuId, activeFlow: null, activeStep: null, menuStack: stack, awaitingInput: false },
    [renderMenuReply(menu)]
  );
}

function startFlow(state, contract, flowId, source) {
  const flow = contract.flows[flowId];
  if (!flow) return integrationDisabled(state, source);
  if (flow.id === "human_handoff") {
    return response(
      source,
      { ...state, mode: "human", serviceState: "HUMANO", activeFlow: null, activeStep: null, awaitingInput: false },
      "Conversa encaminhada para atendimento humano. O historico e o contexto foram preservados.",
      [{ type: "notify_operator" }]
    );
  }
  const nextState = { ...state, activeFlow: flowId, activeStep: flow.steps[0].id, awaitingInput: true };
  return response(source, nextState, flow.initialMessage);
}

function handleActiveFlow(state, contract, text, rawText) {
  const flow = contract.flows[state.activeFlow];
  const step = flow?.steps.find((item) => item.id === state.activeStep);
  if (!flow || !step) return response("invalidFlowState", { ...state, activeFlow: null, activeStep: null, awaitingInput: false }, renderMenu(contract.menus[state.activeMenu || contract.welcome.menuId]));
  if (!text) return response("invalidStepValue", state, "Nao consegui validar essa informacao. Confira e responda novamente.");
  const nextFlowData = setField(state.flowData || {}, step.field, String(rawText || "").trim());
  if (flow.id === "human_handoff") {
    return response(
      "humanHandoffFlow",
      { ...state, mode: "human", serviceState: "HUMANO", activeFlow: null, activeStep: null, awaitingInput: false, flowData: nextFlowData },
      "Conversa encaminhada para atendimento humano. O historico e o contexto foram preservados.",
      [{ type: "notify_operator" }]
    );
  }
  if (flow.neverConfirmPayment) {
    return response(
      "paymentSafety",
      { ...state, activeFlow: null, activeStep: null, awaitingInput: false, flowData: nextFlowData },
      "A informacao foi registrada para conferencia. O pagamento ainda nao esta confirmado.",
      [{ type: "payment_review_required" }]
    );
  }
  return response("flowEngine", { ...state, activeFlow: null, activeStep: null, awaitingInput: false, flowData: nextFlowData }, "Registrado. A equipe vai revisar antes de confirmar qualquer disponibilidade, valor ou prazo.");
}

function showCatalog(state, contract, catalogId, source) {
  return response("catalogService", { ...state, catalogId }, contract.catalogs[catalogId] || "Catalogo indisponivel sem validacao operacional.", [{ type: "catalog_viewed", source }]);
}

function resolveContractPath(contract, target = "") {
  if (target === "integration.insano_food_truck.event_form_url") {
    return getRuntimeConfig().eventFormPublicUrl;
  }
  const aliases = {
    "integration.insano_food_truck.catalog_url": "integrations.insano_food_truck.catalogUrl",
    "integration.insano_food_truck.event_form_url": "integrations.insano_food_truck.eventFormUrl"
  };
  const path = aliases[target] || target;
  return path.split(".").reduce((value, key) => value?.[key], contract);
}

function buildUrlButtonTarget(baseUrl, target, state = {}) {
  if (!baseUrl || target !== "integration.insano_food_truck.event_form_url") return baseUrl;
  const url = new URL(baseUrl);
  if (state.conversationId) {
    const phone = String(state.conversationId).replace(/\D/g, "");
    url.searchParams.set("conversationId", phone ? `wa_${phone}` : state.conversationId);
    url.searchParams.set("phone", phone || state.conversationId);
  }
  return url.toString();
}

function integrationDisabled(state, source) {
  return response(
    "integrationGuard",
    state,
    "Essa funcao ainda nao esta habilitada. Vou encaminhar para atendimento.",
    [{ type: "integration_disabled", source }]
  );
}

function handleNavigationCommand(state, contract, command) {
  if (command === "inicio") return openMenu(resetToPortal(state, contract), contract, contract.welcome.menuId, "homeCommand", []);
  if (command === "insano_menu_voltar") return openMenu({ ...state, areaId: "insano_food_truck", activeFlow: null, activeStep: null, awaitingInput: false, foodtruckSubstate: null }, contract, "foodtruck_main_menu", "INSANO_MENU_VOLTAR", []);
  if (command === "voltar") {
    const stack = [...(state.menuStack || [])];
    const target = stack.pop() || contract.welcome.menuId;
    return openMenu({ ...state, areaId: target === contract.welcome.menuId ? null : state.areaId, menuStack: stack }, contract, target, "backCommand", stack);
  }
  if (command === "cancelar") return response("cancelCommand", { ...state, activeFlow: null, activeStep: null, awaitingInput: false }, "Fluxo cancelado. Escolha uma opcao do menu atual.");
  if (command === "humano") return startFlow(state, contract, "human_handoff", "humanCommand");
  return null;
}

function routeNavigationCommand(text) {
  if (["inicio", "menu principal", "portal", "comecar de novo"].includes(text)) return "inicio";
  if (["insano_menu_voltar", "voltar ao insano food truck"].includes(text)) return "insano_menu_voltar";
  if (["voltar", "retornar", "menu anterior"].includes(text)) return "voltar";
  if (["cancelar", "parar", "desistir"].includes(text)) return "cancelar";
  if (["humano", "atendente", "pessoa", "falar com alguem"].includes(text)) return "humano";
  return null;
}

function humanState(state) {
  return { handled: true, source: "humanState", nextState: state, replies: [], actions: [{ type: "notify_operator" }] };
}

function resetToPortal(state, contract) {
  return { ...state, areaId: null, activeMenu: contract.welcome.menuId, activeFlow: null, activeStep: null, awaitingInput: false, menuStack: [] };
}

function isWelcome(text) {
  return ["oi", "ola", "olá", "menu", "buenas"].includes(text);
}

function isPaymentClaim(text) {
  return ["paguei", "pix feito", "enviei comprovante"].some((phrase) => text.includes(phrase));
}

function setField(data, path, value) {
  const next = structuredClone(data);
  const parts = path.split(".");
  let cursor = next;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = cursor[part] || {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
  return next;
}

export function normalizeText(value = "") {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
