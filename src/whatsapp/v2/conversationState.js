export function createWhatsAppV2State(conversationId, now = new Date().toISOString()) {
  return {
    schemaVersion: 2,
    conversationId,
    sambahConversationId: null,
    phone: conversationId,
    mode: "bot",
    areaId: null,
    activeMenu: "portal_main_menu",
    menuStack: [],
    navigationStack: ["PORTAL_INSANO"],
    activeFlow: null,
    activeStep: null,
    flowData: {},
    serviceState: "AUTOMATICO",
    mesaOrderId: null,
    mesaLinkSentAt: null,
    mesaOrderReceivedAt: null,
    xeriffeCommand: { items: [], selectedCategory: null, selectedProductId: null, selectedAddonIds: [] },
    awaitingInput: false,
    history: [],
    audit: [],
    updatedAt: now,
    lastProcessedMessageId: null
  };
}
