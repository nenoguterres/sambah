import crypto from "node:crypto";
import { response, responseWithReplies } from "./responseContract.js";
import { portalInsanoContract } from "./portalInsanoContract.js";
import { getBaseApi, getRuntimeConfig } from "../../config.js";
import { hashCustomerOrderToken } from "../../publicMesaOrderService.js";

export function routePortalInsanoMessage({ state, message, contract = portalInsanoContract }) {
  const text = normalizeText(message.text);
  const routedState = normalizeNavigationState(normalizeLegacyFoodtruckState(state, contract), contract);
  const command = routeNavigationCommand(text);
  if (routedState.mode === "human" || routedState.serviceState === "HUMANO") {
    if (isHumanReset(text) || command === "inicio" || command === "portal_voltar") {
      return openMenu(resetToPortal(routedState, contract), contract, contract.welcome.menuId, "humanResetToPortal", []);
    }
    return humanState(routedState);
  }
  if (["AGUARDANDO_PEDIDO_MESA", "AGUARDANDO_COMANDA_MESA"].includes(routedState.serviceState)) {
    if (command === "humano") return startFlow(routedState, contract, "human_handoff", "humanCommand");
    return waitingMesaState(routedState);
  }
  if (isDirectCustomerOrderIntent(text)) return openMesaCardapioLink(routedState, "directCustomerOrderIntent");
  if (isPaymentClaim(text)) return startFlow(routedState, contract, "payment_receipt_review", "paymentSafety");
  if (command) return handleNavigationCommand(routedState, contract, command);
  if (isWelcome(text)) return openMenu(resetToPortal(routedState, contract), contract, contract.welcome.menuId, "welcomeFlow", []);
  if (routedState.activeFlow) return handleActiveFlow(routedState, contract, text, message.text);
  if (isExternalPortalArea(routedState)) {
    const selected = resolveMenuOption(contract.menus[routedState.activeMenu], text);
    if (selected) return executeAction(routedState, contract, selected.action, selected.id);
    return openMenu(routedState, contract, routedState.activeMenu, "fallbackMenu", routedState.menuStack || []);
  }
  const currentScreen = currentNavigationScreen(routedState);
  if (!isMenuScreen(currentScreen)) return renderCurrentScreen(routedState, contract, "guidedScreenFallback");
  const currentMenuId = menuIdForScreen(currentScreen) || routedState.activeMenu || contract.welcome.menuId;
  const selected = resolveMenuOption(contract.menus[currentMenuId], text);
  if (selected) return executeAction(routedState, contract, selected.action, selected.id);
  return openMenu({ ...routedState, activeMenu: currentMenuId }, contract, currentMenuId, "fallbackMenu", routedState.menuStack || []);
}

