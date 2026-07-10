import test from "node:test";
import assert from "node:assert/strict";
import { routeConversation } from "../src/operationRouter.js";

const expectedRoutes = {
  pedido: ["mesa", "orders", "high", false, "start_order"],
  cardapio: ["mesa", "catalog", "medium", false, "show_menu"],
  delivery: ["mesa", "delivery", "high", false, "delivery_flow"],
  retirada: ["mesa", "pickup", "medium", false, "pickup_flow"],
  local: ["mesa", "local", "medium", false, "onsite_flow"],
  evento: ["crm", "events", "high", false, "commercial_flow"],
  granja: ["granja", "sales", "medium", false, "granja_catalog"],
  financeiro: ["pay", "payments", "high", false, "payment_flow"],
  horario: ["info", "general", "low", false, "show_hours"],
  localizacao: ["info", "general", "low", false, "show_location"],
  humano: ["human", "support", "high", true, "handoff"],
  unknown: ["personality", "default", "low", false, "continue_dialog"]
};

for (const [intent, [module, queue, priority, requiresHuman, nextAction]] of Object.entries(expectedRoutes)) {
  test(`Operation Router roteia ${intent}`, () => {
    assert.deepEqual(routeConversation({ intent, confidence: 0.9, destination: "test" }), {
      module,
      queue,
      priority,
      requiresHuman,
      nextAction
    });
  });
}

test("Operation Router usa rota padrao para intent ausente ou desconhecida", () => {
  assert.deepEqual(routeConversation({ intent: "nao_mapeada" }), routeConversation({ intent: "unknown" }));
  assert.deepEqual(routeConversation(), routeConversation({ intent: "unknown" }));
});
