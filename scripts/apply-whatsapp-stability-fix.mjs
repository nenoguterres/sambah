import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function read(path) {
  return readFile(path, "utf8");
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function replaceOnce(content, before, after, label) {
  const first = content.indexOf(before);
  if (first === -1) throw new Error(`PATCH_TARGET_NOT_FOUND: ${label}`);
  if (content.indexOf(before, first + before.length) !== -1) throw new Error(`PATCH_TARGET_NOT_UNIQUE: ${label}`);
  return `${content.slice(0, first)}${after}${content.slice(first + before.length)}`;
}

const dedupeModule = `const LEGACY_OUTBOUND_WINDOW_MS = 5000;

export function dedupeConversationMessages(messages = []) {
  const ordered = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && typeof message === "object" && !Array.isArray(message))
    .sort(compareCreatedAt);
  const result = [];
  for (const candidate of ordered) {
    const duplicateIndex = result.findIndex((current) => sameConversationMessage(current, candidate));
    if (duplicateIndex === -1) result.push(candidate);
    else result[duplicateIndex] = mergeConversationMessages(result[duplicateIndex], candidate);
  }
  return result.slice(-60);
}

export function sameConversationMessage(current = {}, candidate = {}, { fallbackId = "" } = {}) {
  if (messageDirection(current) !== messageDirection(candidate)) return false;
  const currentIdentifiers = conversationMessageIdentifiers(current);
  const candidateIdentifiers = conversationMessageIdentifiers(candidate, fallbackId);
  for (const identifier of currentIdentifiers) {
    if (candidateIdentifiers.has(identifier)) return true;
  }
  return sameLegacyOutbound(current, candidate);
}

export function mergeConversationMessages(primary = {}, duplicate = {}) {
  const merged = { ...duplicate, ...primary };
  for (const field of [
    "id",
    "messageId",
    "providerMessageId",
    "correlationId",
    "manualSendId",
    "text",
    "transcricao",
    "metaMessageType",
    "recipientId",
    "errorCode",
    "errorMessage"
  ]) {
    if (isBlank(merged[field]) && !isBlank(duplicate[field])) merged[field] = duplicate[field];
  }
  for (const field of ["response", "statusPayload", "httpStatus"]) {
    if (merged[field] == null && duplicate[field] != null) merged[field] = duplicate[field];
  }
  for (const field of ["deliveredAt", "readAt", "failedAt", "statusUpdatedAt"]) {
    merged[field] = latestTimestamp(primary[field], duplicate[field]) || primary[field] || duplicate[field] || null;
  }
  merged.status = preferredStatus(primary.status, duplicate.status);
  merged.sent = Boolean(primary.sent || duplicate.sent || merged.status === "sent" || merged.status === "delivered" || merged.status === "read");
  merged.createdAt = earliestTimestamp(primary.createdAt, duplicate.createdAt) || primary.createdAt || duplicate.createdAt || "";
  merged.id = String(primary.id || duplicate.id || "").trim();
  return merged;
}

function sameLegacyOutbound(left = {}, right = {}) {
  if (messageDirection(left) !== "out" || messageDirection(right) !== "out") return false;
  const leftText = normalizeText(left.text || left.message || "");
  const rightText = normalizeText(right.text || right.message || "");
  if (!leftText || leftText !== rightText) return false;
  const leftTime = Date.parse(left.createdAt || "");
  const rightTime = Date.parse(right.createdAt || "");
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
  return Math.abs(leftTime - rightTime) <= LEGACY_OUTBOUND_WINDOW_MS;
}

function conversationMessageIdentifiers(message = {}, fallbackId = "") {
  const identifiers = new Set([
    fallbackId,
    message.id,
    message.messageId,
    message.providerMessageId,
    message.correlationId,
    message.manualSendId
  ].map((value) => String(value || "").trim()).filter(Boolean));
  const responseMessages = Array.isArray(message.response?.messages) ? message.response.messages : [];
  for (const item of responseMessages) {
    const id = String(item?.id || "").trim();
    if (id) identifiers.add(id);
  }
  return identifiers;
}

function messageDirection(message = {}) {
  return message.direction === "out" ? "out" : "in";
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/\\s+/g, " ")
    .trim();
}

function compareCreatedAt(left = {}, right = {}) {
  const byTime = String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
  if (byTime !== 0) return byTime;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function statusRank(value = "") {
  const ranks = {
    registrada_sem_envio: 1,
    registrada: 2,
    sent: 3,
    delivered: 4,
    read: 5,
    failed: 6
  };
  return ranks[String(value || "")] || 0;
}

function preferredStatus(left = "", right = "") {
  return statusRank(right) > statusRank(left) ? right : left || right || "";
}

function earliestTimestamp(left = "", right = "") {
  const leftTime = Date.parse(left || "");
  const rightTime = Date.parse(right || "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime <= rightTime ? left : right;
  return left || right || "";
}

function latestTimestamp(left = "", right = "") {
  const leftTime = Date.parse(left || "");
  const rightTime = Date.parse(right || "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime >= rightTime ? left : right;
  return left || right || "";
}

function isBlank(value) {
  return value == null || String(value).trim() === "";
}
`;

await write("src/whatsapp/conversationMessageDedupe.js", dedupeModule);

let service = await read("src/whatsappConversationService.js");
service = replaceOnce(
  service,
  `import { normalizeWhatsAppPhone, sameWhatsAppPhone, whatsappPhoneAliases } from "./whatsapp/phoneNumber.js";`,
  `import { normalizeWhatsAppPhone, sameWhatsAppPhone, whatsappPhoneAliases } from "./whatsapp/phoneNumber.js";\nimport { dedupeConversationMessages, mergeConversationMessages, sameConversationMessage } from "./whatsapp/conversationMessageDedupe.js";`,
  "conversation service dedupe import"
);
service = replaceOnce(
  service,
  `    return conversation ? { ok: true, conversa: this.#withPriority(conversation) } : { ok: false, error: "Conversa nao encontrada" };`,
  `    return conversation\n      ? { ok: true, conversa: this.#withPriority({ ...conversation, mensagens: dedupeConversationMessages(conversation.mensagens) }) }\n      : { ok: false, error: "Conversa nao encontrada" };`,
  "conversation get output dedupe"
);
service = replaceOnce(
  service,
  `    const conversations = (Array.isArray(data.conversas) ? data.conversas : []).filter(isPlainRecord).map((item) => this.#withPriority(item));`,
  `    const conversations = (Array.isArray(data.conversas) ? data.conversas : [])\n      .filter(isPlainRecord)\n      .map((item) => this.#withPriority({ ...item, mensagens: dedupeConversationMessages(item.mensagens) }));`,
  "conversation list output dedupe"
);
service = replaceOnce(
  service,
  `      const existing = index >= 0 ? next.conversas[index] : null;\n      const messages = Array.isArray(existing?.mensagens) ? existing.mensagens : [];\n      const messageId = historyMessage.id || historyMessage.messageId || \`history_\${historyMessage.createdAt}_\${phone}\`;\n      if (messages.some((message) => sameHistoryMessage(message, historyMessage, messageId))) continue;\n      const text = String(historyMessage.text || "").trim();\n      const message = {\n        id: messageId,\n        direction: historyMessage.direction === "out" ? "out" : "in",\n        type: "text",\n        text,\n        transcricao: "",\n        mediaId: "",\n        rawType: "text",\n        createdAt: historyMessage.createdAt,\n        status: normalizeHistoryStatus(historyMessage),\n        messageId: historyMessage.messageId || "",\n        providerMessageId: historyMessage.providerMessageId || "",\n        correlationId: historyMessage.correlationId || "",\n        manualSendId: historyMessage.manualSendId || historyMessage.correlationId || "",\n        httpStatus: historyMessage.httpStatus || null,\n        response: historyMessage.response || null,\n        errorCode: historyMessage.errorCode || "",\n        errorMessage: historyMessage.errorMessage || ""\n      };`,
  `      const existing = index >= 0 ? next.conversas[index] : null;\n      const rawMessages = Array.isArray(existing?.mensagens) ? existing.mensagens : [];\n      const messages = dedupeConversationMessages(rawMessages);\n      if (index >= 0 && messages.length !== rawMessages.length) {\n        next.conversas[index] = { ...existing, mensagens: messages };\n        changed = true;\n      }\n      const messageId = historyMessage.id || historyMessage.messageId || \`history_\${historyMessage.createdAt}_\${phone}\`;\n      const text = String(historyMessage.text || "").trim();\n      const message = {\n        id: messageId,\n        direction: historyMessage.direction === "out" ? "out" : "in",\n        type: "text",\n        text,\n        transcricao: "",\n        mediaId: "",\n        rawType: "text",\n        createdAt: historyMessage.createdAt,\n        status: normalizeHistoryStatus(historyMessage),\n        messageId: historyMessage.messageId || "",\n        providerMessageId: historyMessage.providerMessageId || "",\n        correlationId: historyMessage.correlationId || "",\n        manualSendId: historyMessage.manualSendId || historyMessage.correlationId || "",\n        httpStatus: historyMessage.httpStatus || null,\n        response: historyMessage.response || null,\n        errorCode: historyMessage.errorCode || "",\n        errorMessage: historyMessage.errorMessage || ""\n      };\n      const duplicateIndex = messages.findIndex((current) => sameConversationMessage(current, message));\n      if (duplicateIndex >= 0) {\n        const mergedMessages = [...messages];\n        mergedMessages[duplicateIndex] = mergeConversationMessages(mergedMessages[duplicateIndex], message);\n        if (index >= 0 && JSON.stringify(mergedMessages) !== JSON.stringify(rawMessages)) {\n          next.conversas[index] = { ...next.conversas[index], mensagens: mergedMessages };\n          changed = true;\n        }\n        continue;\n      }`,
  "history synchronization candidate and legacy merge"
);
service = replaceOnce(
  service,
  `      const updatedMessages = [...messages, message].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-60);`,
  `      const updatedMessages = dedupeConversationMessages([...messages, message]);`,
  "history synchronization final dedupe"
);
service = replaceOnce(
  service,
  `      const mensagens = [...(existing.mensagens || []), message].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-60);`,
  `      const mensagens = dedupeConversationMessages([...(existing.mensagens || []), message]);`,
  "fallback history dedupe"
);
await write("src/whatsappConversationService.js", service);

let engine = await read("src/whatsapp/v2/portalInsanoEngine.js");
engine = replaceOnce(
  engine,
  `  if (routedState.mode === "human" || routedState.serviceState === "HUMANO") {\n    if (isHumanReset(text) || command === "inicio" || command === "portal_voltar") {\n      return openMenu(resetToPortal(routedState, contract), contract, contract.welcome.menuId, "humanResetToPortal", []);\n    }\n    return humanState(routedState);\n  }`,
  `  if (routedState.mode === "human" || routedState.serviceState === "HUMANO") {\n    if (command === "inicio" || command === "portal_voltar") {\n      return openMenu(resetToPortal(routedState, contract), contract, contract.welcome.menuId, "humanResetToPortal", []);\n    }\n    return humanState(routedState);\n  }`,
  "human state explicit reset only"
);
engine = replaceOnce(
  engine,
  `  if (isPaymentClaim(text)) return startFlow(routedState, contract, "payment_receipt_review", "paymentSafety");\n  if (command) return handleNavigationCommand(routedState, contract, command);\n  if (isWelcome(text)) return openMenu(resetToPortal(routedState, contract), contract, contract.welcome.menuId, "welcomeFlow", []);\n  if (routedState.activeFlow) return handleActiveFlow(routedState, contract, text, message.text);\n  if (isXeriffeCatalogMenu(routedState.activeMenu)) return handleXeriffeCatalogMessage(routedState, menuCache, text);\n  if (isExternalPortalArea(routedState)) {\n    const selected = resolveMenuOption(contract.menus[routedState.activeMenu], text);\n    if (selected) return executeAction(routedState, contract, selected.action, selected.id, menuCache);\n    return openMenu(routedState, contract, routedState.activeMenu, "fallbackMenu", routedState.menuStack || []);\n  }\n  const currentScreen = currentNavigationScreen(routedState);`,
  `  if (isPaymentClaim(text)) return startFlow(routedState, contract, "payment_receipt_review", "paymentSafety");\n  if (command) return handleNavigationCommand(routedState, contract, command);\n  if (isWelcome(text) && routedState.activeFlow) return resumeActiveFlow(routedState, contract);\n  if (routedState.activeFlow) return handleActiveFlow(routedState, contract, text, message.text);\n  if (isXeriffeCatalogMenu(routedState.activeMenu)) return handleXeriffeCatalogMessage(routedState, menuCache, text);\n  if (isExternalPortalArea(routedState)) {\n    const selected = resolveMenuOption(contract.menus[routedState.activeMenu], text);\n    if (selected) return executeAction(routedState, contract, selected.action, selected.id, menuCache);\n    return openMenu(routedState, contract, routedState.activeMenu, "fallbackMenu", routedState.menuStack || []);\n  }\n  if (isWelcome(text) && isPortalHome(routedState, contract)) {\n    return openMenu(routedState, contract, contract.welcome.menuId, "welcomeFlow", []);\n  }\n  const currentScreen = currentNavigationScreen(routedState);`,
  "greeting preserves active context"
);
engine = replaceOnce(
  engine,
  `function humanState(state) {\n  return { handled: true, source: "humanState", nextState: state, replies: [], actions: [{ type: "notify_operator" }] };\n}`,
  `function resumeActiveFlow(state, contract) {\n  const flow = contract.flows[state.activeFlow];\n  const step = flow?.steps?.find((item) => item.id === state.activeStep);\n  const prompt = step?.prompt || flow?.initialMessage || "Seguimos deste ponto. Responde a informacao solicitada para continuar.";\n  return response("activeFlowGreeting", state, prompt);\n}\n\nfunction isPortalHome(state, contract) {\n  return !state.areaId\n    && !state.activeFlow\n    && state.mode !== "human"\n    && state.serviceState !== "HUMANO"\n    && (state.activeMenu || contract.welcome.menuId) === contract.welcome.menuId\n    && currentNavigationScreen(state) === "PORTAL_INSANO";\n}\n\nfunction humanState(state) {\n  return { handled: true, source: "humanState", nextState: state, replies: [], actions: [{ type: "notify_operator" }] };\n}`,
  "active flow resume helpers"
);
await write("src/whatsapp/v2/portalInsanoEngine.js", engine);

let v2Tests = await read("tests/whatsapp-v2-lab.test.js");
v2Tests = replaceOnce(
  v2Tests,
  `test("WhatsApp V2 lab permite reiniciar Portal com oi quando conversa estava em humano", async () => {\n  const engine = createLabEngine({ observeOnly: true });\n  const from = "5551000000006";\n  const state = createWhatsAppV2State(from);\n  state.mode = "human";\n  state.serviceState = "HUMANO";\n  state.navigationStack = ["PORTAL_INSANO", "INSANO_FOODTRUCK"];\n  await engine.conversationRepository.save(state);\n\n  const result = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-reset", from, text: "oi" });\n\n  assert.equal(result.state.mode, "bot");\n  assert.equal(result.state.serviceState, "AUTOMATICO");\n  assert.equal(result.replies[0].type, "menu");\n  assert.equal(result.replies[0].menu.id, "portal_main_menu");\n  assert.deepEqual(result.state.navigationStack, ["PORTAL_INSANO"]);\n});`,
  `test("WhatsApp V2 lab mantem humano com oi e exige comando explicito para reiniciar", async () => {\n  const engine = createLabEngine({ observeOnly: true });\n  const from = "5551000000006";\n  const state = createWhatsAppV2State(from);\n  state.mode = "human";\n  state.serviceState = "HUMANO";\n  state.navigationStack = ["PORTAL_INSANO", "INSANO_FOODTRUCK"];\n  await engine.conversationRepository.save(state);\n\n  const greeting = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-greeting", from, text: "oi" });\n  assert.equal(greeting.state.mode, "human");\n  assert.equal(greeting.state.serviceState, "HUMANO");\n  assert.equal(greeting.replies.length, 0);\n\n  const result = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-reset", from, text: "inicio" });\n  assert.equal(result.state.mode, "bot");\n  assert.equal(result.state.serviceState, "AUTOMATICO");\n  assert.equal(result.replies[0].type, "menu");\n  assert.equal(result.replies[0].menu.id, "portal_main_menu");\n  assert.deepEqual(result.state.navigationStack, ["PORTAL_INSANO"]);\n});`,
  "human greeting regression test"
);
await write("tests/whatsapp-v2-lab.test.js", v2Tests);

const dedupeTest = `import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

const PHONE = "5551980413745";
const TEXT = "Portal Insano\\nEscolha uma area para continuar:\\nInsano Food Truck\\nXeriffe Obirici\\nMais opcoes";

async function fixture(t, { historyCreatedAt = "2026-07-17T14:48:01.000Z" } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sambah-legacy-outbound-dedupe-"));
  const conversationsFile = join(dir, "whatsapp-conversas.json");
  const messagesFile = join(dir, "whatsapp-messages.json");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(conversationsFile, JSON.stringify({
    conversas: [{
      id: \`wa_\${PHONE}\`,
      nome: "Cliente",
      telefone: PHONE,
      status: "aguardando_cliente",
      mensagens: [{
        id: "msg-conversation-copy",
        direction: "out",
        type: "text",
        text: TEXT,
        createdAt: "2026-07-17T14:48:00.000Z",
        status: "sent"
      }],
      createdAt: "2026-07-17T14:47:59.000Z",
      updatedAt: "2026-07-17T14:48:00.000Z"
    }]
  }, null, 2), "utf8");
  await writeFile(messagesFile, JSON.stringify([{
    id: "out-history-copy-with-another-id",
    direction: "out",
    provider: "meta",
    phone: PHONE,
    customerName: "Cliente",
    messageId: "another-message-id",
    providerMessageId: "wamid-provider-menu",
    correlationId: "another-correlation-id",
    text: TEXT,
    status: "read",
    createdAt: historyCreatedAt
  }], null, 2), "utf8");
  return {
    conversationsFile,
    service: new WhatsAppConversationService({ filePath: conversationsFile, messagesFile })
  };
}

test("sincronizacao remove copia outbound legada com IDs diferentes e preserva metadados Meta", async (t) => {
  const f = await fixture(t);
  const result = await f.service.list();
  const outgoing = result.items[0].mensagens.filter((message) => message.direction === "out");
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].id, "msg-conversation-copy");
  assert.equal(outgoing[0].providerMessageId, "wamid-provider-menu");
  assert.equal(outgoing[0].status, "read");

  const stored = JSON.parse(await readFile(f.conversationsFile, "utf8"));
  assert.equal(stored.conversas[0].mensagens.filter((message) => message.direction === "out").length, 1);
});

test("mensagens outbound iguais em momentos diferentes continuam legitimas", async (t) => {
  const f = await fixture(t, { historyCreatedAt: "2026-07-17T14:49:00.000Z" });
  const result = await f.service.list();
  const outgoing = result.items[0].mensagens.filter((message) => message.direction === "out");
  assert.equal(outgoing.length, 2);
});
`;
await write("tests/whatsapp-legacy-outbound-dedupe.test.js", dedupeTest);

const resetTest = `import test from "node:test";
import assert from "node:assert/strict";
import { createWhatsAppV2State } from "../src/whatsapp/v2/conversationState.js";
import { routePortalInsanoMessage } from "../src/whatsapp/v2/portalInsanoEngine.js";

test("saudacao durante fluxo ativo repete o passo sem reiniciar o Portal", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "xeriffe_obirici";
  state.activeMenu = "xeriffe_services_menu";
  state.activeFlow = "xeriffe_reservation_request";
  state.activeStep = "reservation_details";
  state.awaitingInput = true;
  const result = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(result.source, "activeFlowGreeting");
  assert.equal(result.nextState.activeFlow, "xeriffe_reservation_request");
  assert.equal(result.nextState.activeStep, "reservation_details");
  assert.match(result.replies[0].text, /data, horario e quantidade de pessoas/i);
});

test("saudacao em submenu preserva o submenu em vez de voltar ao Portal", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "xeriffe_obirici";
  state.activeMenu = "xeriffe_services_menu";
  const result = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(result.nextState.activeMenu, "xeriffe_services_menu");
  assert.equal(result.nextState.areaId, "xeriffe_obirici");
  assert.equal(result.replies[0].menu.id, "xeriffe_services_menu");
});

test("modo humano ignora saudacao e somente inicio retorna ao automatico", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.mode = "human";
  state.serviceState = "HUMANO";
  const greeting = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(greeting.source, "humanState");
  assert.equal(greeting.nextState.mode, "human");
  assert.equal(greeting.replies.length, 0);

  const reset = routePortalInsanoMessage({ state, message: { text: "inicio" } });
  assert.equal(reset.nextState.mode, "bot");
  assert.equal(reset.nextState.serviceState, "AUTOMATICO");
  assert.equal(reset.replies[0].menu.id, "portal_main_menu");
});
`;
await write("tests/whatsapp-v2-reset-loop.test.js", resetTest);

console.log("WhatsApp stability patch applied deterministically.");
