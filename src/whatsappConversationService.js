import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";
import { extractWhatsAppMessageText } from "./whatsapp/whatsappWebhookParser.js";
import { normalizeWhatsAppPhone, sameWhatsAppPhone, whatsappPhoneAliases } from "./whatsapp/phoneNumber.js";
import { dedupeConversationMessages } from "./whatsapp/conversationMessageDedupe.js";

const OPERATIONAL_STATUSES = new Set(["nova", "lida", "aguardando_equipe", "humano", "em_atendimento", "aguardando_cliente", "finalizada", "resolvido", "arquivada"]);
const HUMAN_STATUSES = new Set(["humano", "em_atendimento"]);
const MANUAL_SEND_ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

export class WhatsAppConversationService {
  constructor({ filePath, messagesFile = "", now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.messagesFile = messagesFile;
    this.now = now;
    this.mutationQueue = Promise.resolve();
  }

  async list() {
    try {
      return this.#listFromData(await this.#read());
    } catch (error) {
      console.info("whatsapp.conversations.list_failed", {
        status: "list_failed",
        error: String(error?.code || error?.message || error)
      });
      return this.#listFromData();
    }
  }

  async get(id) {
    try {
      const data = await this.#read();
      const conversation = findConversation(data.conversas, id);
      return conversation
        ? { ok: true, conversa: this.#withPriority({ ...conversation, mensagens: dedupeConversationMessages(conversation.mensagens) }) }
        : { ok: false, error: "Conversa nao encontrada" };
    } catch (error) {
      console.info("whatsapp.conversations.get_read_failed", {
        status: "get_read_failed",
        error: String(error?.code || error?.message || error)
      });
      return { ok: false, error: "Conversa nao encontrada" };
    }
  }

  async recordIncoming(payload = {}) {
    const incoming = parseWhatsAppIncoming(payload);
    return this.recordNeutralIncoming(incoming);
  }

  async recordNeutralIncoming(incoming = {}) {
    return this.#serializeMutation(() => this.#recordNeutralIncoming(incoming));
  }

  async #recordNeutralIncoming(incoming = {}) {
    const now = this.now().toISOString();
    const data = await this.#read();
    const telefone = normalizePhone(incoming.telefone || incoming.from || incoming.phone || "");
    const id = telefone ? `wa_${telefone}` : `wa_${crypto.randomUUID()}`;
    const existing = findConversation(data.conversas, telefone || id);
    const text = String(incoming.displayText || incoming.text || incoming.message || incoming.transcricao || "").trim();
    const incomingMessageId = String(incoming.messageId || "").trim();
    const provider = String(incoming.provider || "meta").trim() || "meta";
    const aliases = whatsappPhoneAliases(telefone);
    const existingMessage = findExistingInboundMessage(data.conversas, {
      provider,
      messageId: incomingMessageId,
      text,
      telefone,
      aliases
    });
    if (existingMessage) {
      const existingConversation = existingMessage.conversation || existing;
      return {
        ok: true,
        duplicate: true,
        conversa: this.#withPriority(existingConversation),
        message: existingMessage.message,
        engine: "disabled",
        automaticReplyCreated: false
      };
    }
    const message = {
      id: incomingMessageId || `msg_${crypto.randomUUID()}`,
      provider,
      providerMessageId: incomingMessageId || "",
      messageId: incomingMessageId || "",
      direction: "in",
      type: incoming.tipo || incoming.type || "text",
      text,
      transcricao: incoming.transcricao || "",
      mediaId: incoming.mediaId || "",
      rawType: incoming.rawType || incoming.type || "text",
      createdAt: now,
      status: "recebida"
    };
    const base = existing || {
      id,
      nome: preferredConversationName("", incoming.nome || incoming.profileName),
      telefone,
      operation: "Insano",
      origem: "whatsapp",
      mensagens: [],
      createdAt: now
    };
    const updated = {
      ...base,
      nome: preferredConversationName(base.nome, incoming.nome || incoming.profileName),
      telefone: telefone || base.telefone || "",
      id: telefone ? `wa_${telefone}` : base.id,
      ultimaMensagem: text || describeMessageType(message.type),
      ultimaInteracao: now,
      updatedAt: now,
      status: HUMAN_STATUSES.has(base.status) ? base.status : "nova",
      unread: true,
      lastInboundMessageId: message.id,
      respostaSugerida: "",
      automaticReplyCreated: false,
      whatsappEngine: "disabled",
      version: Number(base.version || 1) + 1,
      mensagens: [...(base.mensagens || []), message].slice(-60)
    };
    if (existing) data.conversas = data.conversas.map((item) => (item.id === existing.id ? updated : item));
    else data.conversas.push(updated);
    await this.#write(data);
    return {
      ok: true,
      conversa: this.#withPriority(updated),
      message,
      engine: "disabled",
      automaticReplyCreated: false
    };
  }

  async addOutgoing(id, body = {}, { runtimeConfig = {}, whatsappProvider = null } = {}) {
    return this.#serializeMutation(() => this.#addOutgoing(id, body, { runtimeConfig, whatsappProvider }));
  }

  async #addOutgoing(id, body = {}, { runtimeConfig = {}, whatsappProvider = null } = {}) {
    const now = this.now().toISOString();
    const text = String(body.text || body.message || "").trim();
    if (!text) return { ok: false, error: "Resposta vazia" };

    const rawManualSendId = String(body.manualSendId || body.correlationId || "").trim();
    const manualSendId = (rawManualSendId || `legacy:${crypto.createHash("sha256").update(`${id}:${text}`).digest("hex").slice(0, 24)}`).slice(0, 200);
    if (!MANUAL_SEND_ID_PATTERN.test(manualSendId)) return { ok: false, statusCode: 400, error: "manual_send_id_invalid" };

    let data = await this.#read();
    let index = findConversationIndex(data.conversas, id);
    if (index === -1) return { ok: false, statusCode: 404, error: "conversation_not_found", message: "Conversa nao encontrada" };

    const existingMessage = (data.conversas[index].mensagens || []).find((message) => (
      message.direction === "out"
      && (message.manualSendId === manualSendId || message.correlationId === manualSendId)
    ));
    if (existingMessage) {
      return {
        ok: true,
        duplicate: true,
        duplicated: true,
        enviado: Boolean(existingMessage.sent || existingMessage.status === "sent"),
        reason: existingMessage.status,
        sendResult: null,
        conversa: this.#withPriority(data.conversas[index]),
        message: existingMessage
      };
    }

    const message = {
      id: `msg_${crypto.randomUUID()}`,
      direction: "out",
      type: "text",
      text,
      manualSendId,
      correlationId: manualSendId,
      sent: false,
      createdAt: now,
      status: "sending",
      httpStatus: null,
      response: null,
      providerMessageId: "",
      errorCode: "",
      errorMessage: "",
      statusUpdatedAt: now
    };
    data.conversas[index] = {
      ...data.conversas[index],
      ultimaInteracao: now,
      updatedAt: now,
      version: Number(data.conversas[index].version || 1) + 1,
      mensagens: [...(data.conversas[index].mensagens || []), message].slice(-60)
    };
    await this.#write(data);

    let outgoing = null;
    try {
      outgoing = await sendOutgoingIfReady({ conversation: data.conversas[index], runtimeConfig, whatsappProvider, text });
    } catch (error) {
      outgoing = { sendResult: { sent: false, status: "send_failed", error: String(error?.message || error) }, status: "send_failed", conversationStatus: data.conversas[index].status };
    }

    data = await this.#read();
    index = findConversationIndex(data.conversas, id);
    const messageIndex = index >= 0 ? (data.conversas[index].mensagens || []).findIndex((item) => item.id === message.id) : -1;
    if (index === -1 || messageIndex === -1) return { ok: false, statusCode: 409, error: "reserved_message_not_found" };
    const persisted = data.conversas[index].mensagens[messageIndex];
    const updatedMessage = {
      ...persisted,
      sent: Boolean(outgoing.sendResult?.sent),
      status: outgoing.sendResult?.sent ? "sent" : outgoing.status || outgoing.sendResult?.status || "send_failed",
      providerMessageId: outgoing.sendResult?.providerMessageId || outgoing.sendResult?.response?.messages?.[0]?.id || persisted.providerMessageId || "",
      httpStatus: outgoing.sendResult?.httpStatus || null,
      response: sanitizeProviderResponse(outgoing.sendResult?.response || null),
      errorCode: outgoing.sendResult?.response?.error?.code || outgoing.sendResult?.error || "",
      errorMessage: outgoing.sendResult?.response?.error?.message || outgoing.sendResult?.error || "",
      statusUpdatedAt: this.now().toISOString()
    };
    const updatedMessages = [...(data.conversas[index].mensagens || [])];
    updatedMessages[messageIndex] = updatedMessage;
    const finalNow = this.now().toISOString();
    const updated = {
      ...data.conversas[index],
      status: outgoing.conversationStatus || data.conversas[index].status,
      ultimaInteracao: finalNow,
      updatedAt: finalNow,
      version: Number(data.conversas[index].version || 1) + 1,
      mensagens: updatedMessages
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return {
      ok: true,
      duplicate: false,
      duplicated: false,
      enviado: Boolean(outgoing.sendResult?.sent),
      reason: updatedMessage.status,
      sendResult: outgoing.sendResult,
      conversa: this.#withPriority(updated),
      message: updatedMessage
    };
  }

  async recordOutgoing(id, body = {}) {
    const data = await this.#read();
    const index = findConversationIndex(data.conversas, id);
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const text = String(body.text || body.message || "").trim();
    if (!text) return { ok: false, error: "Resposta vazia" };
    const correlationId = String(body.correlationId || "").trim();
    if (correlationId) {
      const existing = (data.conversas[index].mensagens || []).find((message) => message.direction === "out" && message.correlationId === correlationId);
      if (existing) return { ok: true, duplicate: true, enviado: existing.status === "sent", reason: existing.status, conversa: this.#withPriority(data.conversas[index]), message: existing };
    }
    const sendResult = body.sendResult || null;
    const sendStatus = body.status || sendResult?.status || "registrada";
    const providerMessageId = sendResult?.providerMessageId || sendResult?.response?.messages?.[0]?.id || "";
    const message = {
      id: `msg_${crypto.randomUUID()}`,
      direction: "out",
      type: "text",
      text,
      createdAt: now,
      status: sendStatus,
      correlationId,
      providerMessageId,
      httpStatus: sendResult?.httpStatus || null,
      response: sendResult?.response || null,
      errorCode: sendResult?.response?.error?.code || sendResult?.error || "",
      errorMessage: sendResult?.response?.error?.message || sendResult?.error || "",
      metaMessageType: sendResult?.metaMessageType || body.metaMessageType || "",
      fallbackUsed: Boolean(sendResult?.fallbackUsed)
    };
    const updated = {
      ...data.conversas[index],
      status: sendResult?.sent && data.conversas[index].status !== "humano" ? "aguardando_cliente" : data.conversas[index].status,
      ultimaInteracao: now,
      updatedAt: now,
      mensagens: [...(data.conversas[index].mensagens || []), message].slice(-60)
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, enviado: Boolean(sendResult?.sent), reason: sendStatus, conversa: this.#withPriority(updated), message };
  }

  async recordMetaStatus(status = {}) {
    const providerMessageId = String(status.id || "").trim();
    if (!providerMessageId) return { ok: false, updated: false, reason: "missing_status_id" };
    const recipientPhone = normalizePhone(status.recipient_id || status.recipientId || "");
    const data = await this.#read();
    let updated = false;
    const now = this.now().toISOString();
    data.conversas = data.conversas.map((conversation) => {
      const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
      const hasPhoneMatch = recipientPhone && sameWhatsAppPhone(conversation.telefone, recipientPhone);
      let conversationTouched = false;
      const nextMessages = messages.map((message) => {
        if (!matchesProviderMessageId(message, providerMessageId)) return message;
        conversationTouched = true;
        return {
          ...message,
          status: status.status || message.status,
          providerMessageId,
          recipientId: status.recipient_id || message.recipientId || "",
          deliveredAt: status.status === "delivered" ? metaTimestamp(status.timestamp) : message.deliveredAt || null,
          readAt: status.status === "read" ? metaTimestamp(status.timestamp) : message.readAt || null,
          failedAt: status.status === "failed" ? metaTimestamp(status.timestamp) : message.failedAt || null,
          statusUpdatedAt: now,
          statusPayload: sanitizeMetaStatus(status)
        };
      });
      if (!conversationTouched) return conversation;
      updated = true;
      return { ...conversation, updatedAt: conversationTouched ? now : conversation.updatedAt, mensagens: conversationTouched ? nextMessages : messages };
    });
    if (updated) await this.#write(data);
    return { ok: true, updated, providerMessageId, status: status.status || "" };
  }

  async markHuman(id) {
    return this.#updateStatus(id, "humano");
  }

  async markAutomatic(id) {
    return this.releaseConversation(id, { role: "ADMIN", username: "compat" });
  }

  async markResolved(id) {
    return this.resolveConversation(id, { role: "ADMIN", username: "compat" });
  }

  async markRead(id, actor = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => ({
      ...conversation,
      status: conversation.status === "nova" || conversation.status === "aguardando_equipe" ? "lida" : conversation.status,
      unread: false,
      lastReadMessageId: conversation.lastInboundMessageId || lastInboundMessage(conversation)?.id || "",
      readAt: now,
      readBy: actorName(actor),
      markedUnreadAt: null,
      markedUnreadBy: "",
      updatedAt: now,
      version: Number(conversation.version || 1) + 1
    })));
  }

  async markUnread(id, actor = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => ({
      ...conversation,
      unread: true,
      markedUnreadAt: now,
      markedUnreadBy: actorName(actor),
      updatedAt: now,
      version: Number(conversation.version || 1) + 1
    })));
  }

  async claimConversation(id, actor = {}, { expectedVersion = null } = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => {
      const conflict = checkVersion(conversation, expectedVersion);
      if (conflict) return conflict;
      const actorPhone = normalizePhone(actor.phone || actor.operatorPhone || "");
      if (!actorPhone) return { ok: false, statusCode: 401, error: "operator_required" };
      if (conversation.assignedOperatorPhone && !sameWhatsAppPhone(conversation.assignedOperatorPhone, actorPhone)) {
        return { ok: false, statusCode: 409, error: "conversation_already_claimed", conversa: this.#withPriority(conversation) };
      }
      if (conversation.assignedOperatorPhone && sameWhatsAppPhone(conversation.assignedOperatorPhone, actorPhone)) return { ...conversation };
      return {
        ...conversation,
        status: "em_atendimento",
        assignedOperatorId: actor.id || "",
        assignedOperatorPhone: actorPhone,
        assignedOperatorName: actor.displayName || actor.name || actor.username || "",
        assignedAt: now,
        updatedAt: now,
        version: Number(conversation.version || 1) + 1
      };
    }));
  }

  async releaseConversation(id, actor = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => {
      const actorPhone = normalizePhone(actor.phone || actor.operatorPhone || "");
      const isAdmin = String(actor.role || "").toUpperCase() === "ADMIN";
      if (conversation.assignedOperatorPhone && !isAdmin && !sameWhatsAppPhone(conversation.assignedOperatorPhone, actorPhone)) {
        return { ok: false, statusCode: 403, error: "conversation_release_forbidden" };
      }
      return {
        ...conversation,
        status: conversation.status === "em_atendimento" || conversation.status === "humano" ? "humano" : "aguardando_equipe",
        assignedOperatorId: "",
        assignedOperatorPhone: "",
        assignedOperatorName: "",
        assignedAt: null,
        updatedAt: now,
        version: Number(conversation.version || 1) + 1
      };
    }));
  }

  async transferConversation(id, actor = {}, targetOperator = {}, { expectedVersion = null } = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => {
      const conflict = checkVersion(conversation, expectedVersion);
      if (conflict) return conflict;
      const actorPhone = normalizePhone(actor.phone || actor.operatorPhone || "");
      const isAdmin = String(actor.role || "").toUpperCase() === "ADMIN";
      if (conversation.assignedOperatorPhone && !isAdmin && !sameWhatsAppPhone(conversation.assignedOperatorPhone, actorPhone)) {
        return { ok: false, statusCode: 403, error: "conversation_transfer_forbidden" };
      }
      const targetPhone = normalizePhone(targetOperator.phone || targetOperator.operatorPhone || "");
      if (!targetPhone) return { ok: false, statusCode: 400, error: "target_operator_required" };
      return {
        ...conversation,
        status: "em_atendimento",
        assignedOperatorId: targetOperator.id || "",
        assignedOperatorPhone: targetPhone,
        assignedOperatorName: targetOperator.name || targetOperator.displayName || targetOperator.username || "",
        assignedAt: now,
        updatedAt: now,
        version: Number(conversation.version || 1) + 1
      };
    }));
  }

  async resolveConversation(id, actor = {}, { expectedVersion = null } = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => {
      const conflict = checkVersion(conversation, expectedVersion);
      if (conflict) return conflict;
      return {
        ...conversation,
        status: "finalizada",
        unread: false,
        resolvedAt: now,
        resolvedBy: actorName(actor),
        updatedAt: now,
        version: Number(conversation.version || 1) + 1
      };
    }));
  }

  async reopenConversation(id, actor = {}, { expectedVersion = null } = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => {
      const conflict = checkVersion(conversation, expectedVersion);
      if (conflict) return conflict;
      return {
        ...conversation,
        status: conversation.assignedOperatorPhone ? "em_atendimento" : "nova",
        unread: true,
        resolvedAt: null,
        resolvedBy: "",
        reopenedAt: now,
        reopenedBy: actorName(actor),
        updatedAt: now,
        version: Number(conversation.version || 1) + 1
      };
    }));
  }

  async markWaitingCustomer(id, actor = {}, { expectedVersion = null } = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => {
      const conflict = checkVersion(conversation, expectedVersion);
      if (conflict) return conflict;
      return {
        ...conversation,
        status: "aguardando_cliente",
        waitingCustomerAt: now,
        waitingCustomerBy: actorName(actor),
        updatedAt: now,
        version: Number(conversation.version || 1) + 1
      };
    }));
  }

  async archiveConversation(id, actor = {}, { expectedVersion = null } = {}) {
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => {
      const conflict = checkVersion(conversation, expectedVersion);
      if (conflict) return conflict;
      return {
        ...conversation,
        status: "arquivada",
        unread: false,
        archivedAt: now,
        archivedBy: actorName(actor),
        updatedAt: now,
        version: Number(conversation.version || 1) + 1
      };
    }));
  }

  async resetOperationalQueue(actor = {}, resetVersion = "2.0.0") {
    if (String(actor.role || "").toUpperCase() !== "ADMIN") return { ok: false, statusCode: 403, error: "admin_required" };
    return this.#serializeMutation(async () => {
      const data = await this.#read();
      const now = this.now().toISOString();
      let archived = 0;
      data.conversas = data.conversas.map((conversation) => {
        if (["finalizada", "resolvido", "arquivada"].includes(conversation.status)) return conversation;
        archived += 1;
        return { ...conversation, status: "arquivada", unread: false, archivedAt: now, archivedBy: actorName(actor), updatedAt: now, version: Number(conversation.version || 1) + 1 };
      });
      data.operationalQueueResetVersion = resetVersion;
      data.operationalQueueResetAt = now;
      await this.#write(data);
      return { ok: true, alreadyApplied: false, archived, preservedMessages: true, resetVersion };
    });
  }

  async clearConversationHistory(id, actor = {}) {
    if (String(actor.role || "").toUpperCase() !== "ADMIN") return { ok: false, statusCode: 403, error: "admin_required" };
    return this.#serializeMutation(() => this.#mutateConversation(id, (conversation, now) => {
      const removed = Array.isArray(conversation.mensagens) ? conversation.mensagens.length : 0;
      return {
        ...conversation,
        mensagens: [],
        unread: false,
        lastInboundMessageId: "",
        lastReadMessageId: "",
        ultimaMensagem: "",
        ultimaInteracao: now,
        updatedAt: now,
        version: Number(conversation.version || 1) + 1,
        removedMessages: removed
      };
    }, { clearHistory: true }));
  }

  async patchConversation(id, patch = {}) {
    const data = await this.#read();
    const index = findConversationIndex(data.conversas, id);
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const allowedPatch = {
      assignedOperatorPhone: patch.assignedOperatorPhone || data.conversas[index].assignedOperatorPhone || "",
      assignedOperatorName: patch.assignedOperatorName || data.conversas[index].assignedOperatorName || "",
      callCenterStatus: patch.callCenterStatus || data.conversas[index].callCenterStatus || "",
      updatedAt: now
    };
    const updated = { ...data.conversas[index], ...allowedPatch };
    if (!updated.assignedOperatorId) delete updated.assignedOperatorId;
    if (!updated.assignedAt) delete updated.assignedAt;
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, conversa: this.#withPriority(data.conversas[index]) };
  }

  async deleteMessage(id, messageId) {
    const data = await this.#read();
    const index = findConversationIndex(data.conversas, id);
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const targetMessageId = String(messageId || "").trim();
    if (!targetMessageId) return { ok: false, error: "Mensagem nao informada" };
    const conversation = data.conversas[index];
    const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
    const removed = messages.find((message) => message.id === targetMessageId);
    if (!removed) return { ok: false, error: "Mensagem nao encontrada" };
    const nextMessages = messages.filter((message) => message.id !== targetMessageId);
    const lastInbound = [...nextMessages].reverse().find((message) => message.direction === "in");
    const lastMessage = nextMessages[nextMessages.length - 1];
    const now = this.now().toISOString();
    const updated = {
      ...conversation,
      mensagens: nextMessages,
      ultimaMensagem: lastInbound?.text || lastInbound?.transcricao || lastMessage?.text || describeMessageType(lastMessage?.type) || "",
      ultimaInteracao: now,
      updatedAt: now
    };
    data.conversas[index] = updated;
    await this.#write(data);
    return { ok: true, deleted: true, messageId: targetMessageId, removed: sanitizeDeletedMessage(removed), conversa: this.#withPriority(updated) };
  }

  async deleteConversation(id) {
    const data = await this.#read();
    const index = findConversationIndex(data.conversas, id);
    if (index === -1) return { ok: false, statusCode: 404, error: "conversation_not_found", message: "Conversa nao encontrada" };
    const conversation = data.conversas[index];
    const eligibility = conversationDeletionEligibility(conversation);
    if (!eligibility.canDelete) {
      return { ok: false, statusCode: 409, error: "conversation_not_deletable", message: "Conversa ativa nao pode ser excluida", reason: eligibility.reason };
    }
    data.conversas.splice(index, 1);
    await this.#write(data);
    return { ok: true, deleted: true, conversationId: conversation.id || id, reason: eligibility.reason };
  }

  async #updateStatus(id, status) {
    const data = await this.#read();
    const index = findConversationIndex(data.conversas, id);
    if (index === -1) return { ok: false, error: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    data.conversas[index] = { ...data.conversas[index], status: normalizeOperationalStatus(status), updatedAt: now, version: Number(data.conversas[index].version || 1) + 1 };
    await this.#write(data);
    return { ok: true, conversa: this.#withPriority(data.conversas[index]) };
  }

  async #mutateConversation(id, mutator, options = {}) {
    const data = await this.#read();
    const index = findConversationIndex(data.conversas, id);
    if (index === -1) return { ok: false, statusCode: 404, error: "conversation_not_found", message: "Conversa nao encontrada" };
    const now = this.now().toISOString();
    const result = mutator(data.conversas[index], now);
    if (result?.ok === false) return result;
    const removedMessages = Number(result?.removedMessages || 0);
    const next = { ...result };
    delete next.removedMessages;
    data.conversas[index] = next;
    await this.#write(data);
    const response = { ok: true, conversa: this.#withPriority(next) };
    if (options.clearHistory) response.removedMessages = removedMessages;
    return response;
  }

  #withPriority(conversation) {
    const last = new Date(conversation.ultimaInteracao || conversation.updatedAt || conversation.createdAt || this.now()).getTime();
    const minutes = Math.max(0, Math.floor((this.now().getTime() - last) / 60000));
    let prioridade = "normal";
    if (["finalizada", "resolvido", "arquivada"].includes(conversation.status)) prioridade = "baixa";
    else if (minutes >= 120) prioridade = "risco_de_perda";
    else if (minutes >= 30) prioridade = "alta";
    else if (minutes >= 15) prioridade = "media";
    else if (minutes >= 5) prioridade = "atencao";
    const deletion = conversationDeletionEligibility(conversation);
    return {
      ...conversation,
      canDelete: deletion.canDelete,
      deleteReason: deletion.reason,
      tempoParadoMinutos: minutes,
      prioridade,
      whatsappUrl: conversation.telefone ? `https://wa.me/${conversation.telefone}` : null
    };
  }

  async #read() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeConversationStore(parseConversationStore(raw));
    } catch (error) {
      if (error.code === "ENOENT") {
        const bootstrapped = await this.#bootstrapFromMessageHistory();
        await this.#write(bootstrapped);
        return bootstrapped;
      }
      throw error;
    }
  }

  #listFromData(data = { conversas: [] }) {
    const conversations = (Array.isArray(data.conversas) ? data.conversas : [])
      .filter(isPlainRecord)
      .map((item) => this.#withPriority({ ...item, mensagens: dedupeConversationMessages(item.mensagens) }));
    const summary = buildConversationSummary(conversations);
    return {
      ok: true,
      count: conversations.length,
      summary,
      items: conversations.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    };
  }

  async #write(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tmp, this.filePath);
  }

  async #serializeMutation(operation) {
    const run = this.mutationQueue.then(operation, operation);
    this.mutationQueue = run.catch(() => {});
    return run;
  }

  async #readMessageHistory() {
    try {
      const raw = await readFile(this.messagesFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async #bootstrapFromMessageHistory() {
    const history = await this.#readMessageHistory();
    const byPhone = new Map();
    const ordered = history
      .filter((message) => message && message.phone && message.createdAt)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const historyMessage of ordered) {
      const phone = normalizePhone(historyMessage.phone);
      if (!phone) continue;
      const id = `wa_${phone}`;
      const existing = byPhone.get(phone) || {
        id,
        nome: historyMessage.customerName || "Cliente WhatsApp",
        telefone: phone,
        operation: "Insano",
        origem: "whatsapp",
        mensagens: [],
        createdAt: historyMessage.createdAt,
        status: "aguardando_equipe",
        respostaSugerida: "",
        automaticReplyCreated: false,
        whatsappEngine: "fallback_history"
      };
      const text = String(historyMessage.text || "").trim();
      const message = {
        id: historyMessage.messageId || historyMessage.id || `history_${historyMessage.createdAt}_${phone}`,
        direction: historyMessage.direction === "out" ? "out" : "in",
        type: "text",
        text,
        transcricao: "",
        mediaId: "",
        rawType: "text",
        createdAt: historyMessage.createdAt,
        status: normalizeHistoryStatus(historyMessage),
        providerMessageId: historyMessage.providerMessageId || "",
        errorMessage: historyMessage.errorMessage || ""
      };
      const mensagens = dedupeConversationMessages([...(existing.mensagens || []), message]);
      const lastInbound = [...mensagens].reverse().find((item) => item.direction === "in");
      const lastMessage = mensagens[mensagens.length - 1];
      byPhone.set(phone, {
        ...existing,
        nome: existing.nome || historyMessage.customerName || "Cliente WhatsApp",
        ultimaMensagem: lastInbound?.text || lastMessage?.text || "Mensagem recebida",
        ultimaInteracao: lastInbound?.createdAt || lastMessage?.createdAt || historyMessage.createdAt,
        updatedAt: lastMessage?.createdAt || historyMessage.createdAt,
        mensagens
      });
    }
    return { conversas: [...byPhone.values()] };
  }
}

