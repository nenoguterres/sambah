const TEMPLATE_HASHTAGS = {
  produto_campeao: ['#PerolaIndica', '#MaisPedido', '#SamBah'],
  horario_pico: ['#HoraDoPedido', '#AlmocoNoPonto', '#SamBah'],
  campanha_dia_forte: ['#SextouNoPerola', '#DiaForte', '#SamBah'],
  promocao: ['#OfertaSimulada', '#GiroInteligente', '#Perola'],
  estoque_parado: ['#GiroDeEstoque', '#OportunidadeDoDia', '#Perola'],
  urgencia: ['#UltimaChamada', '#PedidoDoDia', '#SamBah'],
};

const INSANO_PRODUCTS = [
  'hamburguer artesanal',
  'assados',
  'pizzas',
  'pancho',
  'hot dog',
  'PanBagnat',
  'porcoes de boteco',
];

const INSANO_FACTS = [
  'Insano Food Truck / Insano 1909',
  'marca desde 2014',
  'butequeria de rua',
  'food truck e eventos',
  'atendimento para eventos, empresas, festas, condominios e encontros',
  'chamada principal: WhatsApp para orcamento',
];

export const PEROLA_CLAUDE_ASSISTANT_PROMPT = [
  'Voce e um assistente auxiliar do modulo Perola, motor de marketing do Insano Food Truck / Insano 1909.',
  'Sua funcao e criar variacoes de campanhas comerciais com tom humano, direto e brasileiro, sem exageros e sem inventar produtos.',
  `Use apenas estas informacoes reais: ${INSANO_FACTS.join('; ')}.`,
  `Produtos permitidos: ${INSANO_PRODUCTS.join(', ')}.`,
  'Crie: legenda para Instagram, mensagem curta para WhatsApp, chamada para arte, versao mais emocional e versao mais direta para venda.',
  'Regras: nao invente precos, nao invente promocoes, nao prometa disponibilidade, nao use linguagem exagerada, mantenha tom humano, gaucho leve e comercial.',
].join('\n');

export function generateContentFromIdea(idea = {}) {
  const type = idea.type || 'promocao';
  const title = idea.title || 'Ideia do Motor de Posts';
  const baseText = idea.description || idea.idea || idea.suggestedCaption || 'Conteudo simulado criado pelo Perola.';
  return {
    template: type,
    title,
    mainText: baseText,
    cta: buildCta(type),
    hashtags: TEMPLATE_HASHTAGS[type] || TEMPLATE_HASHTAGS.promocao,
  };
}

export function generateClaudeCampaignVariations(input = {}) {
  const rawIdea = cleanText(input.idea || input.campaign || input.title || 'Atendimento do Insano para eventos e encontros');
  const safeProduct = normalizeAllowedProduct(input.product || input.productName || '');
  const productText = safeProduct || 'hamburguer artesanal, assados, pizzas, pancho, hot dog, PanBagnat e porcoes de boteco';
  const serviceText = 'eventos, empresas, festas, condominios e encontros';
  const contextText = rawIdea ? `Ideia base: ${rawIdea}.` : 'Ideia base: atendimento do Insano.';

  return {
    success: true,
    provider: 'claude-ready-local',
    mode: 'local',
    service: 'perola',
    source: 'perola-claude-assistant',
    prompt: PEROLA_CLAUDE_ASSISTANT_PROMPT,
    facts: {
      brand: 'Insano Food Truck / Insano 1909',
      since: 2014,
      identity: 'butequeria de rua',
      products: INSANO_PRODUCTS,
      callToAction: 'WhatsApp para orcamento',
    },
    input: {
      idea: rawIdea,
      product: safeProduct,
    },
    variations: {
      instagramCaption: [
        'O Insano Food Truck / Insano 1909 leva a pegada de butequeria de rua para perto da tua turma.',
        `${contextText} Trabalhamos com ${productText}, em formato pensado para ${serviceText}.`,
        'Chama no WhatsApp e pede um orcamento.'
      ].join(' '),
      whatsappShort: `Oi! O Insano Food Truck / Insano 1909 atende ${serviceText} com ${productText}. Quer um orcamento pelo WhatsApp?`,
      artCall: `Insano 1909 no teu evento: comida de rua, atendimento direto e orcamento pelo WhatsApp.`,
      emotionalVersion: [
        'Desde 2014, o Insano carrega aquela ideia simples que funciona: comida boa, encontro de gente e clima de rua.',
        `Para ${serviceText}, a gente leva ${productText} com um jeito direto, sem firula.`,
        'Para conversar, chama no WhatsApp e pede um orcamento.'
      ].join(' '),
      directSalesVersion: `Precisa de food truck para evento, empresa, festa, condominio ou encontro? O Insano Food Truck / Insano 1909 atende com ${productText}. Orcamento pelo WhatsApp.`
    },
    guardrails: [
      'sem precos inventados',
      'sem promocoes inventadas',
      'sem promessa de disponibilidade',
      'sem produtos fora da lista oficial',
    ],
  };
}

function buildCta(type) {
  return {
    produto_campeao: 'Peca o campeao do dia.',
    horario_pico: 'Aproveite o melhor horario.',
    campanha_dia_forte: 'Entre na campanha do dia.',
    estoque_parado: 'Garanta enquanto tem disponibilidade.',
    urgencia: 'Confira antes que acabe.',
  }[type] || 'Veja a sugestao do Perola.';
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function normalizeAllowedProduct(value) {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return '';
  return INSANO_PRODUCTS.find((product) => product.toLowerCase() === normalized) || '';
}
