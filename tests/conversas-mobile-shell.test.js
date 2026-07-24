import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function loadController() {
  return readFile("public/sambah-shell-responsive.js", "utf8");
}

function executeController(source, { width = 1280, matches, withMatchMedia = true } = {}) {
  const calls = [];
  const window = {
    innerWidth: width,
    renderSambahShell(section) {
      calls.push(section);
    }
  };

  if (withMatchMedia) {
    window.matchMedia = (query) => ({
      matches: matches ?? width <= 820,
      media: query
    });
  }

  vm.runInNewContext(source, { window });
  return calls;
}

test("conversas não monta o menu geral no celular", async () => {
  const source = await loadController();
  assert.deepEqual(executeController(source, { width: 720, matches: true }), []);
});

test("conversas preserva o menu geral no desktop", async () => {
  const source = await loadController();
  assert.deepEqual(executeController(source, { width: 1366, matches: false }), ["atendimento"]);
});

test("fallback sem matchMedia também protege a largura móvel", async () => {
  const source = await loadController();
  assert.deepEqual(executeController(source, { width: 720, withMatchMedia: false }), []);
});

test("HTML carrega o controlador responsivo depois do shell", async () => {
  const html = await readFile("public/conversas.html", "utf8");
  const shellIndex = html.indexOf('src="/admin/assets/sambah-shell.js"');
  const controllerIndex = html.indexOf('src="/sambah-shell-responsive.js"');

  assert.ok(shellIndex >= 0);
  assert.ok(controllerIndex > shellIndex);
  assert.doesNotMatch(html, /renderSambahShell\("atendimento"\)/);
});