export function renderMenu(menu) {
  if (!menu) return "Nao consegui localizar o menu atual. Digita inicio para voltar ao Portal Insano.";
  return `${menu.title}\n${menu.body}`;
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
        fallbackText: item.title
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
    const isPortalReturn = action.target === contract.welcome.menuId || source === "PORTAL_VOLTAR";
    const nextState = {
      ...state,
      areaId: Object.prototype.hasOwnProperty.call(action, "areaId") ? action.areaId : state.areaId,
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      foodtruckSubstate: action.clearFoodtruckSubstate ? null : state.foodtruckSubstate || null
    };
    const stack = isPortalReturn ? [] : [...(state.menuStack || []), state.activeMenu || contract.welcome.menuId];
    return openMenu({ ...nextState, navigationStack: isPortalReturn ? ["PORTAL_INSANO"] : nextState.navigationStack, menuStack: stack }, contract, action.target, source);
  }
  if (action.type === "start_flow") return startFlow(state, contract, action.target, source);
  if (action.type === "open_url_button") return openUrlButton(state, contract, action.target, source);
  if (action.type === "show_catalog") return showCatalog(state, contract, action.target, source);
  if (action.type === "open_authorized_link") return openMesaCardapioLink(state, source);
  if (action.type === "set_fulfillment") return setFulfillment(state, contract, action.mode, source);
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
    navigationStack: ["PORTAL_INSANO", "INSANO_FOODTRUCK"],
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
    return response("missingCatalogUrl", state, "CONFIGURA\u00c7\u00c3O AUSENTE: link do Insano Food Truck", [{ type: "missing_config", source, target }]);
  }
  const formTargets = {
    "integration.insano_food_truck.event_form_url": {
      screen: "INSANO_EVENTO",
      substate: "evento",
      text: "Evento \u2014 Insano Food Truck\n\nPreenche os dados do teu evento para nossa equipe verificar a agenda e responder nesta mesma conversa.",
      buttonText: "PREENCHER SOLICITA\u00c7\u00c3O",
      actionType: "event_form_url_button"
    },
    "integration.insano_food_truck.quote_form_url": {
      screen: "INSANO_ORCAMENTO",
      substate: "orcamento",
      text: "Or\u00e7amento \u2014 Insano Food Truck\n\nPreenche os dados para nossa equipe preparar o or\u00e7amento e responder nesta mesma conversa.",
      buttonText: "PREENCHER OR\u00c7AMENTO",
      actionType: "quote_form_url_button"
    }
  };
  const formTarget = formTargets[target];
  if (formTarget) {
    return responseWithReplies(
      source,
      {
        ...state,
        areaId: "insano_food_truck",
        activeMenu: "foodtruck_main_menu",
        activeFlow: null,
        activeStep: null,
        awaitingInput: false,
        navigationStack: pushNavigationScreen(state.navigationStack, formTarget.screen),
        foodtruckSubstate: { selectedAction: source, target: formTarget.substate }
      },
      [{
        type: "url_button",
        text: formTarget.text,
        buttonText: formTarget.buttonText,
        url
      }],
      [{ type: formTarget.actionType, source, url }]
    );
  }
  return responseWithReplies(
    source,
    {
      ...state,
      areaId: "insano_food_truck",
      activeMenu: "foodtruck_main_menu",
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      navigationStack: pushNavigationScreen(state.navigationStack, "INSANO_CATALOGO"),
      foodtruckSubstate: { selectedAction: source, target: "catalogo" }
    },
    [{
      type: "url_button",
      text: "Conhe\u00e7a o cat\u00e1logo de produtos do Insano Food Truck.",
      buttonText: "ABRIR CAT\u00c1LOGO",
      url
    }],
    [{ type: "catalog_url_button", source, url }]
  );
}

function openMesaCardapioLink(state, source) {
  const url = new URL("/cardapio/xeriffe", getBaseApi());
  const phone = String(state.phone || state.conversationId || "").replace(/\D/g, "");
  const conversationId = phone ? `wa_${phone}` : String(state.conversationId || "");
  const sambahConversationId = String(state.sambahConversationId || state.conversationId || "");
  const now = new Date().toISOString();
  const token = crypto.randomBytes(24).toString("base64url");
  url.searchParams.set("conversationId", conversationId);
  url.searchParams.set("sambahConversationId", sambahConversationId);
  url.searchParams.set("phone", phone || String(state.phone || state.conversationId || ""));
  url.searchParams.set("origin", "WHATSAPP_SAMBAH");
  url.searchParams.set("unit", "XERIFFE_OBIRICI");
  url.searchParams.set("token", token);
  return responseWithReplies(
    source,
    {
      ...state,
      areaId: "xeriffe_obirici",
      activeMenu: "xeriffe_main_menu",
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      serviceState: "AGUARDANDO_COMANDA_MESA",
      mesaOrderId: null,
      mesaLinkSentAt: now,
      mesaOrderReceivedAt: null,
      customerOrderTokenHash: hashCustomerOrderToken(token),
      customerOrderTokenCreatedAt: now,
      customerOrder: null,
      customerOrderConfirmedAt: null,
      sambahPayPaymentId: null,
      paymentConfirmedAt: null
    },
    [{
      type: "url_button",
      text: "Monte e confirme tua comanda no cardapio do Xeriffe. O pagamento seguira pendente ate a integracao real do SamBah Pay.",
      buttonText: "VER CARDAPIO",
      url: url.toString()
    }],
    [{ type: "mesa_cardapio_link", source, url: url.toString() }]
  );
}

