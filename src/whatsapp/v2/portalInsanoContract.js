export const portalInsanoContract = {
  schema: "sambah.whatsapp.portal-insano",
  version: "3.4.0",
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
    message: "Buenas! Aqui e o SamBah, atendimento do Portal Insano. Escolha abaixo a area que deseja acessar. Voce pode clicar ou escrever a opcao.",
    menuId: "portal_main_menu"
  },
  menus: {
    portal_main_menu: {
      id: "portal_main_menu",
      title: "Portal Insano",
      body: "Escolha uma area para continuar:",
      options: [
        option("portal.gastronomia", 1, "Gastronomia", { type: "open_menu", target: "gastronomy_main_menu", areaId: "gastronomia" }),
        option("portal.granja", 2, "Agro / Granja", { type: "open_menu", target: "granja_main_menu", areaId: "granja_aguas_da_lagoa" }),
        option("portal.negocios", 3, "Tecnologias e Fabricacao", { type: "open_menu", target: "business_main_menu", areaId: null })
      ]
    },
    gastronomy_main_menu: {
      id: "gastronomy_main_menu",
      title: "Gastronomia",
      body: "Escolha o atendimento gastronomico:",
      options: [
        option("PORTAL_INSANO_FOODTRUCK", 1, "Insano Food Truck", { type: "open_url_button", target: "integration.insano_food_truck.event_form_url" }),
        option("portal.xeriffe", 2, "Xeriffe Obirici", { type: "open_menu", target: "xeriffe_main_menu", areaId: "xeriffe_obirici" }),
        option("gastronomy.back", 3, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
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
        option("portal.humano", 3, "Falar com a equipe", { type: "open_menu", target: "human_contact_menu", areaId: "atendimento_humano" }),
        option("portal.more.back", 4, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    business_main_menu: {
      id: "business_main_menu",
      title: "Tecnologias e Fabricacao",
      body: "Escolha a area de interesse:",
      buttonText: "VER AREAS",
      options: [
        option("business.technology", 1, "Tecnologia", { type: "open_menu", target: "technology_main_menu", areaId: "desenvolvimento_tecnologias" }),
        option("business.sawmill", 2, "Serralheria", { type: "open_menu", target: "sawmill_main_menu", areaId: "serralheria_equipamentos" }),
        option("business.visual", 3, "Comunicacao Visual", { type: "open_menu", target: "visual_communication_menu", areaId: "comunicacao_visual" }),
        option("business.back", 4, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    foodtruck_main_menu: {
      id: "foodtruck_main_menu",
      title: "Insano Food Truck",
      body: "Insano Food Truck\n\nO que tu precisa?",
      buttonText: "ESCOLHER UMA AÇÃO",
      strictInteractiveIds: true,
      options: [
        option("INSANO_EVENTO", 1, "Montar evento", { type: "open_url_button", target: "integration.insano_food_truck.event_form_url" }),
        option("INSANO_HUMANO", 2, "Falar com a equipe", { type: "start_flow", target: "human_handoff" }),
        option("PORTAL_VOLTAR", 3, "Voltar ao Portal", { type: "open_menu", target: "portal_main_menu", areaId: null, clearFoodtruckSubstate: true })
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
        option("xeriffe.human", 4, "Falar com a equipe", { type: "open_menu", target: "human_contact_menu", areaId: "atendimento_humano" }),
        option("xeriffe.services.back", 5, "Voltar ao Xeriffe", { type: "open_menu", target: "xeriffe_main_menu", areaId: "xeriffe_obirici" })
      ]
    },
    human_contact_menu: {
      id: "human_contact_menu",
      title: "Falar com a equipe",
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
      buttonText: "VER OPCOES",
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
      title: "Tecnologia",
      body: "Escolha um aplicativo para conhecer suas funcoes:",
      buttonText: "VER APLICATIVOS",
      options: [
        option("technology.app.mesa", 1, "Mesa do Xeriffe", { type: "open_menu", target: "app_mesa_menu" }),
        option("technology.app.sambah", 2, "SamBah", { type: "open_menu", target: "app_sambah_menu" }),
        option("technology.app.pay", 3, "SamBah Pay", { type: "open_menu", target: "app_pay_menu" }),
        option("technology.app.perola", 4, "Perola", { type: "open_menu", target: "app_perola_menu" }),
        option("technology.app.studion", 5, "Studio N", { type: "open_menu", target: "app_studion_menu" }),
        option("technology.app.i9acao", 6, "i9ACAO Security", { type: "open_menu", target: "app_i9acao_menu" }),
        option("technology.app.workhub", 7, "Central de Trabalhos", { type: "open_menu", target: "app_workhub_menu" }),
        option("technology.human", 8, "Falar com a equipe", { type: "start_flow", target: "human_handoff" }),
        option("technology.back", 9, "Voltar", { type: "open_menu", target: "business_main_menu", areaId: null })
      ]
    },
    app_mesa_menu: appMenu("app_mesa_menu", "Mesa do Xeriffe", "Operacao de mesas, comandas, atendimento, caixa e comunicacao com a producao."),
    app_sambah_menu: appMenu("app_sambah_menu", "SamBah", "Atendimento pelo WhatsApp, organizacao de conversas, CRM, oportunidades e encaminhamento humano."),
    app_pay_menu: appMenu("app_pay_menu", "SamBah Pay", "Ferramentas de pagamentos, cobrancas e integracao financeira do ecossistema SamBah."),
    app_perola_menu: appMenu("app_perola_menu", "Perola", "Planejamento de campanhas, conteudos, publicacoes, calendario e acompanhamento comercial."),
    app_studion_menu: appMenu("app_studion_menu", "Studio N", "Projetos de comunicacao visual, letras-caixa, luminosos, ACM, corte, dobra e visualizacao."),
    app_i9acao_menu: appMenu("app_i9acao_menu", "i9ACAO Security", "Seguranca e monitoramento por cameras, areas de vigilancia, dispositivos e alertas."),
    app_workhub_menu: appMenu("app_workhub_menu", "Central de Trabalhos", "Organizacao central das tarefas, prioridades, andamento, bloqueios e conclusoes dos projetos."),
    sawmill_main_menu: {
      id: "sawmill_main_menu",
      title: "Serralheria",
      body: "Fabricacao em metal de equipamentos e estruturas para operacoes gastronomicas, incluindo projetos de food truck. A equipe humana confirma necessidade, medidas e viabilidade.",
      options: [
        option("sawmill.human", 1, "Falar com a equipe", { type: "start_flow", target: "human_handoff" }),
        option("sawmill.back", 2, "Voltar", { type: "open_menu", target: "business_main_menu", areaId: null })
      ]
    },
    visual_communication_menu: {
      id: "visual_communication_menu",
      title: "Comunicacao Visual",
      body: "Producoes planejadas no Studio N: letras-caixa, luminosos, placas e fachadas em ACM, totens, paineis, letreiros e preparacao de projetos para corte e dobra. A equipe humana avalia medidas, materiais, acabamento e instalacao.",
      options: [
        option("visual.human", 1, "Falar com a equipe", { type: "start_flow", target: "human_handoff" }),
        option("visual.back", 2, "Voltar", { type: "open_menu", target: "business_main_menu", areaId: null })
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

function appMenu(id, title, body) {
  return {
    id,
    title,
    body,
    options: [
      option(`${id}.human`, 1, "Falar com a equipe", { type: "start_flow", target: "human_handoff" }),
      option(`${id}.back`, 2, "Voltar aos aplicativos", { type: "open_menu", target: "technology_main_menu" })
    ]
  };
}

function flow(id, initialMessage, field, flags = {}) {
  return {
    id,
    initialMessage,
    steps: [{ id: field.replace(/\./g, "_"), prompt: initialMessage, field, required: true }],
    ...flags
  };
}
