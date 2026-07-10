import test from "node:test";
import assert from "node:assert/strict";
import { createWhatsAppProvider } from "../src/whatsapp/whatsappProvider.js";
import { parseWhatsAppWebhookPayload } from "../src/whatsapp/whatsappWebhookParser.js";

test("provider mock registra mensagem sem chamar API externa", async () => {
  let logged = false;
  const provider = createWhatsAppProvider({
    config: { provider: "mock" },
    logger: { info: () => { logged = true; } }
  });
  const result = await provider.sendText({ to: "5551999999999", text: "teste" });
  assert.equal(result.ok, true);
  assert.equal(result.sent, false);
  assert.equal(result.provider, "mock");
  assert.equal(logged, true);
});

test("provider meta envia para endpoint oficial sem vazar token no retorno", async () => {
  let request = null;
  const provider = createWhatsAppProvider({
    config: {
      provider: "meta",
      phoneNumberId: "12345",
      accessToken: "token-secreto",
      apiVersion: "v21.0",
      verifyToken: "verify"
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ messages: [{ id: "wamid-1" }] }), { status: 200 });
    }
  });
  const status = provider.status();
  assert.equal(status.configured, true);
  assert.equal(status.accessTokenConfigured, true);
  const result = await provider.sendText({ to: "5551999999999", text: "Buenas" });
  assert.equal(result.ok, true);
  assert.equal(result.sent, true);
  assert.equal(result.providerMessageId, "wamid-1");
  assert.equal(request.url, "https://graph.facebook.com/v21.0/12345/messages");
  assert.match(request.options.headers.authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(result), /token-secreto/);
});

test("provider meta incompleto retorna configured false", () => {
  const provider = createWhatsAppProvider({
    config: {
      provider: "meta",
      phoneNumberId: "12345",
      accessToken: "",
      verifyToken: "verify"
    }
  });
  const status = provider.status();
  assert.equal(status.provider, "meta");
  assert.equal(status.configured, false);
  assert.equal(status.phoneNumberIdConfigured, true);
  assert.equal(status.accessTokenConfigured, false);
  assert.equal(status.verifyTokenConfigured, true);
  assert.doesNotMatch(JSON.stringify(status), /token-secreto/);
  assert.doesNotMatch(JSON.stringify(status), /"accessToken"\s*:/);
});

test("erro de envio Meta nao vaza access token", async () => {
  const provider = createWhatsAppProvider({
    config: {
      provider: "meta",
      phoneNumberId: "12345",
      accessToken: "token-super-secreto",
      apiVersion: "v21.0"
    },
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        message: "Invalid OAuth access token token-super-secreto access_token=token-super-secreto",
        access_token: "token-super-secreto",
        authorization: "Bearer token-super-secreto"
      }
    }), { status: 401 })
  });
  const result = await provider.sendText({ to: "5551999999999", text: "Buenas" });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, false);
  assert.equal(result.status, "meta_error");
  assert.doesNotMatch(serialized, /token-super-secreto/);
  assert.doesNotMatch(serialized, /Bearer token/i);
  assert.match(serialized, /\[masked\]/);
});

test("provider meta envia menu com ate tres opcoes como botoes", async () => {
  let request = null;
  const provider = createWhatsAppProvider({
    config: { provider: "meta", phoneNumberId: "12345", accessToken: "token-secreto" },
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ messages: [{ id: "wamid-buttons" }] }), { status: 200 });
    }
  });
  const result = await provider.sendMessage({
    to: "5551999999999",
    message: menuMessage([{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }])
  });
  assert.equal(result.sent, true);
  assert.equal(result.metaMessageType, "interactive_button");
  assert.equal(request.body.type, "interactive");
  assert.equal(request.body.interactive.type, "button");
  assert.equal(request.body.interactive.action.buttons.length, 3);
  assert.equal(request.body.interactive.action.buttons[0].reply.id, "a");
});

test("provider meta envia menu com mais de tres opcoes como lista", async () => {
  let request = null;
  const provider = createWhatsAppProvider({
    config: { provider: "meta", phoneNumberId: "12345", accessToken: "token-secreto" },
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ messages: [{ id: "wamid-list" }] }), { status: 200 });
    }
  });
  const result = await provider.sendMessage({
    to: "5551999999999",
    message: menuMessage([
      { id: "portal.foodtruck", title: "Insano Food Truck" },
      { id: "portal.xeriffe", title: "Xeriffe Obirici" },
      { id: "portal.granja", title: "Granja" },
      { id: "portal.tecnologia", title: "Tecnologia" }
    ])
  });
  assert.equal(result.sent, true);
  assert.equal(result.metaMessageType, "interactive_list");
  assert.equal(request.body.interactive.type, "list");
  assert.equal(request.body.interactive.action.sections[0].rows.length, 4);
  assert.equal(request.body.interactive.action.sections[0].rows[0].id, "portal.foodtruck");
});

