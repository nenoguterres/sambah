export const VOICE_INTENTS = [
  "novo_pedido",
  "adicionar_item",
  "remover_item",
  "consultar_cardapio",
  "fechar_mesa",
  "pagar_conta",
  "gerar_pix",
  "consultar_status",
  "falar_com_humano",
  "orcar_evento",
  "comprar_credito_wallet",
  "consultar_saldo_wallet",
  "autoserve_purchase",
  "autoserve_release",
  "consultar_maquina",
  "reportar_falha_maquina"
];

const CRITICAL_INTENTS = new Set([
  "fechar_mesa",
  "pagar_conta",
  "gerar_pix",
  "comprar_credito_wallet",
  "autoserve_purchase",
  "autoserve_release"
]);

export class MockAiIntentAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.provider = "mock-ai-intent";
  }

  async detect({ text = "" } = {}) {
    const normalized = normalize(text);
    const intent = classify(normalized);
    return {
      ok: true,
      provider: this.provider,
      intent,
      confidence: intent === "falar_com_humano" ? 0.86 : 0.91,
      confirmationRequired: CRITICAL_INTENTS.has(intent),
      entities: extractEntities(normalized),
      detectedAt: this.now().toISOString(),
      raw: { simulated: true }
    };
  }
}

function classify(text) {
  if (/(humano|atendente|pessoa|suporte)/.test(text)) return "falar_com_humano";
  if (/(falha|defeito|nao liberou|não liberou|travou|problema).*(maquina|máquina|geladeira|chopeira|dispenser)/.test(text)) return "reportar_falha_maquina";
  if (/(status|acompanhar|andamento)/.test(text)) return "consultar_status";
  if (/(saldo).*(wallet|carteira)/.test(text)) return "consultar_saldo_wallet";
  if (/(credito|crédito|recarga|colocar saldo|comprar credito).*(wallet|carteira)/.test(text)) return "comprar_credito_wallet";
  if (/(liberar|retirar).*(maquina|máquina|geladeira|chopeira|autoserve)/.test(text)) return "autoserve_release";
  if (/(autoserve|auto serve|geladeira|chopeira|maquina|máquina).*(comprar|pedido|agua|água|chopp|refri)/.test(text)) return "autoserve_purchase";
  if (/(maquina|máquina|geladeira|chopeira|dispenser)/.test(text)) return "consultar_maquina";
  if (/(evento|orcamento|orçamento|food truck|festa)/.test(text)) return "orcar_evento";
  if (/(pix)/.test(text)) return "gerar_pix";
  if (/(pagar|pagamento|conta)/.test(text)) return "pagar_conta";
  if (/(fechar).*(mesa|conta)/.test(text)) return "fechar_mesa";
  if (/(cardapio|cardápio|menu)/.test(text)) return "consultar_cardapio";
  if (/(remover|tirar|cancelar item)/.test(text)) return "remover_item";
  if (/(adicionar|colocar mais|incluir)/.test(text)) return "adicionar_item";
  return "novo_pedido";
}

function extractEntities(text) {
  const amountMatch = text.match(/(?:r\$\s*)?(\d+[,.]?\d*)/);
  return {
    amount: amountMatch ? Number(amountMatch[1].replace(",", ".")) : null,
    product: text.includes("agua") || text.includes("água") ? "agua" : text.includes("chopp") ? "chopp-300" : null
  };
}

function normalize(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
