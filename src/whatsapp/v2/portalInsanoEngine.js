import { response, responseWithReplies } from "./responseContract.js";
import { portalInsanoContract } from "./portalInsanoContract.js";
import { getRuntimeConfig } from "../../config.js";

export function routePortalInsanoMessage({ state, message, contract = portalInsanoContract, menuCache = { items: [], categories: [] } }) {
  const text = normalizeText(message.text);
  const routedState = normalizeNavigationState(normalizeLegacyFoodtruckState(state, contract), contract);
  const command = routeNavigationCommand(text);
  if (routedState.mode === "human" || routedState.serviceState === "HUMANO") {
    if (command === "inicio" || command === "portal_voltar") {
      return openMenu(resetToPortal(routedState, contract), contract, contract.welcome.menuId, "humanResetToPortal", []);
    }
    return humanState(routedState);
  }
  if (routedState.serviceState === "AGUARDANDO_PEDIDO_MESA") {
    if (isHumanReset(text) || command === "inicio" || command === "portal_voltar") {
      return openMenu(resetToPortal(routedState, contract), contract, contract.welcome.menuId, "waitingMesaResetToPortal", []);
    }
    if (command === "humano") return startFlow(routedState, contract, "human_handoff", "humanCommand");
    return waitingMesaState(routedState);
  }
  if (isPaymentClaim(text)) return startFlow(routedState, contract, "payment_receipt_review", "paymentSafety");
  if (command) return handleNavigationCommand(routedState, contract, command);
  if (isWelcome(text) && routedState.activeFlow) return resumeActiveFlow(routedState, contract);
  if (routedState.activeFlow) return handleActiveFlow(routedState, contract, text, message.text);

  if (isWelcome(text)) {
    return openMenu(
      resetToPortal(routedState, contract),
      contract,
      contract.welcome.menuId,
      "welcomeResetToPortal",
      []
    );
  }

  if (isXeriffeCatalogMenu(routedState.activeMenu)) return handleXeriffeCatalogMessage(routedState, menuCache, text);
  if (isExternalPortalArea(routedState)) {
    const selected = resolveMenuOption(contract.menus[routedState.activeMenu], text);
    if (selected) return executeAction(routedState, contract, selected.action, selected.id, menuCache);
    return openMenu(routedState, contract, routedState.activeMenu, "fallbackMenu", routedState.menuStack || []);
  }
  if (isWelcome(text) && isPortalHome(routedState, contract)) {
    return openMenu(routedState, contract, contract.welcome.menuId, "welcomeFlow", []);
  }
  const currentScreen = currentNavigationScreen(routedState);
  if (!isMenuScreen(currentScreen)) return renderCurrentScreen(routedState, contract, "guidedScreenFallback");
  const currentMenuId = menuIdForScreen(currentScreen) || routedState.activeMenu || contract.welcome.menuId;
  const selected = resolveMenuOption(contract.menus[currentMenuId], text);
  if (selected) return executeAction(routedState, contract, selected.action, selected.id, menuCache);
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

function executeAction(state, contract, action, source, menuCache = { items: [], categories: [] }) {
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
  if (action.type === "start_flow") return startFlow(state, contract, action.target, source, action);
  if (action.type === "open_url_button") return openUrlButton(state, contract, action.target, source);
  if (action.type === "show_catalog") return showCatalog(state, contract, action.target, source);
  if (action.type === "open_mesa_menu") return openXeriffeCategories(state, menuCache, source);
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
      text: "Monte teu evento em poucos toques. Escolha produtos, quantidade e revise o orçamento antes de enviar.",
      buttonText: "MONTAR EVENTO",
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
    const isFoodtruckPortal = source === "PORTAL_INSANO_FOODTRUCK"
      || state.foodtruckSubstate?.selectedAction === "PORTAL_INSANO_FOODTRUCK";
    return responseWithReplies(
      source,
      {
        ...state,
        areaId: "insano_food_truck",
        activeMenu: "foodtruck_main_menu",
        activeFlow: null,
        activeStep: null,
        awaitingInput: false,
        navigationStack: isFoodtruckPortal
          ? ["PORTAL_INSANO", "INSANO_FOODTRUCK", formTarget.screen]
          : pushNavigationScreen(state.navigationStack, formTarget.screen),
        foodtruckSubstate: {
          selectedAction: isFoodtruckPortal ? "PORTAL_INSANO_FOODTRUCK" : source,
          target: formTarget.substate
        }
      },
      [{
        type: "url_button",
        text: isFoodtruckPortal ? "Portal Insano Food Truck\n\nAcesse o atendimento para evento, cardápio e orçamento." : formTarget.text,
        buttonText: isFoodtruckPortal ? "PORTAL INSANO" : formTarget.buttonText,
        url
      }],
      [{ type: formTarget.actionType, source, url }]
    );
  }
  if (target === "integration.mesa_do_xeriffe.customer_url") {
    return responseWithReplies(
      source,
      {
        ...state,
        areaId: "xeriffe_obirici",
        activeMenu: "xeriffe_main_menu",
        activeFlow: null,
        activeStep: null,
        awaitingInput: false,
        serviceState: "AUTOMATICO"
      },
      [{
        type: "url_button",
        text: "Cardapio Xeriffe Obirici\n\nEscolha produtos e adicionais em poucos toques. A comanda fica aberta para continuar comprando.",
        buttonText: "ABRIR CARDAPIO",
        url
      }],
      [{ type: "xeriffe_public_menu_url", source, url }]
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

function openXeriffeCategories(state, menuCache, source = "xeriffe.menu", requestedPage = 0) {
  const items = availableMenuItems(menuCache);
  if (!items.length) {
    return response(
      "xeriffeMenuUnavailable",
      { ...state, areaId: "xeriffe_obirici", activeMenu: "xeriffe_main_menu", serviceState: "AUTOMATICO" },
      "O cardapio oficial do Mesa ainda nao esta sincronizado. Nao vou abrir pagina externa nem inventar produtos.",
      [{ type: "menu_cache_unavailable", source }]
    );
  }
  const categories = [...new Set([
    ...(Array.isArray(menuCache?.categories) ? menuCache.categories : []),
    ...items.map((item) => item.category)
  ].filter((category) => category && items.some((item) => item.category === category)))];
  const pageSize = 8;
  const lastPage = Math.max(0, Math.ceil(categories.length / pageSize) - 1);
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), lastPage);
  const options = categories.slice(page * pageSize, (page + 1) * pageSize).map((category, index) => ({
    id: `xeriffe.category:${encodeURIComponent(normalizeText(category))}`,
    order: index + 1,
    title: category,
    description: `${items.filter((item) => item.category === category).length} produtos`,
    fallbackText: category
  }));
  if (page > 0) options.push({ id: "xeriffe.categories.prev", order: options.length + 1, title: "Categorias anteriores", description: "Voltar uma pagina", fallbackText: "Categorias anteriores" });
  if (page < lastPage) options.push({ id: "xeriffe.categories.next", order: options.length + 1, title: "Mais categorias", description: "Ver a proxima pagina", fallbackText: "Mais categorias" });
  const command = normalizeXeriffeCommand(state);
  return responseWithReplies(
    source,
    {
      ...state,
      areaId: "xeriffe_obirici",
      activeMenu: "xeriffe_catalog_categories",
      serviceState: "AUTOMATICO",
      awaitingInput: false,
      xeriffeCatalogPage: page,
      xeriffeCommand: { ...command, selectedCategory: null, selectedProductId: null, selectedAddonIds: [] }
    },
    [menuReply("xeriffe_catalog_categories", "Cardapio Xeriffe", command.items.length ? `Escolha uma categoria. Comanda: ${command.items.length} item(ns).` : "Escolha uma categoria:", options, "VER CATEGORIAS")],
    [{ type: "mesa_menu_inside_whatsapp", source, page }]
  );
}

function handleXeriffeCatalogMessage(state, menuCache, text) {
  const command = normalizeXeriffeCommand(state);
  if (state.activeMenu === "xeriffe_catalog_categories") {
    if (text === "xeriffe.categories.next") return openXeriffeCategories(state, menuCache, "xeriffe.categories.next", Number(state.xeriffeCatalogPage || 0) + 1);
    if (text === "xeriffe.categories.prev") return openXeriffeCategories(state, menuCache, "xeriffe.categories.prev", Number(state.xeriffeCatalogPage || 0) - 1);
    if (text.startsWith("xeriffe.category:")) {
      return openXeriffeProducts(state, menuCache, decodeMenuId(text.slice("xeriffe.category:".length)));
    }
    return openXeriffeCategories(state, menuCache, "xeriffe.categories.fallback", state.xeriffeCatalogPage || 0);
  }
  if (state.activeMenu === "xeriffe_catalog_products") {
    if (text === "xeriffe.catalog.categories") return openXeriffeCategories(state, menuCache, "xeriffe.catalog.categories");
    if (text.startsWith("xeriffe.product:")) {
      return openXeriffeProductCard(state, menuCache, decodeMenuId(text.slice("xeriffe.product:".length)), []);
    }
    return openXeriffeProducts(state, menuCache, command.selectedCategory);
  }
  if (state.activeMenu === "xeriffe_product_card") {
    if (text === "xeriffe.catalog.back") return openXeriffeCategories(state, menuCache, "xeriffe.catalog.back");
    if (text === "xeriffe.product.addons") return openXeriffeAddons(state, menuCache);
    if (text === "xeriffe.product.add") return addSelectedProductToCommand(state, menuCache);
    return openXeriffeProductCard(state, menuCache, command.selectedProductId, command.selectedAddonIds);
  }
  if (state.activeMenu === "xeriffe_product_addons") {
    if (text === "xeriffe.addons.done") return openXeriffeProductCard(state, menuCache, command.selectedProductId, command.selectedAddonIds);
    if (text === "xeriffe.catalog.back") return openXeriffeCategories(state, menuCache, "xeriffe.catalog.back");
    if (text.startsWith("xeriffe.addon:")) {
      const addonId = decodeMenuId(text.slice("xeriffe.addon:".length));
      const selected = new Set(command.selectedAddonIds);
      if (selected.has(addonId)) selected.delete(addonId);
      else selected.add(addonId);
      return openXeriffeProductCard(state, menuCache, command.selectedProductId, [...selected], "xeriffe.addon.toggle");
    }
    return openXeriffeAddons(state, menuCache);
  }
  if (state.activeMenu === "xeriffe_command_summary") {
    if (text === "xeriffe.command.continue") return openXeriffeCategories(state, menuCache, "xeriffe.command.continue");
    if (text === "xeriffe.command.clear") {
      return openXeriffeCategories({ ...state, xeriffeCommand: emptyXeriffeCommand() }, menuCache, "xeriffe.command.clear");
    }
    return renderXeriffeCommandSummary(state, "xeriffe.command.summary");
  }
  return openXeriffeCategories(state, menuCache, "xeriffe.catalog.recover");
}

function openXeriffeProducts(state, menuCache, category) {
  const resolvedCategory = [...new Set(availableMenuItems(menuCache).map((item) => item.category).filter(Boolean))]
    .find((item) => normalizeText(item) === normalizeText(category)) || "";
  const products = availableMenuItems(menuCache).filter((item) => item.category === resolvedCategory).slice(0, 9);
  if (!products.length) return openXeriffeCategories(state, menuCache, "xeriffe.category.empty");
  const options = products.map((product, index) => ({
    id: `xeriffe.product:${encodeURIComponent(product.productId)}`,
    order: index + 1,
    title: product.name,
    description: `${formatMoney(product.price)} | Cod. ${product.productId}`,
    fallbackText: product.name
  }));
  options.push({ id: "xeriffe.catalog.categories", order: options.length + 1, title: "Voltar ao cardapio", description: "Escolher outra categoria", fallbackText: "Voltar ao cardapio" });
  return responseWithReplies(
    "xeriffe.category",
    {
      ...state,
      activeMenu: "xeriffe_catalog_products",
      xeriffeCommand: { ...normalizeXeriffeCommand(state), selectedCategory: resolvedCategory, selectedProductId: null, selectedAddonIds: [] }
    },
    [menuReply("xeriffe_catalog_products", resolvedCategory, "Escolha um produto:", options, "VER PRODUTOS")],
    [{ type: "mesa_category_selected", category: resolvedCategory }]
  );
}

function openXeriffeProductCard(state, menuCache, productId, selectedAddonIds = [], source = "xeriffe.product") {
  const product = findMenuProduct(menuCache, productId);
  if (!product) return openXeriffeCategories(state, menuCache, "xeriffe.product.missing");
  const availableAddons = availableProductAddons(product);
  const selected = selectedAddonIds.filter((id) => availableAddons.some((addon) => addon.id === id));
  const selectedAddons = selected.map((id) => availableAddons.find((addon) => addon.id === id));
  const total = Number(product.price || 0) + selectedAddons.reduce((sum, addon) => sum + Number(addon.price || 0), 0);
  const code = buildCommandCode(product.productId, selected);
  const addonLines = availableAddons.length
    ? availableAddons.map((addon) => `${selected.includes(addon.id) ? "[x]" : "[ ]"} ${addon.name} | cod. ${addon.id} | ${formatMoney(addon.price)}`).join("\n")
    : "Sem adicionais disponiveis.";
  const selectedLines = selectedAddons.length
    ? `\nSelecionados:\n${selectedAddons.map((addon) => `- ${addon.name} (${addon.id})`).join("\n")}`
    : "";
  const buttons = [
    { id: "xeriffe.product.add", title: "Adicionar comanda" },
    ...(availableAddons.length ? [{ id: "xeriffe.product.addons", title: "Ver adicionais" }] : []),
    { id: "xeriffe.catalog.back", title: "Voltar cardapio" }
  ];
  const body = [
    product.name,
    `Codigo do produto: ${product.productId}`,
    product.description || "",
    `Valor base: ${formatMoney(product.price)}`,
    "",
    "Adicionais:",
    addonLines,
    selectedLines,
    "",
    `Codigo da comanda: ${code}`,
    `Total deste item: ${formatMoney(total)}`
  ].filter((line) => line !== "").join("\n");
  return responseWithReplies(
    source,
    {
      ...state,
      activeMenu: "xeriffe_product_card",
      xeriffeCommand: { ...normalizeXeriffeCommand(state), selectedCategory: product.category, selectedProductId: product.productId, selectedAddonIds: selected }
    },
    [{ type: "product_card", text: body, imageUrl: safeImageUrl(product.imageUrl), buttons }],
    [{ type: "mesa_product_card", productId: product.productId, commandCode: code }]
  );
}

function openXeriffeAddons(state, menuCache) {
  const command = normalizeXeriffeCommand(state);
  const product = findMenuProduct(menuCache, command.selectedProductId);
  if (!product) return openXeriffeCategories(state, menuCache, "xeriffe.addons.product_missing");
  const selected = new Set(command.selectedAddonIds);
  const options = availableProductAddons(product).slice(0, 8).map((addon, index) => ({
    id: `xeriffe.addon:${encodeURIComponent(addon.id)}`,
    order: index + 1,
    title: `${selected.has(addon.id) ? "Remover" : "Adicionar"} ${addon.name}`,
    description: `Cod. ${addon.id} | ${formatMoney(addon.price)}`,
    fallbackText: addon.name
  }));
  options.push({ id: "xeriffe.addons.done", order: options.length + 1, title: "Concluir adicionais", description: "Voltar ao produto", fallbackText: "Concluir adicionais" });
  return responseWithReplies(
    "xeriffe.product.addons",
    { ...state, activeMenu: "xeriffe_product_addons" },
    [menuReply("xeriffe_product_addons", "Adicionais", "Toque para adicionar ou remover. Cada adicional entra no codigo da comanda.", options, "ESCOLHER ADICIONAL")],
    [{ type: "mesa_addons_opened", productId: product.productId }]
  );
}

function addSelectedProductToCommand(state, menuCache) {
  const command = normalizeXeriffeCommand(state);
  const product = findMenuProduct(menuCache, command.selectedProductId);
  if (!product) return openXeriffeCategories(state, menuCache, "xeriffe.command.product_missing");
  const addons = command.selectedAddonIds.map((id) => availableProductAddons(product).find((addon) => addon.id === id)).filter(Boolean);
  const total = Number(product.price || 0) + addons.reduce((sum, addon) => sum + Number(addon.price || 0), 0);
  const item = {
    productId: product.productId,
    name: product.name,
    quantity: 1,
    unitPrice: Number(product.price || 0),
    addons: addons.map((addon) => ({ id: addon.id, name: addon.name, price: Number(addon.price || 0) })),
    commandCode: buildCommandCode(product.productId, addons.map((addon) => addon.id)),
    total
  };
  const nextState = {
    ...state,
    activeMenu: "xeriffe_command_summary",
    xeriffeCommand: { ...command, items: [...command.items, item], selectedProductId: null, selectedAddonIds: [] }
  };
  return renderXeriffeCommandSummary(nextState, "xeriffe.product.added");
}

function renderXeriffeCommandSummary(state, source) {
  const command = normalizeXeriffeCommand(state);
  const total = command.items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const lines = command.items.map((item, index) => `${index + 1}. ${item.name}\nCod. ${item.commandCode}\n${formatMoney(item.total)}`);
  const options = [
    { id: "xeriffe.command.continue", order: 1, title: "Voltar ao cardapio", description: "Adicionar outro produto", fallbackText: "Voltar ao cardapio" },
    { id: "xeriffe.command.summary", order: 2, title: "Revisar comanda", description: `${command.items.length} item(ns) | ${formatMoney(total)}`, fallbackText: "Revisar comanda" },
    { id: "xeriffe.command.clear", order: 3, title: "Limpar comanda", description: "Remover todos os itens", fallbackText: "Limpar comanda" }
  ];
  return responseWithReplies(
    source,
    { ...state, activeMenu: "xeriffe_command_summary", serviceState: "AUTOMATICO", xeriffeCommand: command },
    [menuReply("xeriffe_command_summary", "Comanda Xeriffe", `${lines.join("\n\n")}\n\nValor total: ${formatMoney(total)}\n\nA comanda ainda nao foi enviada ao Mesa.`, options, "OPCOES DA COMANDA")],
    [{ type: "xeriffe_command_updated", items: command.items.length, total }]
  );
}

function menuReply(id, title, body, options, buttonText) {
  return { type: "menu", text: `${title}\n${body}`, menu: { id, title, body, buttonText, options } };
}

function isXeriffeCatalogMenu(menuId = "") {
  return ["xeriffe_catalog_categories", "xeriffe_catalog_products", "xeriffe_product_card", "xeriffe_product_addons", "xeriffe_command_summary"].includes(menuId);
}

function availableMenuItems(menuCache = {}) {
  return (Array.isArray(menuCache.items) ? menuCache.items : []).filter((item) => item?.productId && item.available !== false && item.availability?.available !== false);
}

function findMenuProduct(menuCache, productId) {
  return availableMenuItems(menuCache).find((item) => normalizeText(item.productId) === normalizeText(productId)) || null;
}

function availableProductAddons(product = {}) {
  return (Array.isArray(product.addons) ? product.addons : []).filter((addon) => addon?.id && addon.available !== false && addon.availability?.available !== false);
}

function emptyXeriffeCommand() {
  return { items: [], selectedCategory: null, selectedProductId: null, selectedAddonIds: [] };
}

function normalizeXeriffeCommand(state = {}) {
  const value = state.xeriffeCommand && typeof state.xeriffeCommand === "object" ? state.xeriffeCommand : {};
  return {
    items: Array.isArray(value.items) ? value.items : [],
    selectedCategory: value.selectedCategory || null,
    selectedProductId: value.selectedProductId || null,
    selectedAddonIds: Array.isArray(value.selectedAddonIds) ? value.selectedAddonIds : []
  };
}

function buildCommandCode(productId, addonIds = []) {
  return [productId, ...addonIds].filter(Boolean).join("-");
}

function formatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function safeImageUrl(value = "") {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) ? url : "";
}

