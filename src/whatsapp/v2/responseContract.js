export function response(source, nextState, text = "", actions = []) {
  return {
    handled: true,
    source,
    nextState,
    replies: text ? [{ type: "text", text }] : [],
    actions
  };
}

export function assertWhatsAppV2ResponseContract(result) {
  if (!result || result.handled !== true || !result.source || !result.nextState || !Array.isArray(result.replies) || !Array.isArray(result.actions)) {
    throw new Error("INVALID_WHATSAPP_V2_RESPONSE_CONTRACT");
  }
  if (result.replies.length > 1) throw new Error("TOO_MANY_WHATSAPP_V2_REPLIES");
  return result;
}
