import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";
import { WhatsAppMessageService } from "../src/whatsapp/whatsappMessageService.js";

const PHONE = "5551980413745";
const CONVERSATION_ID = `wa_${PHONE}`;
const CREATED_AT = "2026-07-22T10:00:00.000Z";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "sambah-history-dedupe-"));
  const conversationsFile = join(directory, "whatsapp-conversas.json");
  const messagesFile = join(directory, "whatsapp-messages.json");

  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  return {
    directory,
    conversationsFile,
    messagesFile,
    conversationService: new WhatsAppConversationService({
      filePath: conversationsFile,
      messagesFile,
      now: () => new Date(CREATED_AT)
    }),
    messageService: new WhatsAppMessageService({
      provider: { status: () => ({ ok: true }) },
      messagesFile,
      sessionsFile: join(directory, "whatsapp-sessions.json"),
      now: () => new Date(CREATED_AT)
    })
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function baseConversation(messages = []) {
  return {
    id: CONVERSATION_ID,
    nome: "Cliente Teste",
    telefone: PHONE,
    status: "aguardando_cliente",
    origem: "whatsapp",
    mensagens: messages,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ultimaInteracao: CREATED_AT
  };
}

function manualOutgoing({
  id = "msg_manual_001",
  manualSendId = "manual_001",
  text = "Resposta unica"
} = {}) {
  return {
    id,
    direction: "out",
    type: "text",
    text,
    manualSendId,
    correlationId: manualSendId,
    providerMessageId: "",
    createdAt: CREATED_AT,
    status: "registrada_sem_envio"
  };
}

function historyOutgoing({
  id = "out_1721642400000_a1",
  messageId = "msg_manual_001",
  correlationId = "manual_001",
  text = "Resposta unica"
} = {}) {
  return {
    id,
    direction: "out",
    provider: "meta",
    phone: PHONE,
    customerName: "Cliente Teste",
    messageId,
    providerMessageId: "",
    correlationId,
    text,
    status: "registrada_sem_envio",
    createdAt: CREATED_AT
  };
}

test("reiniciar/listar nao recria balao manual ja existente no historico geral", async (t) => {
  const f = await fixture(t);
  await writeJson(f.conversationsFile, {
    conversas: [baseConversation([manualOutgoing()])]
  });
  await writeJson(f.messagesFile, [historyOutgoing()]);

  await f.conversationService.list();
  await f.conversationService.list();
  await f.conversationService.list();

  const stored = JSON.parse(await readFile(f.conversationsFile, "utf8"));
  const outgoing = stored.conversas[0].mensagens.filter((message) => message.direction === "out");
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].id, "msg_manual_001");
});

test("mensagens de saida realmente diferentes continuam sendo importadas uma unica vez", async (t) => {
  const f = await fixture(t);
  await writeJson(f.conversationsFile, {
    conversas: [baseConversation([manualOutgoing()])]
  });
  await writeJson(f.messagesFile, [
    historyOutgoing(),
    historyOutgoing({
      id: "out_1721642401000_b2",
      messageId: "msg_manual_002",
      correlationId: "manual_002",
      text: "Segunda resposta legitima"
    })
  ]);

  await f.conversationService.list();
  await f.conversationService.list();

  const stored = JSON.parse(await readFile(f.conversationsFile, "utf8"));
  const outgoing = stored.conversas[0].mensagens.filter((message) => message.direction === "out");
  assert.equal(outgoing.length, 2);
  assert.deepEqual(outgoing.map((message) => message.text).sort(), [
    "Resposta unica",
    "Segunda resposta legitima"
  ]);
});

test("historico geral bloqueia repeticao do mesmo envio de saida", async (t) => {
  const f = await fixture(t);
  await writeJson(f.messagesFile, []);

  const payload = {
    direction: "out",
    normalized: {
      provider: "meta",
      from: PHONE,
      customer: { name: "Cliente Teste", phone: PHONE },
      messageId: "msg_manual_003",
      correlationId: "manual_003",
      message: "Resposta protegida"
    },
    text: "Resposta protegida",
    sendResult: null
  };

  const first = await f.messageService.appendMessage(payload);
  const second = await f.messageService.appendMessage(payload);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);

  const stored = JSON.parse(await readFile(f.messagesFile, "utf8"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].messageId, "msg_manual_003");
});
