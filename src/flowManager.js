import { isEventFlowActive, isEventIntent, processEventFlow } from "./eventFlow.js";

export function handleActiveFlow({ conversation = {}, text = "", intent = "", now = new Date() } = {}) {
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