export function parseWhatsAppIncoming(payload = {}) {
  const metaValue = payload.entry?.[0]?.changes?.[0]?.value || {};
  const metaMessage = metaValue.messages?.[0];
  const contact = metaValue.contacts?.[0];
  const source = metaMessage || payload;
  const rawType = source.type || payload.messageType || "text";
  const tipo = normalizeMessageType(rawType);
  const text = String(metaMessage ? extractWhatsAppMessageText(metaMessage, payload) : source.message || source.text || source.body || payload.message || payload.text || "").trim();
  const displayText = text || describeIncomingPayload(source, tipo);
  const audio = source.audio || payload.audio || {};
  const media = source.audio || source.image || source.video || source.document || source.sticker || payload.media || {};
  const rawFrom = String(source.from || payload.from || payload.phone || payload.telefone || "").replace(/\D/g, "");
  const waId = String(contact?.wa_id || "").replace(/\D/g, "");
  return {
    messageId: source.id || payload.eventId || payload.messageId || "",
    telefone: normalizePhone(rawFrom),
    rawFrom,
    waId,
    sendTo: waId || rawFrom,
    phoneNumberIdReceived: String(metaValue.metadata?.phone_number_id || payload.phoneNumberIdReceived || "").trim(),
    nome: payload.name || payload.nome || contact?.profile?.name || "",
    profileName: contact?.profile?.name || "",
    tipo,
    rawType,
    text,
    displayText,
    caption: source.image?.caption || source.document?.caption || payload.caption || "",
    mediaId: media.id || audio.id || payload.media_id || payload.mediaId || "",
    mimeType: media.mime_type || payload.mimeType || "",
    fileName: source.document?.filename || payload.fileName || "",
    transcricao: payload.transcription || payload.transcricao || ""
  };
}

