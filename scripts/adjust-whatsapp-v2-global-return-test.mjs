import { readFile, writeFile } from "node:fs/promises";

const path = "tests/whatsapp-v2-lab.test.js";
const content = await readFile(path, "utf8");
const before = `test("Portal Insano Evento obedece oi e portal insano como retorno global", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const from = "5551000000301";
  await engine.processor.handleIncoming({ messageId: "wamid-event-global-1", from, text: "oi" });
  await engine.processor.handleIncoming({ messageId: "wamid-event-global-2", from, text: "PORTAL_INSANO_FOODTRUCK" });
  await engine.processor.handleIncoming({ messageId: "wamid-event-global-3", from, text: "INSANO_EVENTO" });

  const oi = await engine.processor.handleIncoming({ messageId: "wamid-event-global-4", from, text: "oi" });
  assert.equal(oi.state.activeMenu, "portal_main_menu");
  assert.equal(oi.state.areaId, null);
  assert.equal(oi.state.foodtruckSubstate, null);
  assert.deepEqual(oi.state.navigationStack, ["PORTAL_INSANO"]);
  assert.equal(oi.replies[0].type, "menu");
  assert.notEqual(oi.replies[0].type, "url_button");

  await engine.processor.handleIncoming({ messageId: "wamid-event-global-5", from, text: "PORTAL_INSANO_FOODTRUCK" });
  await engine.processor.handleIncoming({ messageId: "wamid-event-global-6", from, text: "INSANO_EVENTO" });
  const portal = await engine.processor.handleIncoming({ messageId: "wamid-event-global-7", from, text: "portal insano" });
  assert.equal(portal.state.activeMenu, "portal_main_menu");
  assert.equal(portal.state.areaId, null);
  assert.equal(portal.state.foodtruckSubstate, null);
  assert.deepEqual(portal.state.navigationStack, ["PORTAL_INSANO"]);
  assert.equal(portal.replies[0].type, "menu");
  assert.notEqual(portal.replies[0].type, "url_button");
});`;
const after = `test("Portal Insano Evento preserva contexto com oi e aceita retorno global explicito", async () => {
  const engine = createLabEngine({ observeOnly: true });
  const from = "5551000000301";
  await engine.processor.handleIncoming({ messageId: "wamid-event-global-1", from, text: "oi" });
  await engine.processor.handleIncoming({ messageId: "wamid-event-global-2", from, text: "PORTAL_INSANO_FOODTRUCK" });
  await engine.processor.handleIncoming({ messageId: "wamid-event-global-3", from, text: "INSANO_EVENTO" });

  const greeting = await engine.processor.handleIncoming({ messageId: "wamid-event-global-4", from, text: "oi" });
  assert.equal(greeting.state.activeMenu, "foodtruck_main_menu");
  assert.equal(greeting.state.areaId, "insano_food_truck");
  assert.equal(greeting.state.foodtruckSubstate.target, "evento");
  assert.deepEqual(greeting.state.navigationStack, ["PORTAL_INSANO", "INSANO_FOODTRUCK", "INSANO_EVENTO"]);
  assert.equal(greeting.replies[0].type, "url_button");

  const portal = await engine.processor.handleIncoming({ messageId: "wamid-event-global-5", from, text: "portal insano" });
  assert.equal(portal.state.activeMenu, "portal_main_menu");
  assert.equal(portal.state.areaId, null);
  assert.equal(portal.state.foodtruckSubstate, null);
  assert.deepEqual(portal.state.navigationStack, ["PORTAL_INSANO"]);
  assert.equal(portal.replies[0].type, "menu");
  assert.notEqual(portal.replies[0].type, "url_button");
});`;

const first = content.indexOf(before);
if (first === -1) throw new Error("PATCH_TARGET_NOT_FOUND: event global return test");
if (content.indexOf(before, first + before.length) !== -1) throw new Error("PATCH_TARGET_NOT_UNIQUE: event global return test");
await writeFile(path, `${content.slice(0, first)}${after}${content.slice(first + before.length)}`, "utf8");
console.log("Event greeting regression contract adjusted.");