function setFulfillment(state, contract, mode, source) {
  if (mode === "delivery") return startFlow({ ...state, fulfillmentMode: "delivery" }, contract, "delivery_address", source);
  return openMenu({
    ...state,
    fulfillmentMode: "pickup",
    serviceState: "AGUARDANDO_PAGAMENTO_SAMBAH_PAY"
  }, contract, "payment_main_menu", source, []);
}

function openMenu(state, contract, menuId, source, stack = state.menuStack || []) {
  const menu = contract.menus[menuId];
  const screen = screenForMenu(menuId);
  const navigationStack = source === "welcomeFlow" || menuId === contract.welcome.menuId
    ? ["PORTAL_INSANO"]
    : pushNavigationScreen(state.navigationStack, screen);
  return responseWithReplies(
    source,
    { ...state, activeMenu: menuId, activeFlow: null, activeStep: null, navigationStack, menuStack: stack, awaitingInput: false },
    [renderMenuReply(menu)]
  );
}

function startFlow(state, contract, flowId, source) {
  const flow = contract.flows[flowId];
  if (!flow) return integrationDisabled(state, source);
  if (flow.id === "human_handoff") {
    return response(
      source,
      { ...state, navigationStack: normalizeNavigationStack(state), mode: "human", serviceState: "HUMANO", activeFlow: null, activeStep: null, awaitingInput: false },
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
  if (!flow || !step) return renderCurrentScreen({ ...state, activeFlow: null, activeStep: null, awaitingInput: false }, contract, "invalidFlowState");
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
  if (flow.id === "delivery_address") {
    return openMenu({
      ...state,
      serviceState: "AGUARDANDO_PAGAMENTO_SAMBAH_PAY",
      deliveryAddress: String(rawText || "").trim(),
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      flowData: nextFlowData
    }, contract, "payment_main_menu", "deliveryAddressCaptured", []);
  }
  return response("flowEngine", { ...state, activeFlow: null, activeStep: null, awaitingInput: false, flowData: nextFlowData }, "Registrado. A equipe vai revisar antes de confirmar qualquer disponibilidade, valor ou prazo.");
}

function showCatalog(state, contract, catalogId, source) {
  return response("catalogService", { ...state, catalogId }, contract.catalogs[catalogId] || "Catalogo indisponivel sem validacao operacional.", [{ type: "catalog_viewed", source }]);
}

function normalizeNavigationState(state = {}, contract = portalInsanoContract) {
  const navigationStack = normalizeNavigationStack(state);
  const currentScreen = navigationStack.at(-1) || "PORTAL_INSANO";
  const activeMenu = isExternalPortalArea(state) ? state.activeMenu : menuIdForScreen(currentScreen) || state.activeMenu || contract.welcome.menuId;
  return {
    ...state,
    activeMenu,
    navigationStack
  };
}

function normalizeNavigationStack(state = {}) {
  if (Array.isArray(state.navigationStack) && state.navigationStack.length) {
    return dedupeNavigationStack(state.navigationStack);
  }
  if (state.foodtruckSubstate?.target === "evento" || state.foodtruckSubstate?.selectedAction === "INSANO_EVENTO") {
    return ["PORTAL_INSANO", "INSANO_FOODTRUCK", "INSANO_EVENTO"];
  }
  if (state.foodtruckSubstate?.target === "orcamento" || state.foodtruckSubstate?.selectedAction === "INSANO_ORCAMENTO") {
    return ["PORTAL_INSANO", "INSANO_FOODTRUCK", "INSANO_ORCAMENTO"];
  }
  if (state.foodtruckSubstate?.target === "catalogo" || state.foodtruckSubstate?.selectedAction === "INSANO_CATALOGO") {
    return ["PORTAL_INSANO", "INSANO_FOODTRUCK", "INSANO_CATALOGO"];
  }
  if (state.areaId === "insano_food_truck" || state.activeMenu === "foodtruck_main_menu") {
    return ["PORTAL_INSANO", "INSANO_FOODTRUCK"];
  }
  return ["PORTAL_INSANO"];
}

function dedupeNavigationStack(stack = []) {
  const allowed = new Set(["PORTAL_INSANO", "INSANO_FOODTRUCK", "INSANO_EVENTO", "INSANO_ORCAMENTO", "INSANO_CATALOGO", "INSANO_HUMANO"]);
  const normalized = [];
  for (const item of stack) {
    if (!allowed.has(item)) continue;
    if (normalized.at(-1) !== item) normalized.push(item);
  }
  return normalized.length ? normalized : ["PORTAL_INSANO"];
}

function currentNavigationScreen(state = {}) {
  return normalizeNavigationStack(state).at(-1) || "PORTAL_INSANO";
}

function pushNavigationScreen(stack = [], screen = "") {
  if (!screen) return normalizeNavigationStack({ navigationStack: stack });
  const next = normalizeNavigationStack({ navigationStack: stack });
  if (next.at(-1) !== screen) next.push(screen);
  return dedupeNavigationStack(next);
}

function screenForMenu(menuId = "") {
  const screens = {
    portal_main_menu: "PORTAL_INSANO",
    foodtruck_main_menu: "INSANO_FOODTRUCK"
  };
  return screens[menuId] || null;
}

function menuIdForScreen(screen = "") {
  const menus = {
    PORTAL_INSANO: "portal_main_menu",
    INSANO_FOODTRUCK: "foodtruck_main_menu"
  };
  return menus[screen] || null;
}

function isMenuScreen(screen = "") {
  return Boolean(menuIdForScreen(screen));
}

function isExternalPortalArea(state = {}) {
  return Boolean(state.activeMenu && !["portal_main_menu", "foodtruck_main_menu"].includes(state.activeMenu));
}

function renderCurrentScreen(state, contract, source = "currentScreen") {
  const screen = currentNavigationScreen(state);
  if (screen === "INSANO_EVENTO") return openUrlButton(state, contract, "integration.insano_food_truck.event_form_url", source);
  if (screen === "INSANO_ORCAMENTO") return openUrlButton(state, contract, "integration.insano_food_truck.quote_form_url", source);
  const menuId = menuIdForScreen(screen) || contract.welcome.menuId;
  return openMenu({ ...state, activeMenu: menuId }, contract, menuId, source, state.menuStack || []);
}

function navigateBack(state, contract, source = "backCommand") {
  const stack = normalizeNavigationStack(state);
  if (source === "INSANO_MENU_VOLTAR") {
    return openMenu({
      ...state,
      areaId: "insano_food_truck",
      activeFlow: null,
      activeStep: null,
      awaitingInput: false,
      foodtruckSubstate: null,
      navigationStack: ["PORTAL_INSANO", "INSANO_FOODTRUCK"]
    }, contract, "foodtruck_main_menu", source, []);
  }
  const nextStack = stack.length > 1 ? stack.slice(0, -1) : ["PORTAL_INSANO"];
  const targetScreen = nextStack.at(-1) || "PORTAL_INSANO";
  const areaId = targetScreen === "INSANO_FOODTRUCK" ? "insano_food_truck" : targetScreen === "PORTAL_INSANO" ? null : state.areaId;
  return renderCurrentScreen({
    ...state,
    areaId,
    activeFlow: null,
    activeStep: null,
    awaitingInput: false,
    foodtruckSubstate: targetScreen === "INSANO_FOODTRUCK" ? null : state.foodtruckSubstate,
    navigationStack: nextStack
  }, contract, source);
}

function resolveContractPath(contract, target = "") {
  if (target === "integration.insano_food_truck.event_form_url") {
    return getRuntimeConfig().eventFormPublicUrl;
  }
  if (target === "integration.insano_food_truck.quote_form_url") {
    return getRuntimeConfig().quoteFormPublicUrl;
  }
  const aliases = {
    "integration.insano_food_truck.catalog_url": "integrations.insano_food_truck.catalogUrl",
    "integration.insano_food_truck.event_form_url": "integrations.insano_food_truck.eventFormUrl",
    "integration.insano_food_truck.quote_form_url": "integrations.insano_food_truck.quoteFormUrl"
  };
  const path = aliases[target] || target;
  return path.split(".").reduce((value, key) => value?.[key], contract);
}

function buildUrlButtonTarget(baseUrl, target, state = {}) {
  if (!baseUrl || !["integration.insano_food_truck.event_form_url", "integration.insano_food_truck.quote_form_url"].includes(target)) return baseUrl;
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
  if (command === "portal_voltar") return openMenu(resetToPortal(state, contract), contract, contract.welcome.menuId, "PORTAL_VOLTAR", []);
  if (command === "insano_menu_voltar") return navigateBack(state, contract, "INSANO_MENU_VOLTAR");
  if (command === "voltar") {
    return navigateBack(state, contract, "backCommand");
  }
  if (command === "cancelar") return response("cancelCommand", { ...state, activeFlow: null, activeStep: null, awaitingInput: false }, "Fluxo cancelado. Escolha uma opcao do menu atual.");
  if (command === "humano") return startFlow(state, contract, "human_handoff", "humanCommand");
  return null;
}

function routeNavigationCommand(text) {
  if (["inicio", "menu principal", "portal", "portal insano", "comecar de novo"].includes(text)) return "inicio";
  if (["insano_menu_voltar", "voltar ao insano food truck"].includes(text)) return "insano_menu_voltar";
  if (["portal_voltar", "voltar ao portal insano"].includes(text)) return "portal_voltar";
  if (["voltar", "retornar", "menu anterior"].includes(text)) return "voltar";
  if (["cancelar", "parar", "desistir"].includes(text)) return "cancelar";
  if (["insano_humano", "humano", "atendente", "atendimento humano", "pessoa", "falar com alguem"].includes(text)) return "humano";
  return null;
}

function humanState(state) {
  return { handled: true, source: "humanState", nextState: state, replies: [], actions: [{ type: "notify_operator" }] };
}

function waitingMesaState(state) {
  return { handled: true, source: "waitingCustomerOrder", nextState: state, replies: [], actions: [{ type: "await_customer_order" }] };
}

function resetToPortal(state, contract) {
  return { ...state, mode: "bot", serviceState: "AUTOMATICO", areaId: null, activeMenu: contract.welcome.menuId, navigationStack: ["PORTAL_INSANO"], activeFlow: null, activeStep: null, awaitingInput: false, menuStack: [], foodtruckSubstate: null };
}

function isWelcome(text) {
  return ["oi", "ola", "olá", "menu", "buenas", "quero pedir", "quero fazer um pedido"].includes(text);
}

function isHumanReset(text) {
  return ["oi", "ola", "olá", "menu", "buenas"].includes(text);
}

function isPaymentClaim(text) {
  return ["paguei", "pix feito", "enviei comprovante"].some((phrase) => text.includes(phrase));
}

function isDirectCustomerOrderIntent(text) {
  return ["cardapio", "pedido", "quero pedir", "quero fazer um pedido", "quero comprar", "comprar"].includes(text);
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