test("provider meta usa texto numerado quando lista interativa falha", async () => {
  const requests = [];
  const provider = createWhatsAppProvider({
    config: { provider: "meta", phoneNumberId: "12345", accessToken: "token-secreto" },
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1) return new Response(JSON.stringify({ error: { code: 100, message: "invalid interactive" } }), { status: 400 });
      return new Response(JSON.stringify({ messages: [{ id: "wamid-fallback" }] }), { status: 200 });
    }
  });
  const result = await provider.sendMessage({
    to: "5551999999999",
    message: menuMessage([
      { id: "1", title: "Um", fallbackText: "1. Um" },
      { id: "2", title: "Dois", fallbackText: "2. Dois" },
      { id: "3", title: "Tres", fallbackText: "3. Tres" },
      { id: "4", title: "Quatro", fallbackText: "4. Quatro" }
    ])
  });
  assert.equal(result.sent, true);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.metaMessageType, "text_fallback");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].type, "interactive");
  assert.equal(requests[1].type, "text");
  assert.match(requests[1].text.body, /1\. Um/);
});

test("provider meta tenta nono digito brasileiro quando Meta recusa destinatario", async () => {
  const requests = [];
  const provider = createWhatsAppProvider({
    config: {
      provider: "meta",
      phoneNumberId: "12345",
      accessToken: "token-secreto",
      verifyToken: "verify"
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (requests.length === 1) {
        return new Response(JSON.stringify({
          error: {
            message: "(#131030) Recipient phone number not in allowed list",
            code: 131030
          }
        }), { status: 400 });
      }
      return new Response(JSON.stringify({ messages: [{ id: "wamid-retry" }] }), { status: 200 });
    }
  });
  const result = await provider.sendText({ to: "555180413745", text: "Buenas" });
  assert.equal(result.ok, true);
  assert.equal(result.sent, true);
  assert.equal(result.retried, true);
  assert.equal(result.originalTo, "555180413745");
  assert.equal(result.retryTo, "5551980413745");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].to, "555180413745");
  assert.equal(result.attempts[1].to, "5551980413745");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://graph.facebook.com/v25.0/12345/messages");
  assert.equal(requests[0].body.to, "555180413745");
  assert.equal(requests[1].body.to, "5551980413745");
});

test("provider meta tenta remover nono digito brasileiro quando Meta recusa destinatario", async () => {
  const requests = [];
  const provider = createWhatsAppProvider({
    config: {
      provider: "meta",
      phoneNumberId: "12345",
      accessToken: "token-secreto",
      verifyToken: "verify"
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (requests.length === 1) {
        return new Response(JSON.stringify({
          error: {
            message: "(#131030) Recipient phone number not in allowed list",
            code: 131030
          }
        }), { status: 400 });
      }
      return new Response(JSON.stringify({ messages: [{ id: "wamid-retry-sem-nono" }] }), { status: 200 });
    }
  });
  const result = await provider.sendText({ to: "5551980413745", text: "Buenas" });
  assert.equal(result.ok, true);
  assert.equal(result.sent, true);
  assert.equal(result.retried, true);
  assert.equal(result.originalTo, "5551980413745");
  assert.equal(result.retryTo, "555180413745");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].to, "5551980413745");
  assert.equal(result.attempts[1].to, "555180413745");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.to, "5551980413745");
  assert.equal(requests[1].body.to, "555180413745");
});

test("parser normaliza payload da Meta Cloud API", () => {
  const normalized = parseWhatsAppWebhookPayload(metaPayload({
    from: "5551999999999",
    id: "wamid-meta-1",
    type: "text",
    text: { body: "quero cardapio" }
  }));
  assert.equal(normalized.provider, "meta");
  assert.equal(normalized.source, "whatsapp");
  assert.equal(normalized.messageId, "wamid-meta-1");
  assert.equal(normalized.from, "5551999999999");
  assert.equal(normalized.customer.name, "Cliente Meta");
  assert.equal(normalized.message, "quero cardapio");
});

test("parser usa action_id interativo como fonte da verdade", () => {
  const normalized = parseWhatsAppWebhookPayload(metaPayload({
    from: "5551999999999",
    id: "wamid-meta-button",
    type: "interactive",
    interactive: {
      type: "button_reply",
      button_reply: { id: "portal.foodtruck", title: "Insano Food Truck" }
    }
  }));
  assert.equal(normalized.message, "portal.foodtruck");
});

function metaPayload(message) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: "Cliente Meta" }, wa_id: message.from }],
          messages: [message]
        }
      }]
    }]
  };
}

function menuMessage(options) {
  return {
    type: "menu",
    text: options.map((item, index) => item.fallbackText || `${index + 1}. ${item.title}`).join("\n"),
    menu: {
      id: "menu.test",
      title: "Menu Teste",
      body: "Escolha uma opcao:",
      options
    }
  };
}
