import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CallCenterService } from "../src/callCenterService.js";
import { WhatsAppConversationService } from "../src/whatsappConversationService.js";

test("Call Center atribui conversa humana para atendente disponivel e gera alerta local", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-call-center-"));
  const operatorsFile = join(dir, "operators.json");
  const alertsFile = join(dir, "alerts.json");
  const service = new CallCenterService({
    operatorsFile,
    alertsFile,
    now: () => new Date("2026-07-06T12:00:00.000Z"),
    principal: { name: "Neno", phone: "5551980413745" },
    alertUrl: "http://127.0.0.1:3000/conversas"
  });

  try {
    const login = await service.login({ name: "Atendente Um", phone: "51999990000", pin: "1234" });
    assert.equal(login.ok, true);
    assert.equal(login.operator.status, "available");

    const routed = await service.routeIncoming({
      id: "wa_5551999999999",
      nome: "Cliente Teste",
      telefone: "5551999999999",
      ultimaMensagem: "quero falar com humano",
      unreadCount: 1
    });
    assert.equal(routed.ok, true);
    assert.equal(routed.operator.phone, "5551999990000");
    assert.equal(routed.conversationPatch.callCenterStatus, "conversation_assigned");
    assert.equal(routed.alert.alert.status, "unread");

    const alerts = await service.listAlerts({ phone: "51999990000", unreadOnly: true });
    assert.equal(alerts.count, 1);
    assert.match(alerts.alerts[0].message, /Nova mensagem aguardando resposta/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Conversas gravam atribuicao do Call Center sem alterar mensagens", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-call-center-conversation-"));
  const filePath = join(dir, "conversas.json");
  await writeFile(filePath, JSON.stringify({
    conversas: [{
      id: "wa_5551999999999",
      nome: "Cliente Teste",
      telefone: "5551999999999",
      status: "humano",
      mensagens: [{ id: "msg-1", direction: "in", text: "quero humano", createdAt: "2026-07-06T12:00:00.000Z" }],
      createdAt: "2026-07-06T12:00:00.000Z",
      updatedAt: "2026-07-06T12:00:00.000Z"
    }]
  }), "utf8");
  const conversations = new WhatsAppConversationService({ filePath, now: () => new Date("2026-07-06T12:01:00.000Z") });

  try {
    const result = await conversations.patchConversation("wa_5551999999999", {
      assignedOperatorPhone: "55519999990000",
      assignedOperatorName: "Atendente Um",
      callCenterStatus: "conversation_assigned"
    });
    assert.equal(result.ok, true);
    assert.equal(result.conversa.assignedOperatorName, "Atendente Um");
    assert.equal(result.conversa.mensagens.length, 1);

    const saved = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(saved.conversas[0].assignedOperatorPhone, "55519999990000");
    assert.deepEqual(Object.keys(saved.conversas[0]).filter((key) => key.startsWith("assigned") || key === "callCenterStatus").sort(), [
      "assignedOperatorName",
      "assignedOperatorPhone",
      "callCenterStatus"
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
