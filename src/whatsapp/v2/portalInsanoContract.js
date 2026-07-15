export const portalInsanoContract = {
  schema: "sambah.whatsapp.portal-insano",
  version: "3.2.0",
  assistant: {
    name: "SamBah",
    role: "Assistente oficial de atendimento do Portal Insano"
  },
  activation: {
    flags: {
      WHATSAPP_V2_ENABLED: false,
      WHATSAPP_SEND_ENABLED: false,
      WHATSAPP_AI_ENABLED: false,
      WHATSAPP_AUTO_REPLY_ENABLED: false
    }
  },
  welcome: {
    id: "portal_welcome",
    message: "Buenas! Aqui e o SamBah, atendimento do Portal Insano. Escolha abaixo a area que deseja acessar.",
    menuId: "portal_main_menu"
  },
  menus: {
    portal_main_menu: {
      id: "portal_main_menu",
      title: "Portal Insano",
      body: "Escolha uma area para continuar:",
      strictInteractiveIds: true,
      options: [
        option("PORTAL_INSANO_FOODTRUCK", 1, "Insano Food Truck", { type: "open_menu", target: "foodtruck_main_menu", areaId: "insano_food_truck" }),
        option("portal.xeriffe", 2, "Xeriffe Obirici", { type: "open_menu", target: "xeriffe_main_menu", areaId: "xeriffe_obirici" }),
        option("portal.more", 3, "Mais opcoes", { type: "open_menu", target: "portal_more_menu", areaId: null })
      ]
    },
    portal_more_menu: {
      id: "portal_more_menu",
      title: "Mais opcoes",
      body: "Escolha uma area para continuar:",
      strictInteractiveIds: true,
      options: [
        option("portal.granja", 1, "Granja Aguas da Lagoa", { type: "open_menu", target: "granja_main_menu", areaId: "granja_aguas_da_lagoa" }),
        option("portal.tecnologia", 2, "Desenvolvimento de Tecnologias", { type: "open_menu", target: "technology_main_menu", areaId: "desenvolvimento_tecnologias" }),
        option("portal.humano", 3, "Atendimento Humano", { type: "open_menu", target: "human_contact_menu", areaId: "atendimento_humano" }),
        option("portal.more.back", 4, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    foodtruck_main_menu: {
      id: "foodtruck_main_menu",
      title: "Insano Food Truck",
      body: "Insano Food Truck\n\nO que tu precisa?",
      buttonText: "ESCOLHER UMA AÇÃO",
      strictInteractiveIds: true,
      options: [
        option("INSANO_EVENTO", 1, "Evento", { type: "open_url_button", target: "integration.insano_food_truck.event_form_url" }),
        option("INSANO_ORCAMENTO", 2, "Orçamento", { type: "open_url_button", target: "integration.insano_food_truck.quote_form_url" }),
        option("INSANO_CATALOGO", 3, "Catálogo de produtos", { type: "open_url_button", target: "integration.insano_food_truck.catalog_url" }),
        option("INSANO_HUMANO", 4, "Atendimento Humano", { type: "start_flow", target: "human_handoff" }),
        option("PORTAL_VOLTAR", 5, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null, clearFoodtruckSubstate: true })
      ]
    },
    xeriffe_main_menu: {
      id: "xeriffe_main_menu",
      title: "Xeriffe Obirici",
      body: "Cardapio direto ou atendimento no local:",
      strictInteractiveIds: true,
      fallbackText: "1. Abrir Cardapio\n2. Reserva - Mesa - Evento\n3. Voltar ao Portal Insano",
      options: [
        option("xeriffe.menu", 1, "Abrir Cardapio", { type: "open_url_button", target: "integration.mesa_do_xeriffe.customer_url" }),
        option("xeriffe.services", 2, "Reserva - Mesa - Evento", { type: "open_menu", target: "xeriffe_services_menu", areaId: "xeriffe_obirici" }),
        option("xeriffe.back", 3, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    xeriffe_services_menu: {
      id: "xeriffe_services_menu",
      title: "Xeriffe Obirici",
      body: "Escolha o atendimento que precisa:",
      strictInteractiveIds: true,
      options: [
        option("xeriffe.reserve", 1, "Reservar mesa", { type: "start_flow", target: "xeriffe_reservation_request" }),
        option("xeriffe.table", 2, "Atendimento na mesa", { type: "start_flow", target: "xeriffe_table_service" }),
        option("xeriffe.event", 3, "Espaco para evento", { type: "start_flow", target: "xeriffe_event_information" }),
        option("xeriffe.human", 4, "Atendimento Humano", { type: "open_menu", target: "human_contact_menu", areaId: "atendimento_humano" }),
        option("xeriffe.services.back", 5, "Voltar ao Xeriffe", { type: "open_menu", target: "xeriffe_main_menu", areaId: "xeriffe_obirici" })
      ]
    },
    human_contact_menu: {
      id: "human_contact_menu",
      title: "Atendimento Humano",
      body: "Com quem deseja falar?",
      strictInteractiveIds: true,
      options: [
        option("human.chef_neno", 1, "Chef Neno Gutterres", { type: "start_flow", target: "human_handoff", assignee: "Chef Neno Gutterres" }),
        option("human.kazuko", 2, "Kazuko Doi", { type: "start_flow", target: "human_handoff", assignee: "Kazuko Doi" }),
        option("human.back", 3, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    granja_main_menu: {
      id: "granja_main_menu",
      title: "Granja Aguas da Lagoa",
      body: "O que deseja consultar?",
      fallbackText: "1. Animais disponiveis\n2. Ovos\n3. Hortifruti\n4. Produtos da Granja\n5. Comprar ou reservar\n6. Visitas e atividades\n7. Falar com responsavel\n8. Voltar ao Portal Insano",
      options: [
        option("granja.animals", 1, "Animais disponiveis", { type: "show_catalog", target: "catalog.granja.animais" }),
        option("granja.eggs", 2, "Ovos", { type: "show_catalog", target: "catalog.granja.ovos" }),
        option("granja.produce", 3, "Hortifruti", { type: "show_catalog", target: "catalog.granja.hortifruti" }),
        option("granja.products", 4, "Produtos da Granja", { type: "show_catalog", target: "catalog.granja.produtos" }),
        option("granja.purchase", 5, "Comprar ou reservar", { type: "start_flow", target: "granja_purchase_request" }),
        option("granja.visits", 6, "Visitas e atividades", { type: "start_flow", target: "granja_visit_request" }),
        option("granja.human", 7, "Falar com responsavel", { type: "start_flow", target: "human_handoff" }),
        option("granja.back", 8, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    technology_main_menu: {
      id: "technology_main_menu",
      title: "Desenvolvimento de Tecnologias",
      body: "Escolha a area de interesse:",
      fallbackText: "1. Desenvolvimento de sistemas\n2. Aplicativos\n3. Automacao comercial\n4. Inteligencia artificial\n5. WhatsApp e atendimento\n6. Pagamentos e SamBah Pay\n7. Hardware e ESP32\n8. Seguranca e monitoramento\n9. Containers e estruturas\n10. Energia solar e autonomia\n11. Projetos existentes\n12. Solicitar avaliacao\n13. Atendimento humano\n14. Voltar ao Portal Insano",
      options: [
        option("technology.systems", 1, "Desenvolvimento de sistemas", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.apps", 2, "Aplicativos", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.automation", 3, "Automacao comercial", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.ai", 4, "Inteligencia artificial", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.whatsapp", 5, "WhatsApp e atendimento", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.payments", 6, "Pagamentos e SamBah Pay", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.hardware", 7, "Hardware e ESP32", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.security", 8, "Seguranca e monitoramento", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.containers", 9, "Containers e estruturas", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.energy", 10, "Energia solar e autonomia", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.projects", 11, "Projetos existentes", { type: "show_catalog", target: "catalog.projects" }),
        option("technology.evaluation", 12, "Solicitar avaliacao", { type: "start_flow", target: "technology_evaluation" }),
        option("technology.human", 13, "Atendimento humano", { type: "start_flow", target: "human_handoff" }),
        option("technology.back", 14, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    payment_main_menu: {
      id: "payment_main_menu",
      title: "Pagamento",
      body: "Escolha uma opcao de pagamento:",
      fallbackText: "1. Pix\n2. Cartao\n3. Dinheiro\n4. Conferir comprovante\n5. Voltar",
      options: [
        option("payment.pix", 1, "Pix", { type: "start_flow", target: "payment_pix" }),
        option("payment.card", 2, "Cartao", { type: "start_flow", target: "payment_card" }),
        option("payment.cash", 3, "Dinheiro", { type: "start_flow", target: "payment_cash" }),
        option("payment.receipt", 4, "Conferir comprovante", { type: "start_flow", target: "payment_receipt_review" }),
        option("payment.back", 5, "Voltar", { type: "open_menu", target: "xeriffe_main_menu" })
      ]
    }
  },
  flows: {
    xeriffe_command_access: flow("xeriffe_command_access", "Informe o numero da comanda ou telefone.", "command.reference"),
    xeriffe_order_tracking: flow("xeriffe_order_tracking", "Informe o numero do pedido ou telefone.", "order.reference"),
    xeriffe_reservation_request: flow("xeriffe_reservation_request", "Informe data, horario e quantidade de pessoas para a reserva.", "reservation.details"),
    xeriffe_table_service: flow("xeriffe_table_service", "Informe o numero da mesa e o que precisa.", "table.request"),
    xeriffe_event_information: flow("xeriffe_event_information", "Qual data ou tipo de evento tu quer consultar?", "event.interest"),
    granja_purchase_request: flow("granja_purchase_request", "Qual produto ou animal tu deseja consultar?", "granja.item"),
    granja_visit_request: flow("granja_visit_request", "Qual dia tu gostaria de visitar?", "visit.date"),
    technology_evaluation: flow("technology_evaluation", "Qual problema tu deseja resolver?", "technology.problem"),
    payment_pix: flow("payment_pix", "Informe o numero do pedido, comanda ou telefone relacionado ao pagamento.", "payment.reference", { neverConfirmPayment: true }),
    payment_card: flow("payment_card", "Informe o pedido, comanda ou telefone relacionado.", "payment.reference", { neverConfirmPayment: true }),
    payment_cash: flow("payment_cash", "Precisa de troco?", "payment.change_needed"),
    payment_receipt_review: flow("payment_receipt_review", "Informe o numero do pedido, comanda ou telefone relacionado.", "payment.reference", { neverConfirmPayment: true }),
    human_handoff: {
      id: "human_handoff",
      initialMessage: "Certo. Me diz em uma frase o assunto para a equipe ja receber o contexto.",
      steps: [{ id: "handoff_reason", prompt: "Qual e o assunto do atendimento?", field: "handoff.reason", required: true }]
    }
  },
  catalogs: {
    "catalog.foodtruck.burgers": "Cardapio de burgers para eventos requer validacao operacional. Vou encaminhar para atendimento se tu quiser seguir.",
    "catalog.foodtruck.pizzas": "Cardapio de pizzas para eventos requer validacao operacional. Vou encaminhar para atendimento se tu quiser seguir.",
    "catalog.foodtruck.boteco": "Comida de Boteco Insano requer catalogo operacional aprovado antes de confirmar itens.",
    "catalog.foodtruck.churrasco": "Churrasco para eventos requer catalogo operacional aprovado antes de confirmar itens.",
    "catalog.granja.animais": "Disponibilidade de animais precisa de confirmacao humana.",
    "catalog.granja.ovos": "Disponibilidade de ovos precisa de confirmacao humana.",
    "catalog.granja.hortifruti": "Hortifruti varia por safra e precisa de confirmacao.",
    "catalog.granja.produtos": "Produtos da Granja precisam de confirmacao de disponibilidade.",
    "catalog.projects": "Projetos Insano: Mesa do Xeriffe, SamBah, SamBah Pay, Perola, i9ACAO Security, Workhub, Studio N, Locker Frio e automacoes."
  },
  integrations: {
    insano_food_truck: {
      catalogUrl: "https://sambah.onrender.com/catalogo/insano",
      eventFormUrl: null,
      quoteFormUrl: null
    },
    mesa_do_xeriffe: { enabled: true, customerUrl: "https://sambah.onrender.com/xeriffe/cardapio" },
    sambah_pay: { enabled: false },
    meta_sender: { enabled: false, realSenderAllowed: false },
    ai: { enabled: false }
  }
};

function option(id, order, title, action) {
  return { id, order, title, action };
}

function flow(id, initialMessage, field, flags = {}) {
  return {
    id,
    initialMessage,
    steps: [{ id: field.replace(/\./g, "_"), prompt: initialMessage, field, required: true }],
    ...flags
  };
}