function normalizeMessageType(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (["text", "audio", "image", "video", "document", "interactive", "button", "order", "contacts", "location", "reaction", "sticker", "system", "unsupported"].includes(normalized)) return normalized;
  return "unknown";
}

function describeMessageType(type) {
  if (!type) return "";
  if (type === "audio") return "Audio recebido";
  if (type === "image") return "Imagem recebida";
  if (type === "video") return "Video recebido";
  if (type === "document") return "Documento recebido";
  if (type === "interactive") return "Mensagem interativa recebida";
  if (type === "contacts") return "Contato recebido";
  if (type === "location") return "Localizacao recebida";
  if (type === "reaction") return "Reacao recebida";
  if (type === "sticker") return "Figurinha recebida";
  if (type === "order") return "Pedido recebido";
  if (type === "system") return "Aviso do WhatsApp recebido";
  if (type === "unsupported" || type === "unknown") return "Mensagem recebida em formato nao reconhecido";
  return "Mensagem recebida";
}

function describeIncomingPayload(source = {}, type = "") {
  if (type === "contacts") {
    const contact = Array.isArray(source.contacts) ? source.contacts[0] : null;
    const name = String(contact?.name?.formatted_name || contact?.name?.first_name || "").trim();
    return name ? `Contato recebido: ${name}` : "Contato recebido";
  }
  if (type === "location") {
    const location = source.location || {};
    const label = String(location.name || location.address || "").trim();
    if (label) return `Localizacao recebida: ${label}`;
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return `Localizacao recebida: ${latitude}, ${longitude}`;
  }
  if (type === "reaction") {
    const emoji = String(source.reaction?.emoji || "").trim();
    return emoji ? `Reacao recebida: ${emoji}` : "Reacao removida";
  }
  if (type === "document") {
    const fileName = String(source.document?.filename || "").trim();
    if (fileName) return `Documento recebido: ${fileName}`;
  }
  return describeMessageType(type);
}

