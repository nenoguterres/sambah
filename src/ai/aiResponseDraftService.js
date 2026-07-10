export class AiResponseDraftService {
  suggest({ classification = {}, route = {}, extractedData = {} } = {}) {
    if (classification.requiresHandoff || route.requiresHuman) {
      return buildDraft("Vou deixar isso com a equipe humana para seguir pelo canal certo.", "human_handoff");
    }

    switch (classification.intent) {
      case "pedido":
      case "delivery":
      case "retirada":
      case "local":
        return buildDraft("Posso organizar uma sugestao de atendimento para pedido, mas a confirmacao final fica com a equipe.", "order_flow", extractedData);
      case "cardapio":
        return buildDraft("Claro. Vou te ajudar com o cardapio. Me diz se tu quer ver lanches, assados, pizzas, pancho, hot dog, PanBagnat ou porcoes de boteco.", "menu_flow", extractedData);
      case "evento":
        return buildDraft("Posso registrar os dados principais do evento e encaminhar para a equipe continuar o atendimento.", "event_flow", extractedData);
      case "financeiro":
        return buildDraft("Certo. Vou encaminhar teu assunto para o financeiro do Insano conferir por fonte interna e seguir contigo.", "finance_flow", extractedData);
      case "horario":
        return buildDraft("Buenas! Vou conferir os horarios oficiais da operacao e te retorno pelo canal certo.", "info_flow", extractedData);
      case "localizacao":
        return buildDraft("Buenas! Vou buscar a localizacao oficial da operacao e te passo pelo canal certo.", "info_flow", extractedData);
      default:
        return buildDraft("Recebi tua mensagem e vou manter isso em atendimento assistido pela equipe.", "fallback", extractedData);
    }
  }
}

function buildDraft(text, reason, extractedData = {}) {
  return {
    source: "ai_response_draft_service",
    text,
    reason,
    extractedData
  };
}
