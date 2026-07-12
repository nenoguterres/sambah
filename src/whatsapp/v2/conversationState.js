export function createWhatsAppV2State(conversationId, now = new Date().toISOString()) {
  return {
    schemaVersion: 2,
    conversationId,
    mode: "bot",
    areaId: null,
    activeMenu: "portal_main_menu",
    menuStack: [],
    navigationStack: ["PORTAL_INSANO"],
    activeFlow: null,
    activeStep: null,
    flowData: {},
    serviceState: "AUTOMATICO",
    awaitingInput: false,
    history: [],
    audit: [],
    updatedAt: now,
    lastProcessedMessageId: null
  };
}