function decodeMenuId(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
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

function startFlow(state, contract, flowId, source, action = {}) {
  const flow = contract.flows[flowId];
  if (!flow) return integrationDisabled(state, source);
  if (flow.id === "human_handoff") {
    const assignee = String(action.assignee || "").trim();
    const flowData = assignee ? setField(state.flowData || {}, "handoff.assignee", assignee) : state.flowData;
    return response(
      source,
      { ...state, navigationStack: normalizeNavigationStack(state), mode: "human", serviceState: "HUMANO", activeFlow: null, activeStep: null, awaitingInput: false, flowData },
      assignee
        ? `Conversa encaminhada para ${assignee}. O historico e o contexto foram preservados.`
        : "Conversa encaminhada para atendimento humano. O historico e o contexto foram preservados.",
      [{ type: "notify_operator", assignee: assignee || null }]
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
    "integration.insano_food_truck.quote_form_url": "integrations.insano_food_truck.quoteFormUrl",
    "integration.mesa_do_xeriffe.customer_url": "integrations.mesa_do_xeriffe.customerUrl"
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

function resumeActiveFlow(state, contract) {
  const flow = contract.flows[state.activeFlow];
  const step = flow?.steps?.find((item) => item.id === state.activeStep);
  const prompt = step?.prompt || flow?.initialMessage || "Seguimos deste ponto. Responde a informacao solicitada para continuar.";
  return response("activeFlowGreeting", state, prompt);
}

function isPortalHome(state, contract) {
  return !state.areaId
    && !state.activeFlow
    && state.mode !== "human"
    && state.serviceState !== "HUMANO"
    && (state.activeMenu || contract.welcome.menuId) === contract.welcome.menuId
    && currentNavigationScreen(state) === "PORTAL_INSANO";
}

function humanState(state) {
  return { handled: true, source: "humanState", nextState: state, replies: [], actions: [{ type: "notify_operator" }] };
}

function waitingMesaState(state) {
  return { handled: true, source: "waitingMesaOrder", nextState: state, replies: [], actions: [{ type: "await_mesa_order" }] };
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
