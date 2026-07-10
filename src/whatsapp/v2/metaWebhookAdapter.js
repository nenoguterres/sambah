export function adaptMetaWebhookV2(payload = {}) {
  const changes = collectChanges(payload);
  if (!changes.length) return { type: "invalid", reason: "missing_value" };

  const messages = [];
  const statuses = [];
  const invalid = [];
  let emptyCount = 0;

  for (const change of changes) {
    const value = change?.value;
    if (!value) {
      invalid.push({ reason: "missing_value" });
      continue;
    }
    if (Array.isArray(value.statuses) && value.statuses.length) {
      statuses.push(...value.statuses.map((status) => ({
        id: String(status.id || ""),
        status: String(status.status || ""),
        timestamp: String(status.timestamp || "")
      })));
      continue;
    }
    if (!Array.isArray(value.messages) || value.messages.length === 0) {
      emptyCount += 1;
      continue;
    }
    for (const incoming of value.messages) {
      const parsed = parseMessage(incoming);
      if (parsed.type === "message") messages.push(parsed.message);
      else invalid.push({ reason: parsed.reason });
    }
  }

  if (messages.length > 1 || (messages.length && (statuses.length || invalid.length || changes.length > 1))) {
    return { type: "batch", messages, statuses, invalid };
  }
  if (messages.length === 1) return { type: "message", message: messages[0] };
  if (statuses.length) return { type: "status", statuses };
  if (invalid.length) return { type: "invalid", reason: invalid[0].reason, invalid };
  if (emptyCount) return { type: "empty" };
  return { type: "invalid", reason: "unknown_payload" };
}

export function parseMetaTimestamp(timestamp) {
  if (timestamp === undefined || timestamp === null || timestamp === "") return new Date().toISOString();
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function collectChanges(payload = {}) {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  return entries.flatMap((entry) => (Array.isArray(entry?.changes) ? entry.changes : []));
}

function parseMessage(incoming = {}) {
  if (incoming.type !== "text" || !incoming.text?.body) return { type: "invalid", reason: "missing_text" };
  if (!incoming.id) return { type: "invalid", reason: "missing_message_id" };
  if (!incoming.from) return { type: "invalid", reason: "missing_phone" };
  const receivedAt = parseMetaTimestamp(incoming.timestamp);
  if (!receivedAt) return { type: "invalid", reason: "invalid_timestamp" };
  return {
    type: "message",
    message: {
      messageId: String(incoming.id),
      from: String(incoming.from),
      conversationId: String(incoming.from),
      text: String(incoming.text.body).trim(),
      receivedAt
    }
  };
}
