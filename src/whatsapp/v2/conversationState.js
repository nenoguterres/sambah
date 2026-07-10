export function createWhatsAppV2State(conversationId, now = new Date().toISOString()) {
  return {
    schemaVersion: 2,
    conversationId,
    mode: "bot",
    activeFlow: null,
    activeStep: null,
    flowData: {},
    history: [],
    audit: [],
    updatedAt: now,
    lastProcessedMessageId: null
  };
}
