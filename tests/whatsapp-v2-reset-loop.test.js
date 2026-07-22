import test from "node:test";
import assert from "node:assert/strict";
import { createWhatsAppV2State } from "../src/whatsapp/v2/conversationState.js";
import { routePortalInsanoMessage } from "../src/whatsapp/v2/portalInsanoEngine.js";

test("saudacao durante fluxo ativo repete o passo sem reiniciar o Portal", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "xeriffe_obirici";
  state.activeMenu = "xeriffe_services_menu";
  state.activeFlow = "xeriffe_reservation_request";
  state.activeStep = "reservation_details";
  state.awaitingInput = true;
  const result = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(result.source, "activeFlowGreeting");
  assert.equal(result.nextState.activeFlow, "xeriffe_reservation_request");
  assert.equal(result.nextState.activeStep, "reservation_details");
  assert.match(result.replies[0].text, /data, horario e quantidade de pessoas/i);
});

test("saudacao em submenu preserva o submenu em vez de voltar ao Portal", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "xeriffe_obirici";
  state.activeMenu = "xeriffe_services_menu";
  const result = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(result.nextState.activeMenu, "xeriffe_services_menu");
  assert.equal(result.nextState.areaId, "xeriffe_obirici");
  assert.equal(result.replies[0].menu.id, "xeriffe_services_menu");
});

test("modo humano ignora saudacao e somente inicio retorna ao automatico", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.mode = "human";
  state.serviceState = "HUMANO";
  const greeting = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(greeting.source, "humanState");
  assert.equal(greeting.nextState.mode, "human");
  assert.equal(greeting.replies.length, 0);

  const reset = routePortalInsanoMessage({ state, message: { text: "inicio" } });
  assert.equal(reset.nextState.mode, "bot");
  assert.equal(reset.nextState.serviceState, "AUTOMATICO");
  assert.equal(reset.replies[0].menu.id, "portal_main_menu");
});
