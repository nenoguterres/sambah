import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CallCenterService } from "../src/callCenterService.js";

async function fixture(t, provider) {
  const dir = await mkdtemp(join(tmpdir(), "sambah-push-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return new CallCenterService({
    operatorsFile: join(dir, "call-center-operators.json"),
    alertsFile: join(dir, "call-center-alerts.json"),
    subscriptionsFile: join(dir, "call-center-push-subscriptions.json"),
    vapidPublicKey: "public",
    vapidPrivateKey: "private",
    webPushProvider: provider
  });
}

test("duas assinaturas recebem uma tentativa por evento e webhook repetido nao duplica", async (t) => {
  const calls = [];
  const provider = {
    setVapidDetails() {},
    async sendNotification(subscription) {
      calls.push(subscription.endpoint);
    }
  };
  const service = await fixture(t, provider);
  await service.savePushSubscription({ deviceId: "a", endpoint: "https://push/a", keys: { p256dh: "x", auth: "y" } }, { phone: "5551980413745", name: "Neno" });
  await service.savePushSubscription({ deviceId: "b", endpoint: "https://push/b", keys: { p256dh: "x", auth: "y" } }, { phone: "5551980413745", name: "Neno" });
  const conversation = { id: "wa_1", telefone: "5551999999999", nome: "Cliente", status: "humano", ultimaMensagem: "quero Neno", lastInboundMessageId: "wamid-push-1" };
  const first = await service.createAlert({ conversation, operator: { phone: "5551980413745", name: "Neno" } });
  const second = await service.createAlert({ conversation, operator: { phone: "5551980413745", name: "Neno" } });
  assert.equal(first.alert.deliveries.length, 2);
  assert.equal(calls.length, 2);
  assert.equal(second.duplicate, true);
});

test("nova mensagem recebida cria novo evento e acknowledge encerra a pendencia", async (t) => {
  const provider = {
    setVapidDetails() {},
    async sendNotification() {}
  };
  const service = await fixture(t, provider);
  await service.savePushSubscription({ deviceId: "a", endpoint: "https://push/a", keys: { p256dh: "x", auth: "y" } }, { phone: "5551980413745", name: "Neno" });
  const base = { id: "wa_1", telefone: "5551999999999", nome: "Cliente", status: "humano", ultimaMensagem: "primeira" };
  const first = await service.createAlert({ conversation: { ...base, lastInboundMessageId: "wamid-push-1" }, operator: { phone: "5551980413745", name: "Neno" } });
  const next = await service.createAlert({ conversation: { ...base, ultimaMensagem: "segunda", lastInboundMessageId: "wamid-push-2" }, operator: { phone: "5551980413745", name: "Neno" } });
  assert.notEqual(first.alert.id, next.alert.id);
  assert.equal((await service.listAlerts({ unreadOnly: true })).count, 2);
  const acknowledged = await service.acknowledgeAlert(first.alert.id, { phone: "5551980413745" });
  assert.equal(acknowledged.alert.status, "read");
  assert.equal((await service.listAlerts({ unreadOnly: true })).count, 1);
});

test("assinatura 410 e VAPID ausente nao derrubam alerta", async (t) => {
  const provider = {
    setVapidDetails() {},
    async sendNotification() {
      const error = new Error("gone");
      error.statusCode = 410;
      throw error;
    }
  };
  const service = await fixture(t, provider);
  await service.savePushSubscription({ deviceId: "gone", endpoint: "https://push/gone", keys: { p256dh: "x", auth: "y" } }, { phone: "5551980413745", name: "Neno" });
  const alert = await service.createAlert({ conversation: { id: "wa_2", telefone: "5551", status: "humano", lastInboundMessageId: "wamid-push-2", ultimaMensagem: "humano" }, operator: { phone: "5551980413745" } });
  assert.equal(alert.alert.deliveries[0].errorCode, "410");
  const subs = await service.listPushSubscriptions({ role: "ADMIN" });
  assert.equal(subs.subscriptions[0].enabled, false);

  const missing = new CallCenterService({ operatorsFile: service.operatorsFile, alertsFile: service.alertsFile, subscriptionsFile: service.subscriptionsFile, vapidPublicKey: "", vapidPrivateKey: "" });
  const missingAlert = await missing.createAlert({ conversation: { id: "wa_3", telefone: "5552", status: "humano", lastInboundMessageId: "wamid-push-3", ultimaMensagem: "humano" }, operator: { phone: "5551980413745" } });
  assert.equal(missingAlert.alert.deliveryStatus, "configuration_missing");
});
