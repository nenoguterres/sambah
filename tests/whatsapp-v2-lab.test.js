import test from "node:test";
import assert from "node:assert/strict";
import { adaptMetaWebhookV2 } from "../src/whatsapp/v2/metaWebhookAdapter.js";
import { createWhatsAppV2LabEngine } from "../src/whatsapp/v2/whatsappV2LabEngine.js";
import { FakeWhatsAppV2MetaSender } from "../src/whatsapp/v2/fakeMetaSender.js";

test("WhatsApp V2 lab adapta payload Meta fake sem usar token ou webhook real", () => {
  const adapted = adaptMetaWebhookV2(metaPayload({ id: "wamid-v2-1", from: "5551000000001", text: { body: "oi" } }));
  assert.equal(adapted.type, "message");
  assert.equal(adapted.message.messageId, "wamid-v2-1");
  assert.equal(adapted.message.from, "5551000000001");
  assert.equal(adapted.message.text, "oi");
});

test("WhatsApp V2 lab trata status Meta como callback tecnico sem roteador", () => {
  const adapted = adaptMetaWebhookV2({
    entry: [{ changes: [{ value: { statuses: [{ id: "wamid-status-v2", status: "delivered", timestamp: "1783703000" }] } }] }]
  });
  assert.equal(adapted.type, "status");
  assert.equal(adapted.statuses.length, 1);
});

test("WhatsApp V2 lab deduplica messageId e envia no maximo uma resposta fake", async () => {
  const engine = createWhatsAppV2LabEngine();
  const message = { messageId: "wamid-v2-dedupe", from: "5551000000002", text: "oi", receivedAt: "2026-07-10T16:00:00.000Z" };
  const first = await engine.processor.handleIncoming(message);
  const second = await engine.processor.handleIncoming(message);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.repliesSent, 1);
  assert.equal(second.repliesSent, 0);
  assert.equal(engine.sender.sent.length, 1);
  assert.equal(engine.outboxRepository.list().length, 1);
});

test("WhatsApp V2 lab modo humano registra estado e nao responde mensagens seguintes", async () => {
  const engine = createWhatsAppV2LabEngine();
  const handoff = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-1", from: "5551000000003", text: "humano" });
  const afterHuman = await engine.processor.handleIncoming({ messageId: "wamid-v2-human-2", from: "5551000000003", text: "oi" });

  assert.equal(handoff.state.mode, "human");
  assert.equal(afterHuman.state.mode, "human");
  assert.equal(afterHuman.repliesSent, 0);
  assert.equal(engine.sender.sent.length, 1);
});

test("WhatsApp V2 lab sender fake falha sem chamar servico real e deixa outbox failed", async () => {
  const sender = new FakeWhatsAppV2MetaSender({ failNext: true });
  const engine = createWhatsAppV2LabEngine({ sender });
  const result = await engine.processor.handleIncoming({ messageId: "wamid-v2-fail-1", from: "5551000000004", text: "oi" });
  const outbox = engine.outboxRepository.list()[0];

  assert.equal(result.repliesSent, 0);
  assert.equal(sender.sent.length, 0);
  assert.equal(outbox.status, "failed");
  assert.equal(outbox.lastError, "FAKE_WHATSAPP_V2_SENDER_FAILURE");
});

test("WhatsApp V2 lab observeOnly observa resposta sem criar outbox ou chamar sender", async () => {
  const sender = new FakeWhatsAppV2MetaSender();
  const engine = createWhatsAppV2LabEngine({ sender, observeOnly: true });
  const result = await engine.processor.handleIncoming({ messageId: "wamid-v2-observe-1", from: "5551000000005", text: "oi" });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "observe_only");
  assert.equal(result.repliesObserved, 1);
  assert.equal(result.repliesSent, 0);
  assert.equal(result.outboxId, null);
  assert.equal(sender.sent.length, 0);
  assert.equal(engine.outboxRepository.list().length, 0);
});

function metaPayload(message = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5500000000000", phone_number_id: "1234567890" },
          contacts: [{ profile: { name: "Cliente V2 Lab" }, wa_id: message.from }],
          messages: [{ timestamp: "1783703000", type: "text", ...message }]
        }
      }]
    }]
  };
}
