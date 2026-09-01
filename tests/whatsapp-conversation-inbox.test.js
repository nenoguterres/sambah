import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService, parseWhatsAppIncoming } from "../src/whatsappConversationService.js";

test("Central descreve mensagem Meta nao textual sem exibir unknown", async () => {
  const parsed = parseWhatsAppIncoming({
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: "Cliente Figurinha" }, wa_id: "5551999999999" }],
          messages: [{ id: "wamid-sticker", from: "5551999999999", type: "sticker", sticker: { id: "media-sticker" } }]
        }
      }]
    }]
  });
  assert.equal(parsed.tipo, "sticker");
  assert.equal(parsed.text, "");
  assert.equal(parsed.displayText, "Figurinha recebida");
  assert.equal(parsed.nome, "Cliente Figurinha");
  assert.equal(parsed.mediaId, "media-sticker");
});

test("Central substitui nome generico pelo nome real enviado pela Meta", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambah-conversation-real-name-"));
  const filePath = join(dir, "conversas.json");
  const service = new WhatsAppConversationService({ filePath });
  try {
    await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid-name-1", text: "oi" });
    const result = await service.recordNeutralIncoming({ telefone: "5551999999999", messageId: "wamid-name-2", text: "voltei", profileName: "Gabriela" });
    assert.equal(result.conversa.nome, "Gabriela");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Conversas envia resposta manual pelo provider WhatsApp configurado", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-inbox-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551980413745",
      nome: "Cliente Teste",
      telefone: "5551980413745",
      status: "aguardando_equipe",
      mensagens: [],
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:00:00.000Z"
    }]
  }), "utf8");
  const sent = [];
  const service = new WhatsAppConversationService({ filePath });
  try {
    const result = await service.addOutgoing("wa_5551980413745", { text: "Buenas, sigo contigo." }, {
      runtimeConfig: {
        whatsappBusiness: {
          sendEnabled: true,
          accessToken: "token-test",
          phoneNumberId: "phone-test"
        }
      },
      whatsappProvider: {
        sendText: async (input) => {
          sent.push(input);
          return { ok: true, sent: true, status: "sent", httpStatus: 200, response: { messages: [{ id: "wamid-manual" }] } };
        }
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.enviado, true);
    assert.equal(result.message.status, "sent");
    assert.deepEqual(sent, [{ to: "5551980413745", text: "Buenas, sigo contigo." }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Central de Conversas registra resposta automatica ja enviada sem reenviar", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-auto-out-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551980413745",
      nome: "Cliente Teste",
      telefone: "5551980413745",
      status: "aguardando_equipe",
      mensagens: [{ id: "wamid-in", direction: "in", type: "text", text: "Ola", createdAt: "2026-06-30T10:00:00.000Z" }],
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:00:00.000Z"
    }]
  }), "utf8");
  const service = new WhatsAppConversationService({ filePath, now: () => new Date("2026-06-30T10:01:00.000Z") });
  try {
    const result = await service.recordOutgoing("wa_5551980413745", {
      text: "Buenas! Eu sou o SamBah.",
      sendResult: { ok: true, sent: true, status: "sent", httpStatus: 200, response: { messages: [{ id: "wamid-out" }] } }
    });
    assert.equal(result.ok, true);
    assert.equal(result.enviado, true);
    assert.equal(result.message.direction, "out");
    assert.equal(result.message.text, "Buenas! Eu sou o SamBah.");
    assert.equal(result.conversa.status, "aguardando_cliente");
    assert.equal(result.conversa.mensagens.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Conversas remove mensagem especifica do historico", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-delete-message-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551980413745",
      nome: "Cliente Teste",
      telefone: "5551980413745",
      status: "aguardando_equipe",
      ultimaMensagem: "Mensagem dois",
      mensagens: [
        { id: "msg-1", direction: "in", type: "text", text: "Mensagem um", createdAt: "2026-06-30T10:00:00.000Z" },
        { id: "msg-2", direction: "in", type: "text", text: "Mensagem dois", createdAt: "2026-06-30T10:02:00.000Z" }
      ],
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:02:00.000Z"
    }]
  }), "utf8");
  const service = new WhatsAppConversationService({ filePath, now: () => new Date("2026-06-30T10:03:00.000Z") });
  try {
    const result = await service.deleteMessage("wa_5551980413745", "msg-2");
    assert.equal(result.ok, true);
    assert.equal(result.messageId, "msg-2");
    assert.equal(result.removed.text, undefined);
    assert.equal(result.conversa.mensagens.length, 1);
    assert.equal(result.conversa.ultimaMensagem, "Mensagem um");
    const saved = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(saved.conversas[0].mensagens.length, 1);
    assert.equal(saved.conversas[0].mensagens[0].id, "msg-1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Conversas importa o histórico somente quando o arquivo oficial não existe", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-sync-history-"));
  const filePath = join(dir, "conversas.json");
  const messagesFile = join(dir, "messages.json");
  await writeFile(messagesFile, JSON.stringify([
    {
      id: "in-meta-1",
      direction: "in",
      provider: "meta",
      phone: "5551980413999",
      customerName: "Cliente Evento",
      messageId: "wamid-event-1",
      text: "tenho evento para 80 pessoas",
      status: "received",
      createdAt: "2026-07-01T11:58:55.635Z"
    },
    {
      id: "out-meta-1",
      direction: "out",
      provider: "meta",
      phone: "5551980413999",
      customerName: "Cliente Evento",
      messageId: "wamid-event-1",
      text: "Show! Recebi tua solicitacao de evento.",
      status: "missing_meta_config",
      createdAt: "2026-07-01T11:58:55.652Z"
    }
  ]), "utf8");
  const service = new WhatsAppConversationService({ filePath, messagesFile, now: () => new Date("2026-07-02T12:00:00.000Z") });
  try {
    const result = await service.list();
    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal(result.items[0].telefone, "5551980413999");
    assert.equal(result.items[0].ultimaMensagem, "tenho evento para 80 pessoas");
    assert.equal(result.items[0].mensagens.length, 2);
    assert.equal(result.items[0].mensagens[1].status, "nao_enviada_configuracao_meta");
    const saved = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(saved.conversas.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("arquivo oficial vazio permanece vazio mesmo com histórico secundário", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-official-empty-"));
  const filePath = join(dir, "conversas.json");
  const messagesFile = join(dir, "messages.json");
  await writeFile(filePath, JSON.stringify({ conversas: [] }), "utf8");
  await writeFile(messagesFile, JSON.stringify([{
    id: "history-only",
    direction: "in",
    phone: "5551980413999",
    text: "Não deve reaparecer",
    createdAt: "2026-07-01T12:00:00.000Z"
  }]), "utf8");
  try {
    const service = new WhatsAppConversationService({ filePath, messagesFile });
    const result = await service.list();
    assert.equal(result.count, 0);
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), { conversas: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mensagem excluída não reaparece após listagem nem nova instância", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-message-stays-deleted-"));
  const filePath = join(dir, "conversas.json");
  const messagesFile = join(dir, "messages.json");
  const conversation = {
    id: "wa_5551980413745",
    telefone: "5551980413745",
    status: "aguardando_equipe",
    mensagens: [{ id: "msg-delete", direction: "in", text: "Excluir", createdAt: "2026-07-01T12:00:00.000Z" }],
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z"
  };
  await writeFile(filePath, JSON.stringify({ conversas: [conversation] }), "utf8");
  await writeFile(messagesFile, JSON.stringify([{
    id: "msg-delete",
    messageId: "msg-delete",
    direction: "in",
    phone: conversation.telefone,
    text: "Excluir",
    createdAt: "2026-07-01T12:00:00.000Z"
  }]), "utf8");
  try {
    const service = new WhatsAppConversationService({ filePath, messagesFile });
    assert.equal((await service.deleteMessage(conversation.id, "msg-delete")).ok, true);
    assert.equal((await service.list()).items[0].mensagens.length, 0);
    const restarted = new WhatsAppConversationService({ filePath, messagesFile });
    assert.equal((await restarted.list()).items[0].mensagens.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("conversa excluída não reaparece após listagem nem nova instância", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-stays-deleted-"));
  const filePath = join(dir, "conversas.json");
  const messagesFile = join(dir, "messages.json");
  const conversation = {
    id: "wa_5551980413745",
    telefone: "5551980413745",
    status: "resolvido",
    mensagens: [{ id: "msg-old", direction: "in", text: "Teste", createdAt: "2026-07-01T12:00:00.000Z" }],
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z"
  };
  await writeFile(filePath, JSON.stringify({ conversas: [conversation] }), "utf8");
  await writeFile(messagesFile, JSON.stringify([{
    id: "msg-old",
    direction: "in",
    phone: conversation.telefone,
    text: "Teste",
    createdAt: "2026-07-01T12:00:00.000Z"
  }]), "utf8");
  try {
    const service = new WhatsAppConversationService({ filePath, messagesFile });
    assert.equal((await service.deleteConversation(conversation.id)).ok, true);
    assert.equal((await service.list()).count, 0);
    const restarted = new WhatsAppConversationService({ filePath, messagesFile });
    assert.equal((await restarted.list()).count, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Central de Conversas recupera JSON com lixo no final antes de gravar inbound", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-conversation-recover-json-"));
  const filePath = join(dir, "conversas.json");
  const valid = JSON.stringify({
    conversas: [{
      id: "wa_5551980413745",
      nome: "Cliente Teste",
      telefone: "5551980413745",
      status: "aguardando_equipe",
      mensagens: [],
      createdAt: "2026-06-30T10:00:00.000Z",
      updatedAt: "2026-06-30T10:00:00.000Z"
    }]
  });
  await writeFile(filePath, `${valid}\n${valid}`, "utf8");
  const service = new WhatsAppConversationService({ filePath, now: () => new Date("2026-07-11T20:39:14.000Z") });
  try {
    const result = await service.recordNeutralIncoming({
      telefone: "5551980413745",
      messageId: "wamid-recovered-inbound",
      text: "oi"
    });
    assert.equal(result.ok, true);
    assert.equal(result.duplicate, undefined);
    assert.equal(result.message.id, "wamid-recovered-inbound");
    const saved = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(saved.conversas.length, 1);
    assert.equal(saved.conversas[0].mensagens.at(-1).id, "wamid-recovered-inbound");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
