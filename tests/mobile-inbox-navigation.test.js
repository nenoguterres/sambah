import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("layout móvel mantém lista rolável e conversa em tela separada", async () => {
  const css = await readFile("public/mobile-inbox.css", "utf8");
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.conversation-list\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.chat\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /body\.conversation-mobile-chat-open \.sidebar\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /body\.conversation-mobile-chat-open \.chat\s*\{[\s\S]*display:\s*grid/);
  assert.match(css, /touch-action:\s*pan-y/);
});

test("controlador móvel oferece abertura do chat e retorno à lista", async () => {
  const source = await readFile("public/mobile-inbox.js", "utf8");
  assert.match(source, /conversation-mobile-chat-open/);
  assert.match(source, /data-mobile-back/);
  assert.match(source, /← Conversas/);
  assert.match(source, /closest\("\.conversation-item"\)/);
  assert.match(source, /classList\.remove\("conversation-mobile-chat-open"\)/);
});

test("HTML carrega os recursos móveis após o controlador principal", async () => {
  const html = await readFile("public/conversas.html", "utf8");
  assert.match(html, /href="\/mobile-inbox\.css(?:\?[^"]*)?"/);
  assert.ok(html.search(/src="\/mobile-inbox\.js(?:\?[^"]*)?"/) > html.search(/src="\/conversas\.js(?:\?[^"]*)?"/));
});
