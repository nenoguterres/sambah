const LEGACY_OUTBOUND_WINDOW_MS = 5000;

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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compareCreatedAt(left = {}, right = {}) {
  return String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
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
