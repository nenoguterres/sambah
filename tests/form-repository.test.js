import test from "node:test";
import assert from "node:assert/strict";
import { buildFormLink, getFormDefinition } from "../src/forms/formRepository.js";

test("repositorio compartilha formulario completo de evento", () => {
  const form = getFormDefinition("evento");
  assert.equal(form.destination, "crm_events");
  assert.deepEqual(form.fields.filter((field) => field.required).map((field) => field.name), [
    "nome", "telefone", "dataEvento", "cidade", "local", "horarioInicio", "publicoPrevisto", "tipoEvento"
  ]);
});

test("link do formulario preserva conversa e telefone", () => {
  assert.equal(
    buildFormLink("evento", { baseUrl: "https://sambah.onrender.com/", conversationId: "wa_123", phone: "55123" }),
    "https://sambah.onrender.com/evento/insano?conversationId=wa_123&phone=55123"
  );
});
