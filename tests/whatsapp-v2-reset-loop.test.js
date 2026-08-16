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

test("saudacao recupera conversa presa pelo antigo botao Tecnologias e Fabric", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.activeFlow = "assisted_intake";
  state.activeStep = "objective";
  state.awaitingInput = true;
  state.flowData.preAttendance = {
    intent: "geral",
    originalMessage: "Tecnologias e Fabric",
    answers: {}
  };
  const result = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(result.nextState.activeMenu, "business_main_menu");
  assert.equal(result.nextState.activeFlow, null);
  assert.equal(result.replies[0].menu.buttonText, "VER AREAS");
});

test("saudacao reinicia pre-atendimento geral orfao mesmo sem mensagem original", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.activeFlow = "assisted_intake";
  state.activeStep = "objective";
  state.awaitingInput = true;
  state.flowData.preAttendance = { intent: "geral", answers: {} };
  const result = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(result.source, "recoverOrphanGeneralIntake");
  assert.equal(result.nextState.activeMenu, "portal_main_menu");
  assert.equal(result.nextState.activeFlow, null);
  assert.equal(result.replies[0].menu.options[2].title, "Tecnologias e Fabricacao");
});

test("saudacao em submenu retorna ao Portal", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "xeriffe_obirici";
  state.activeMenu = "xeriffe_services_menu";
  const result = routePortalInsanoMessage({ state, message: { text: "oi" } });
  assert.equal(result.nextState.activeMenu, "portal_main_menu");
  assert.equal(result.nextState.areaId, null);
  assert.equal(result.replies[0].menu.id, "portal_main_menu");
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

test("texto cortado Voltar ao Portal Ins retorna sempre ao Portal Insano", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "comunicacao_visual";
  state.activeMenu = "business_main_menu";
  const result = routePortalInsanoMessage({ state, message: { text: "Voltar ao Portal Ins" } });
  assert.equal(result.nextState.activeMenu, "portal_main_menu");
  assert.equal(result.nextState.areaId, null);
  assert.equal(result.replies[0].menu.options[0].title, "Gastronomia");
});

test("frase natural Quero voltar ao Portal Insano zera o contexto", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "gastronomia";
  state.activeMenu = "gastronomy_main_menu";
  state.flowData = { previous: "contexto antigo" };
  const result = routePortalInsanoMessage({ state, message: { text: "Quero voltar ao Portal Insano" } });
  assert.equal(result.nextState.activeMenu, "portal_main_menu");
  assert.equal(result.nextState.areaId, null);
  assert.equal(result.nextState.activeFlow, null);
});

test("frase nova fora de pergunta ativa zera contexto anterior e abre o Portal principal", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "insano_food_truck";
  state.activeMenu = "foodtruck_main_menu";
  state.flowData = { old: "nao pode permanecer" };
  state.foodtruckSubstate = { selectedAction: "PORTAL_INSANO_FOODTRUCK", target: "evento" };
  state.navigationStack = ["PORTAL_INSANO", "INSANO_FOODTRUCK", "INSANO_EVENTO"];
  state.mesaOrderId = "pedido-antigo";
  state.xeriffeCommand.items = [{ productId: "produto-antigo" }];

  const result = routePortalInsanoMessage({ state, message: { text: "px" } });
  assert.equal(result.source, "freshPhraseReset");
  assert.equal(result.nextState.mode, "bot");
  assert.equal(result.nextState.serviceState, "AUTOMATICO");
  assert.equal(result.nextState.areaId, null);
  assert.equal(result.nextState.activeMenu, "portal_main_menu");
  assert.equal(result.nextState.activeFlow, null);
  assert.equal(result.nextState.foodtruckSubstate, null);
  assert.equal(result.nextState.mesaOrderId, null);
  assert.deepEqual(result.nextState.xeriffeCommand.items, []);
  assert.equal(result.nextState.flowData.old, undefined);
  assert.deepEqual(result.replies[0].menu.options.map((item) => item.title), ["Gastronomia", "Agro / Granja", "Tecnologias e Fabricacao"]);
});

test("resposta a pergunta ativa continua o fluxo sem zerar contexto", () => {
  const state = createWhatsAppV2State("5551980413745");
  state.areaId = "gastronomia";
  state.activeMenu = "gastronomy_main_menu";
  state.activeFlow = "assisted_intake";
  state.activeStep = "objective";
  state.awaitingInput = true;
  state.flowData.preAttendance = { intent: "geral", answers: {}, originalMessage: "preciso de ajuda" };
  const result = routePortalInsanoMessage({ state, message: { text: "quero um projeto novo" } });
  assert.equal(result.nextState.activeFlow, "assisted_intake");
  assert.equal(result.nextState.areaId, "gastronomia");
  assert.equal(result.nextState.flowData.preAttendance.answers.objective, "quero um projeto novo");
});
