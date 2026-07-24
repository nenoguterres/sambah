import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

function jsonResponse(body, ok = true) {
  return { ok, async json() { return body; } };
}

async function browserFixture() {
  const [html, controller] = await Promise.all([
    readFile("public/conversas.html", "utf8"),
    readFile("public/conversas.js", "utf8")
  ]);
  const dom = new JSDOM(html, {
    url: "https://api.insanofoodtruck.com.br/conversas",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  const calls = [];
  const registrations = [];
  const conversation = {
    id: "wa_1",
    nome: "Cliente Teste",
    telefone: "5551999999999",
    status: "humano",
    unread: false,
    version: 3,
    ultimaMensagem: "Preciso de atendimento",
    ultimaInteracao: "2026-07-23T12:00:00.000Z",
    mensagens: [{ id: "in_1", direction: "in", text: "Preciso de atendimento", createdAt: "2026-07-23T12:00:00.000Z" }]
  };
  let deferRefresh = null;
  window.setInterval = () => 0;
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      async register(url) {
        registrations.push(url);
        return {};
      }
    }
  });
  window.scrollTo = () => {};
  window.fetch = async (url, options = {}) => {
    const path = String(url);
    calls.push({ path, options });
    if (path === "/api/auth/me") return jsonResponse({ user: { role: "ADMIN", username: "neno" } });
    if (path === "/admin/whatsapp/status") return jsonResponse({ configured: true, sendEnabled: true, receivingActive: true });
    if (path === "/api/conversas") {
      if (deferRefresh) return deferRefresh.promise;
      return jsonResponse({
        ok: true,
        count: 1,
        summary: { all: 1, unread: 0, human: 1, inProgress: 0, resolved: 0 },
        items: [conversation]
      });
    }
    if (path === "/api/conversas/wa_1") return jsonResponse({ ok: true, conversa: conversation });
    if (path === "/api/conversas/wa_1/responder") return jsonResponse({ ok: true, enviado: true });
    if (path === "/api/call-center/alerts?unreadOnly=true") return jsonResponse({ alerts: [] });
    return jsonResponse({ ok: true });
  };
  window.eval(controller);
  await tick();
  return {
    dom,
    window,
    calls,
    registrations,
    conversation,
    deferNextRefresh() {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      deferRefresh = { promise, resolve };
      return () => {
        deferRefresh = null;
        resolve(jsonResponse({
          ok: true,
          count: 1,
          summary: { all: 1, unread: 0, human: 1, inProgress: 0, resolved: 0 },
          items: [conversation]
        }));
      };
    }
  };
}

test("DOM carrega um controlador, contadores do servidor e registra service worker", async (t) => {
  const fixture = await browserFixture();
  t.after(() => fixture.dom.window.close());
  const scripts = [...fixture.window.document.querySelectorAll("script[src]")].map((node) => node.getAttribute("src"));
  assert.deepEqual(scripts.filter((src) => src.includes("conversas")), ["/conversas.js"]);
  assert.equal(fixture.window.document.querySelector('[data-count="human"]').textContent, "1");
  assert.equal(fixture.window.document.querySelectorAll(".conversation-item").length, 1);
  assert.deepEqual(fixture.registrations, ["/sambah-conversas-sw.js"]);
  assert.equal(fixture.window.document.querySelector('link[rel="manifest"]').getAttribute("href"), "/sambah-conversas.webmanifest");
});

test("atualização preserva lista enquanto a API responde e filtro atua nos itens carregados", async (t) => {
  const fixture = await browserFixture();
  t.after(() => fixture.dom.window.close());
  const release = fixture.deferNextRefresh();
  fixture.window.document.querySelector("#refreshButton").click();
  await tick();
  assert.equal(fixture.window.document.querySelectorAll(".conversation-item").length, 1);
  fixture.window.document.querySelector('[data-filter="resolved"]').click();
  assert.equal(fixture.window.document.querySelectorAll(".conversation-item").length, 0);
  release();
  await tick();
});

test("rascunho sobrevive à troca de conversa e envio confirmado usa um manualSendId", async (t) => {
  const fixture = await browserFixture();
  t.after(() => fixture.dom.window.close());
  fixture.window.document.querySelector(".conversation-item").click();
  await tick();
  const textarea = fixture.window.document.querySelector("#replyText");
  textarea.value = "Resposta persistente";
  textarea.dispatchEvent(new fixture.window.Event("input", { bubbles: true }));
  assert.equal(fixture.window.localStorage.getItem("sambah:draft:neno:wa_1"), "Resposta persistente");
  textarea.dispatchEvent(new fixture.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await tick();
  const send = fixture.calls.find((call) => call.path.endsWith("/responder"));
  const payload = JSON.parse(send.options.body);
  assert.equal(payload.text, "Resposta persistente");
  assert.match(payload.manualSendId, /^manual:wa_1:/);
  assert.equal(fixture.window.localStorage.getItem("sambah:draft:neno:wa_1"), null);
});

test("abrir conversa não lida usa a API persistente de leitura", async (t) => {
  const fixture = await browserFixture();
  t.after(() => fixture.dom.window.close());
  fixture.conversation.unread = true;
  fixture.window.document.querySelector(".conversation-item").click();
  await tick();
  const read = fixture.calls.find((call) => call.path === "/api/conversas/wa_1/read");
  assert.equal(read.options.method, "POST");
});

test("service worker mostra push válido e confirma alerta ao clicar", async () => {
  const source = await readFile("public/sambah-conversas-sw.js", "utf8");
  const listeners = {};
  const notifications = [];
  const requests = [];
  const clients = {
    async matchAll() { return []; },
    async openWindow(url) { requests.push({ openWindow: url }); }
  };
  const context = {
    clients,
    self: {
      addEventListener(type, handler) { listeners[type] = handler; },
      registration: {
        async showNotification(title, options) { notifications.push({ title, options }); }
      },
      clients
    },
    fetch: async (url, options) => { requests.push({ url, options }); }
  };
  vm.runInNewContext(source, context);
  const payload = {
    type: "human_request",
    alertId: "alert_1",
    eventKey: "human_request:wa_1:wamid_1",
    conversationId: "wa_1",
    clientName: "Cliente",
    messagePreview: "Preciso de atendimento",
    url: "/conversas?conversationId=wa_1"
  };
  let pushWork;
  listeners.push({
    data: { json: () => payload },
    waitUntil(promise) { pushWork = promise; }
  });
  await pushWork;
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].options.tag, payload.eventKey);
  let clickWork;
  listeners.notificationclick({
    notification: { data: payload, close() {} },
    waitUntil(promise) { clickWork = promise; }
  });
  await clickWork;
  assert.ok(requests.some((item) => item.url === "/api/call-center/alerts/alert_1/acknowledge"));
  assert.ok(requests.some((item) => item.openWindow === payload.url));
});
