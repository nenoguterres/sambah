export const portalInsanoContract = {
  schema: "sambah.whatsapp.portal-insano",
  version: "3.0.0",
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
      fallbackText: "1. Insano Food Truck\n2. Xeriffe Obirici\n3. Granja Aguas da Lagoa\n4. Desenvolvimento de Tecnologias\n5. Atendimento Humano",
      options: [
        option("portal.foodtruck", 1, "Insano Food Truck", { type: "open_menu", target: "foodtruck_main_menu", areaId: "insano_food_truck" }),
        option("portal.xeriffe", 2, "Xeriffe Obirici", { type: "open_menu", target: "xeriffe_main_menu", areaId: "xeriffe_obirici" }),
        option("portal.granja", 3, "Granja Aguas da Lagoa", { type: "open_menu", target: "granja_main_menu", areaId: "granja_aguas_da_lagoa" }),
        option("portal.tecnologia", 4, "Desenvolvimento de Tecnologias", { type: "open_menu", target: "technology_main_menu", areaId: "desenvolvimento_tecnologias" }),
        option("portal.humano", 5, "Atendimento Humano", { type: "start_flow", target: "human_handoff" })
      ]
    },
    foodtruck_main_menu: {
      id: "foodtruck_main_menu",
      title: "Insano Food Truck",
      body: "Como podemos ajudar no Insano Food Truck?",
      fallbackText: "1. Agendar evento\n2. Solicitar orcamento\n3. Conhecer servicos\n4. Cardapio para eventos\n5. Consultar solicitacao\n6. Falar com a equipe\n7. Voltar ao Portal Insano",
      options: [
        option("foodtruck.schedule_event", 1, "Agendar evento", { type: "start_flow", target: "foodtruck_event_request" }),
        option("foodtruck.quote", 2, "Solicitar orcamento", { type: "start_flow", target: "foodtruck_quote_request" }),
        option("foodtruck.services", 3, "Conhecer servicos", { type: "open_menu", target: "foodtruck_services_menu" }),
        option("foodtruck.event_menu", 4, "Cardapio para eventos", { type: "open_menu", target: "foodtruck_event_menu" }),
        option("foodtruck.track_request", 5, "Consultar solicitacao", { type: "start_flow", target: "foodtruck_request_tracking" }),
        option("foodtruck.human", 6, "Falar com a equipe", { type: "start_flow", target: "human_handoff" }),
        option("foodtruck.back", 7, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    foodtruck_services_menu: {
      id: "foodtruck_services_menu",
      title: "Servicos para Eventos",
      body: "Escolha o servico de interesse:",
      fallbackText: "1. Insano Food Truck\n2. Insaninha Food Truck\n3. Pizza para Eventos\n4. Comida de Boteco Insano\n5. Churrasco para Eventos\n6. Voltar",
      options: [
        option("foodtruck.service.main_truck", 1, "Insano Food Truck", { type: "start_flow", target: "foodtruck_quote_request" }),
        option("foodtruck.service.insaninha", 2, "Insaninha Food Truck", { type: "start_flow", target: "foodtruck_quote_request" }),
        option("foodtruck.service.pizza", 3, "Pizza para Eventos", { type: "start_flow", target: "foodtruck_quote_request" }),
        option("foodtruck.service.boteco", 4, "Comida de Boteco Insano", { type: "start_flow", target: "foodtruck_quote_request" }),
        option("foodtruck.service.churrasco", 5, "Churrasco para Eventos", { type: "start_flow", target: "foodtruck_quote_request" }),
        option("foodtruck.services.back", 6, "Voltar", { type: "open_menu", target: "foodtruck_main_menu" })
      ]
    },
    foodtruck_event_menu: {
      id: "foodtruck_event_menu",
      title: "Cardapio para Eventos",
      body: "Escolha a categoria:",
      fallbackText: "1. Burgers\n2. Pizzas\n3. Comida de Boteco Insano\n4. Churrasco\n5. Montar proposta personalizada\n6. Voltar",
      options: [
        option("event_menu.burgers", 1, "Burgers", { type: "show_catalog", target: "catalog.foodtruck.burgers" }),
        option("event_menu.pizzas", 2, "Pizzas", { type: "show_catalog", target: "catalog.foodtruck.pizzas" }),
        option("event_menu.boteco", 3, "Comida de Boteco Insano", { type: "show_catalog", target: "catalog.foodtruck.boteco" }),
        option("event_menu.churrasco", 4, "Churrasco", { type: "show_catalog", target: "catalog.foodtruck.churrasco" }),
        option("event_menu.custom", 5, "Montar proposta personalizada", { type: "start_flow", target: "foodtruck_quote_request" }),
        option("event_menu.back", 6, "Voltar", { type: "open_menu", target: "foodtruck_main_menu" })
      ]
    },
    xeriffe_main_menu: {
      id: "xeriffe_main_menu",
      title: "Xeriffe Obirici",
      body: "Escolha uma opcao:",
      fallbackText: "1. Ver cardapio\n2. Fazer pedido\n3. Abrir Mesa do Xeriffe\n4. Acessar comanda\n5. Acompanhar pedido\n6. Pagamento\n7. Eventos do espaco\n8. Falar com atendente\n9. Voltar ao Portal Insano",
      options: [
        option("xeriffe.menu", 1, "Ver cardapio", { type: "open_menu", target: "xeriffe_catalog_menu" }),
        option("xeriffe.order", 2, "Fazer pedido", { type: "start_flow", target: "xeriffe_order" }),
        option("xeriffe.mesa", 3, "Abrir Mesa do Xeriffe", { type: "open_authorized_link", target: "integration.mesa_do_xeriffe.customer_url" }),
        option("xeriffe.command", 4, "Acessar comanda", { type: "start_flow", target: "xeriffe_command_access" }),
        option("xeriffe.track_order", 5, "Acompanhar pedido", { type: "start_flow", target: "xeriffe_order_tracking" }),
        option("xeriffe.payment", 6, "Pagamento", { type: "open_menu", target: "payment_main_menu" }),
        option("xeriffe.events", 7, "Eventos do espaco", { type: "start_flow", target: "xeriffe_event_information" }),
        option("xeriffe.human", 8, "Falar com atendente", { type: "start_flow", target: "human_handoff" }),
        option("xeriffe.back", 9, "Voltar ao Portal Insano", { type: "open_menu", target: "portal_main_menu", areaId: null })
      ]
    },
    xeriffe_catalog_menu: {
      id: "xeriffe_catalog_menu",
      title: "Cardapio Xeriffe Obirici",
      body: "Escolha uma categoria:",
      fallbackText: "1. Burgers\n2. Assados\n3. Pizzas\n4. Porcoes\n5. Espetinhos\n6. Bebidas\n7. Fazer pedido\n8. Voltar",
      options: [
        option("xeriffe.catalog.burgers", 1, "Burgers", { type: "show_catalog", target: "catalog.xeriffe.burgers" }),
        option("xeriffe.catalog.assados", 2, "Assados", { type: "show_catalog", target: "catalog.xeriffe.assados" }),
        option("xeriffe.catalog.pizzas", 3, "Pizzas", { type: "show_catalog", target: "catalog.xeriffe.pizzas" }),
        option("xeriffe.catalog.porcoes", 4, "Porcoes", { type: "show_catalog", target: "catalog.xeriffe.porcoes" }),
        option("xeriffe.catalog.espetinhos", 5, "Espetinhos", { type: "show_catalog", target: "catalog.xeriffe.espetinhos" }),
        option("xeriffe.catalog.bebidas", 6, "Bebidas", { type: "show_catalog", target: "catalog.xeriffe.bebidas" }),
        option("xeriffe.catalog.order", 7, "Fazer pedido", { type: "start_flow", target: "xeriffe_order" }),
        option("xeriffe.catalog.back", 8, "Voltar", { type: "open_menu", target: "xeriffe_main_menu" })
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
    foodtruck_event_request: flow("foodtruck_event_request", "Qual data tu tem em mente para o evento?", "event.date"),
    foodtruck_quote_request: flow("foodtruck_quote_request", "Para quantas pessoas seria o evento?", "quote.people"),
    foodtruck_request_tracking: flow("foodtruck_request_tracking", "Informe o telefone ou codigo da solicitacao.", "tracking.reference"),
    xeriffe_order: flow("xeriffe_order", "Me diz os itens do pedido para registrar como pre-atendimento.", "order.items"),
    xeriffe_command_access: flow("xeriffe_command_access", "Informe o numero da comanda ou telefone.", "command.reference"),
    xeriffe_order_tracking: flow("xeriffe_order_tracking", "Informe o numero do pedido ou telefone.", "order.reference"),
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
    "catalog.xeriffe.burgers": "Burgers do Xeriffe requerem validacao operacional antes de confirmar pedido.",
    "catalog.xeriffe.assados": "Assados do Xeriffe requerem validacao operacional antes de confirmar pedido.",
    "catalog.xeriffe.pizzas": "Pizzas do Xeriffe requerem validacao operacional antes de confirmar pedido.",
    "catalog.xeriffe.porcoes": "Porcoes do Xeriffe requerem validacao operacional antes de confirmar pedido.",
    "catalog.xeriffe.espetinhos": "Espetinhos do Xeriffe requerem validacao operacional antes de confirmar pedido.",
    "catalog.xeriffe.bebidas": "Bebidas do Xeriffe requerem validacao operacional antes de confirmar pedido.",
    "catalog.granja.animais": "Disponibilidade de animais precisa de confirmacao humana.",
    "catalog.granja.ovos": "Disponibilidade de ovos precisa de confirmacao humana.",
    "catalog.granja.hortifruti": "Hortifruti varia por safra e precisa de confirmacao.",
    "catalog.granja.produtos": "Produtos da Granja precisam de confirmacao de disponibilidade.",
    "catalog.projects": "Projetos Insano: Mesa do Xeriffe, SamBah, SamBah Pay, Perola, i9ACAO Security, Workhub, Studio N, Locker Frio e automacoes."
  },
  integrations: {
    mesa_do_xeriffe: { enabled: false, customerUrl: null },
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
