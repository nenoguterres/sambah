const ROUTES = {
  pedido: {
    module: "mesa",
    queue: "orders",
    priority: "high",
    requiresHuman: false,
    nextAction: "start_order"
  },
  cardapio: {
    module: "mesa",
    queue: "catalog",
    priority: "medium",
    requiresHuman: false,
    nextAction: "show_menu"
  },
  delivery: {
    module: "mesa",
    queue: "delivery",
    priority: "high",
    requiresHuman: false,
    nextAction: "delivery_flow"
  },
  retirada: {
    module: "mesa",
    queue: "pickup",
    priority: "medium",
    requiresHuman: false,
    nextAction: "pickup_flow"
  },
  local: {
    module: "mesa",
    queue: "local",
    priority: "medium",
    requiresHuman: false,
    nextAction: "onsite_flow"
  },
  evento: {
    module: "crm",
    queue: "events",
    priority: "high",
    requiresHuman: false,
    nextAction: "commercial_flow"
  },
  granja: {
    module: "granja",
    queue: "sales",
    priority: "medium",
    requiresHuman: false,
    nextAction: "granja_catalog"
  },
  financeiro: {
    module: "pay",
    queue: "payments",
    priority: "high",
    requiresHuman: false,
    nextAction: "payment_flow"
  },
  horario: {
    module: "info",
    queue: "general",
    priority: "low",
    requiresHuman: false,
    nextAction: "show_hours"
  },
  localizacao: {
    module: "info",
    queue: "general",
    priority: "low",
    requiresHuman: false,
    nextAction: "show_location"
  },
  humano: {
    module: "human",
    queue: "support",
    priority: "high",
    requiresHuman: true,
    nextAction: "handoff"
  },
  unknown: {
    module: "personality",
    queue: "default",
    priority: "low",
    requiresHuman: false,
    nextAction: "continue_dialog"
  }
};

export function routeConversation(intentResult = {}) {
  const intent = String(intentResult.intent || "unknown").toLowerCase();
  return { ...(ROUTES[intent] || ROUTES.unknown) };
}