function preferredConversationName(current = "", incoming = "") {
  const currentName = String(current || "").trim();
  const incomingName = String(incoming || "").trim();
  const placeholder = ["", "cliente whatsapp", "contato whatsapp", "unknown", "desconhecido"].includes(currentName.toLowerCase());
  if (incomingName && placeholder) return incomingName;
  return currentName || incomingName || "Cliente WhatsApp";
}

function sanitizeDeletedMessage(message = {}) {
  return { id: message.id || "", direction: message.direction || "", type: message.type || "", createdAt: message.createdAt || "" };
}

function normalizeHistoryStatus(message = {}) {
  if (message.direction === "out" && message.status === "missing_meta_config") return "nao_enviada_configuracao_meta";
  if (message.direction === "out") return message.status || "registrada";
  return message.status || "recebida";
}

function sameHistoryMessage(message = {}, historyMessage = {}, messageId = "") {
  const messageDirection = message.direction === "out" ? "out" : "in";
  const historyDirection = historyMessage.direction === "out" ? "out" : "in";
  if (messageDirection !== historyDirection) return false;

  const currentIdentifiers = conversationMessageIdentifiers(message);
  const historyIdentifiers = conversationMessageIdentifiers(historyMessage, messageId);
  for (const identifier of currentIdentifiers) {
    if (historyIdentifiers.has(identifier)) return true;
  }
  return false;
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

async function sendOutgoingIfReady({ conversation = {}, runtimeConfig = {}, whatsappProvider = null, text = "" } = {}) {
  const enabled = runtimeConfig.whatsappBusiness?.sendEnabled === true;
  const hasCredentials = Boolean(runtimeConfig.whatsappBusiness?.accessToken && runtimeConfig.whatsappBusiness?.phoneNumberId);
  const canSend = Boolean(enabled && hasCredentials && whatsappProvider && conversation.telefone);
  if (canSend) {
    const sendResult = await whatsappProvider.sendText({ to: conversation.telefone, text });
    return { sendResult, status: sendResult?.status || "envio_real_indisponivel", conversationStatus: sendResult?.sent && conversation.status !== "humano" ? "aguardando_cliente" : conversation.status };
  }
  return { sendResult: null, status: enabled && hasCredentials ? "envio_real_indisponivel" : "registrada_sem_envio", conversationStatus: enabled && !hasCredentials ? "erro_configuracao" : conversation.status };
}

function conversationDeletionEligibility(conversation = {}) {
  const messages = Array.isArray(conversation.mensagens) ? conversation.mensagens : [];
  const status = normalizeText(conversation.status || "");
  const origem = normalizeText(conversation.origem || conversation.source || "");
  if (messages.length === 0) return { canDelete: true, reason: "sem_mensagens" };
  if (conversation.teste === true || conversation.test === true || status === "teste" || origem === "teste") return { canDelete: true, reason: "marcada_como_teste" };
  if (["arquivada", "arquivado", "inativa", "inativo"].includes(status)) return { canDelete: true, reason: "inativa_ou_arquivada" };
  if (["resolvido", "desconhecido"].includes(status)) return { canDelete: true, reason: "sem_vinculo_operacional" };
  return { canDelete: false, reason: "conversa_ativa" };
}

function normalizePhone(value = "") {
  return normalizeWhatsAppPhone(value);
}

function findConversation(conversations = [], idOrPhone = "") {
  const index = findConversationIndex(conversations, idOrPhone);
  return index >= 0 ? conversations[index] : null;
}

function findConversationIndex(conversations = [], idOrPhone = "") {
  const raw = String(idOrPhone || "");
  const normalized = normalizePhone(raw.replace(/^wa_/, ""));
  const ids = new Set([raw, normalized ? `wa_${normalized}` : ""]);
  const aliases = whatsappPhoneAliases(normalized || raw);
  return conversations.findIndex((item) => {
    if (ids.has(item.id)) return true;
    return aliases.some((alias) => sameWhatsAppPhone(item.telefone, alias) || item.id === `wa_${alias}`);
  });
}

function matchesProviderMessageId(message = {}, providerMessageId = "") {
  if (!providerMessageId) return false;
  if (message.providerMessageId === providerMessageId) return true;
  if (message.messageId === providerMessageId) return true;
  const responseMessages = Array.isArray(message.response?.messages) ? message.response.messages : [];
  return responseMessages.some((item) => item?.id === providerMessageId);
}

function metaTimestamp(value = "") {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function sanitizeMetaStatus(status = {}) {
  return {
    id: status.id || "",
    status: status.status || "",
    timestamp: status.timestamp || "",
    recipient_id: status.recipient_id || "",
    errors: Array.isArray(status.errors) ? status.errors.map((error) => ({ code: error.code, title: error.title, message: error.message })) : []
  };
}

function sanitizeProviderResponse(response = null) {
  if (!response || typeof response !== "object") return response;
  return JSON.parse(JSON.stringify(response));
}

function findExistingInboundMessage(conversations = [], { provider = "meta", messageId = "", text = "", telefone = "", aliases = [] } = {}) {
  const normalizedMessageId = String(messageId || "").trim();
  const phoneAliases = aliases.length ? aliases : whatsappPhoneAliases(telefone);
  const targetConversations = conversations.filter((conversation) => (
    phoneAliases.length === 0 || phoneAliases.some((alias) => sameWhatsAppPhone(conversation.telefone, alias) || conversation.id === `wa_${alias}`)
  ));
  for (const conversation of targetConversations) {
    for (const message of Array.isArray(conversation.mensagens) ? conversation.mensagens : []) {
      if (message.direction !== "in") continue;
      if (normalizedMessageId) {
        const sameProvider = String(message.provider || "meta") === provider;
        if (sameProvider && (message.id === normalizedMessageId || message.messageId === normalizedMessageId || message.providerMessageId === normalizedMessageId)) {
          return { conversation, message };
        }
      }
      if (!normalizedMessageId && text && message.text === text && message.createdAt) {
        return { conversation, message };
      }
    }
  }
  return null;
}

function lastInboundMessage(conversation = {}) {
  return [...(Array.isArray(conversation.mensagens) ? conversation.mensagens : [])].reverse().find((message) => message.direction === "in") || null;
}

function normalizeOperationalStatus(status = "") {
  const normalized = String(status || "").trim();
  if (OPERATIONAL_STATUSES.has(normalized)) return normalized;
  if (normalized === "lida" || normalized === "automatico" || normalized === "auto") return "aguardando_equipe";
  return "aguardando_equipe";
}

function actorName(actor = {}) {
  return actor.username || actor.displayName || actor.name || actor.phone || actor.operatorPhone || "sistema";
}

function checkVersion(conversation = {}, expectedVersion = null) {
  if (expectedVersion === null || expectedVersion === undefined || expectedVersion === "") return null;
  const expected = Number(expectedVersion);
  if (!Number.isFinite(expected) || expected <= 0) return null;
  if (Number(conversation.version || 1) === expected) return null;
  return {
    ok: false,
    statusCode: 409,
    error: "conversation_version_conflict",
    conversa: conversation
  };
}

function buildConversationSummary(conversations = []) {
  const historyStatuses = new Set(["finalizada", "resolvido", "arquivada"]);
  return {
    all: conversations.length,
    queue: conversations.filter((item) => !historyStatuses.has(item.status)).length,
    history: conversations.filter((item) => historyStatuses.has(item.status)).length,
    unread: conversations.filter((item) => item.unread === true).length,
    human: conversations.filter((item) => item.status === "humano").length,
    inProgress: conversations.filter((item) => item.status === "em_atendimento").length,
    resolved: conversations.filter((item) => ["finalizada", "resolvido"].includes(item.status)).length
  };
}

function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function parseConversationStore(raw = "") {
  const text = stripBom(raw) || "{}";
  try {
    return JSON.parse(text);
  } catch (error) {
    const position = extractJsonErrorPosition(error);
    if (!Number.isInteger(position) || position <= 0) throw error;
    const recovered = JSON.parse(text.slice(0, position));
    console.info("whatsapp.conversations.recovered_trailing_json", {
      status: "recovered_trailing_json",
      position
    });
    return recovered;
  }
}

function normalizeConversationStore(parsed = {}) {
  const input = Array.isArray(parsed.conversas) ? parsed.conversas.filter(isPlainRecord) : [];
  const byPhone = new Map();
  const loose = [];
  for (const item of input) {
    const normalized = normalizeConversationRecord(item);
    const phone = normalizePhone(normalized.telefone || normalized.id?.replace(/^wa_/, "") || "");
    if (!phone) {
      loose.push(normalized);
      continue;
    }
    const aliases = whatsappPhoneAliases(phone);
    const existingKey = [...byPhone.keys()].find((key) => aliases.some((alias) => sameWhatsAppPhone(key, alias)));
    if (!existingKey) {
      byPhone.set(phone, { ...normalized, telefone: normalized.telefone || phone, id: normalized.id || `wa_${phone}` });
      continue;
    }
    byPhone.set(existingKey, mergeConversationRecords(byPhone.get(existingKey), normalized));
  }
  return { ...parsed, conversas: [...byPhone.values(), ...loose] };
}

function normalizeConversationRecord(item = {}) {
  const messages = dedupeConversationMessages(Array.isArray(item.mensagens) ? item.mensagens : []);
  const lastInbound = [...messages].reverse().find((message) => message.direction === "in");
  const lastMessage = messages[messages.length - 1];
  const status = normalizeOperationalStatus(item.status);
  const unread = typeof item.unread === "boolean"
    ? item.unread
    : Boolean(lastInbound && item.lastReadMessageId !== (item.lastInboundMessageId || lastInbound.id));
  return {
    ...item,
    id: item.id || (item.telefone ? `wa_${normalizePhone(item.telefone)}` : `wa_${crypto.randomUUID()}`),
    nome: item.nome || "Cliente WhatsApp",
    telefone: item.telefone || "",
    status,
    unread,
    lastInboundMessageId: item.lastInboundMessageId || lastInbound?.id || "",
    lastReadMessageId: item.lastReadMessageId || "",
    readAt: item.readAt || null,
    readBy: item.readBy || "",
    markedUnreadAt: item.markedUnreadAt || null,
    markedUnreadBy: item.markedUnreadBy || "",
    assignedOperatorId: item.assignedOperatorId || "",
    assignedOperatorPhone: item.assignedOperatorPhone || "",
    assignedOperatorName: item.assignedOperatorName || "",
    assignedAt: item.assignedAt || null,
    resolvedAt: item.resolvedAt || null,
    resolvedBy: item.resolvedBy || "",
    reopenedAt: item.reopenedAt || null,
    reopenedBy: item.reopenedBy || "",
    ultimaMensagem: item.ultimaMensagem || lastInbound?.text || lastMessage?.text || "",
    ultimaInteracao: item.ultimaInteracao || lastMessage?.createdAt || item.updatedAt || item.createdAt || "",
    createdAt: item.createdAt || item.updatedAt || new Date(0).toISOString(),
    updatedAt: item.updatedAt || item.ultimaInteracao || item.createdAt || new Date(0).toISOString(),
    version: Number.isFinite(Number(item.version)) && Number(item.version) > 0 ? Number(item.version) : 1,
    mensagens: messages
  };
}

function mergeConversationRecords(a = {}, b = {}) {
  const messages = dedupeConversationMessages([...(a.mensagens || []), ...(b.mensagens || [])])
    .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
  const newer = String(b.updatedAt || b.ultimaInteracao || "").localeCompare(String(a.updatedAt || a.ultimaInteracao || "")) > 0 ? b : a;
  return normalizeConversationRecord({
    ...a,
    ...newer,
    id: a.id || b.id,
    telefone: a.telefone || b.telefone,
    nome: a.nome && a.nome !== "Cliente WhatsApp" ? a.nome : b.nome || a.nome,
    unread: a.unread === true || b.unread === true,
    version: Math.max(Number(a.version || 1), Number(b.version || 1)),
    mensagens: messages
  });
}

function extractJsonErrorPosition(error = {}) {
  const match = String(error.message || "").match(/position\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
