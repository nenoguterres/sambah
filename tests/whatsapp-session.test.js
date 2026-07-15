import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockWhatsAppProvider } from "../src/whatsapp/providers/mockProvider.js";
import { WhatsAppMessageService } from "../src/whatsapp/whatsappMessageService.js";

test("WhatsAppMessageService registra inbound sem draft, Mesa ou resposta automatica", async () => {
  const ctx = await createContext();
  try {
    const result = await ctx.service.handleIncoming({
      eventId: "wa-order-1",
      from: "51999999999",
      message: "me ve dois kachurrasco"
    });

    assert.equal(result.ok, true);
    assert.equal(result.engine, "disabled");
    assert.equal(result.reason, "whatsapp_v2_disabled");
    assert.equal(result.sent, false);
    assert.equal(result.automaticReplyCreated, false);
    assert.equal(result.responseText, "");
    assert.equal(result.intent, undefined);
    assert.equal(result.draft, undefined);
    assert.equal(result.mesa, undefined);

    const history = JSON.parse(await readFile(join(ctx.dir, "messages.json"), "utf8"));
    assert.equal(history.length, 1);
    assert.equal(history[0].direction, "in");
    assert.equal(history[0].text, "me ve dois kachurrasco");

    const sessions = await ctx.service.sessions();
    assert.equal(sessions.total, 0);
  } finally {
    await ctx.cleanup();
  }
});

test("CONFIRMAR e ALTERAR nao executam fluxo de pedido quando engine esta desabilitado", async () => {
  const ctx = await createContext();
  try {
    const confirmed = await ctx.service.handleIncoming({ eventId: "wa-confirm", from: "51988888888", message: "CONFIRMAR" });
    const changed = await ctx.service.handleIncoming({ eventId: "wa-alterar", from: "51988888888", message: "ALTERAR" });

    assert.equal(confirmed.engine, "disabled");
    assert.equal(changed.engine, "disabled");
    assert.equal(confirmed.route, undefined);
    assert.equal(changed.route, undefined);
    assert.equal(confirmed.responseText, "");
    assert.equal(changed.responseText, "");

    const history = JSON.parse(await readFile(join(ctx.dir, "messages.json"), "utf8"));
    assert.equal(history.length, 2);
    assert.deepEqual(history.map((item) => item.direction), ["in", "in"]);
  } finally {
    await ctx.cleanup();
  }
});

test("pedidos de humano e evento tambem ficam somente registrados", async () => {
  const ctx = await createContext();
  try {
    const human = await ctx.service.handleIncoming({ eventId: "wa-human", from: "51977777777", message: "quero falar com Kazuko" });
    const event = await ctx.service.handleIncoming({ eventId: "wa-event", from: "51955555555", message: "quero food truck para aniversario" });

    assert.equal(human.engine, "disabled");
    assert.equal(event.engine, "disabled");
    assert.equal(human.intent, undefined);
    assert.equal(event.intent, undefined);
    assert.equal(human.responseText, "");
    assert.equal(event.responseText, "");

    const history = JSON.parse(await readFile(join(ctx.dir, "messages.json"), "utf8"));
    assert.equal(history.length, 2);
    assert.equal(history.some((item) => item.direction === "out"), false);
  } finally {
    await ctx.cleanup();
  }
});

test("WhatsAppMessageService coloca historico corrompido em quarentena e recria JSON valido", async () => {
  const ctx = await createContext();
  try {
    const messagesFile = join(ctx.dir, "messages.json");
    await writeFile(messagesFile, '[{"id":"old"}] lixo', "utf8");

    const result = await ctx.service.handleIncoming({
      eventId: "wamid-after-corrupt-history",
      from: "51999999991",
      message: "oi"
    });

    assert.equal(result.ok, true);
    const history = JSON.parse(await readFile(messagesFile, "utf8"));
    assert.equal(history.length, 1);
    assert.equal(history[0].messageId, "wamid-after-corrupt-history");
    const files = await readdir(ctx.dir);
    assert.equal(files.some((name) => name.startsWith("messages.json.corrupt-")), true);
  } finally {
    await ctx.cleanup();
  }
});

test("WhatsAppMessageService serializa inbounds concorrentes sem perder nem corromper mensagens", async () => {
  const ctx = await createContext();
  try {
    await Promise.all(Array.from({ length: 30 }, (_, index) => ctx.service.handleIncoming({
      eventId: `wamid-concurrent-${index}`,
      from: "51999999992",
      message: `oi ${index}`
    })));

    const history = JSON.parse(await readFile(join(ctx.dir, "messages.json"), "utf8"));
    assert.equal(history.length, 30);
    assert.equal(new Set(history.map((message) => message.messageId)).size, 30);
  } finally {
    await ctx.cleanup();
  }
});

async function createContext() {
  const dir = await mkdtemp(join(tmpdir(), "sambha-wa-session-disabled-"));
  const service = new WhatsAppMessageService({
    provider: new MockWhatsAppProvider({ logger: { info: () => {} } }),
    sessionsFile: join(dir, "sessions.json"),
    messagesFile: join(dir, "messages.json")
  });
  return { dir, service, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
