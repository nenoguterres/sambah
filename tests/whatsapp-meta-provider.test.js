import assert from "node:assert/strict";
import test from "node:test";
import { WhatsAppMetaProvider } from "../src/whatsappMetaProvider.js";

test("WhatsApp Meta envia texto pelo endpoint oficial sem expor token", async () => {
  let request;
  const provider = new WhatsAppMetaProvider({
    config: {
      sendEnabled: true,
      accessToken: "token-secreto",
      phoneNumberId: "phone-123",
      apiVersion: "v21.0",
      apiBaseUrl: "https://graph.facebook.com"
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ messages: [{ id: "wamid.123" }] }), { status: 200 });
    }
  });

  const result = await provider.sendText({ to: "+55 (51) 99999-0000", text: "Buenas!" });
  assert.equal(result.sent, true);
  assert.equal(result.messageId, "wamid.123");
  assert.equal(request.url, "https://graph.facebook.com/v21.0/phone-123/messages");
  assert.equal(request.options.headers.authorization, "Bearer token-secreto");
  assert.deepEqual(JSON.parse(request.options.body), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "5551999990000",
    type: "text",
    text: { preview_url: false, body: "Buenas!" }
  });
  assert.doesNotMatch(JSON.stringify(result), /token-secreto/);
});

test("WhatsApp Meta bloqueia envio sem credenciais", async () => {
  const provider = new WhatsAppMetaProvider({ config: { sendEnabled: true } });
  const result = await provider.sendText({ to: "5551999990000", text: "Teste" });
  assert.equal(result.sent, false);
  assert.equal(result.error, "whatsapp_meta_not_configured");
});
