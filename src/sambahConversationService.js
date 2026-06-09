import { readFile } from "node:fs/promises";

const DEFAULT_SCRIPTS_FILE = "data/sambah-scripts.json";
const DEFAULT_SCRIPTS = {
  greeting_initial: "Ola, sou o samBah! Posso ajudar com pedido, cardapio, reserva, evento, food truck ou atendimento humano.",
  pedido: "Recebi seu pedido e vou conferir os itens pelo cardapio oficial do Mesa.",
  cardapio: "O cardapio oficial vem do Mesa do Xeriffe.",
  evento: "Recebi seu interesse em evento. Vou encaminhar para a Agenda Insano.",
  food_truck: "Recebi seu pedido sobre food truck. Vou direcionar para a Agenda Insano.",
  reserva_xeriffe: "Recebi seu pedido de reserva no Xeriffe.",
  atendimento_humano: "Vou chamar atendimento humano.",
  neno: "Vou encaminhar para o Neno.",
  kazuko: "Vou encaminhar para a Kazuko.",
  evento_corporativo: "Vou encaminhar para o Radar Comercial.",
  produto_nao_encontrado: "Esse item nao apareceu no cardapio oficial do Mesa.",
  pedido_confuso: "Pedido precisa de revisao.",
  rascunho_entendido: "Entendi teu pedido assim:\n\n{orderSummary}\n\nEsta certo?\n\n1. Confirmar\n2. Alterar\n3. Cancelar",
  confirmacao_pedido: "Pedido validado pelo cardapio oficial e enviado para o Mesa do Xeriffe.",
  pedido_enviado: "Pedido encaminhado.",
  pedido_para_revisao: "Pedido ficou em revisao manual para nao ser perdido."
};

const INTENTS = new Set([
  "immediate_order",
  "menu_request",
  "event_lead",
  "reservation",
  "commercial_lead",
  "human_request",
  "needs_review"
]);

export class SambahConversationService {
  constructor({ scriptsFile = DEFAULT_SCRIPTS_FILE } = {}) {
    this.scriptsFile = scriptsFile;
  }

  async classify(payload = {}, menuCache = { items: [] }) {
    const scripts = await this.loadScripts();
    const text = extractMessageText(payload);
    const normalizedText = normalizeText(text);
    const structuredItems = Array.isArray(payload.order?.items) ? payload.order.items : Array.isArray(payload.items) ? payload.items : [];
    const channel = payload.channel || payload.source || payload.origin || "whatsapp";
    const customer = payload.customer || {};

    if (matches(normalizedText, ["food truck", "foodtruck", "truck"])) {
      return result("event_lead", {
        route: "agenda_insano",
        subtype: "food_truck",
        scriptKey: "food_truck",
        responseText: scripts.food_truck,
        text,
        channel
      });
    }

    if (matches(normalizedText, ["humano", "atendente", "falar com pessoa", "neno", "kazuko", "gerente", "responsavel", "ajuda"])) {
      const assignee = normalizedText.includes("neno") ? "Neno" : normalizedText.includes("kazuko") ? "Kazuko" : "geral";
      const scriptKey = assignee === "Neno" ? "neno" : assignee === "Kazuko" ? "kazuko" : "atendimento_humano";
      return result("human_request", {
        route: "human",
        assignee,
        scriptKey,
        responseText: scripts[scriptKey],
        text,
        channel
      });
    }

    if (matches(normalizedText, ["evento", "festa", "casamento", "aniversario", "confraternizacao", "formatura", "buffet"])) {
      return result("event_lead", {
        route: "agenda_insano",
        subtype: "event",
        scriptKey: "evento",
        responseText: scripts.evento,
        text,
        channel
      });
    }

    if (matches(normalizedText, ["comercial", "parceria", "empresa", "contrato", "orcamento corporativo", "fornecedor", "franquia"])) {
      return result("commercial_lead", {
        route: "radar_comercial",
        scriptKey: "evento_corporativo",
        responseText: scripts.evento_corporativo,
        text,
        channel
      });
    }

    if (matches(normalizedText, ["reserva", "reservar", "mesa para", "guardar mesa", "xeriffe"])) {
      return result("reservation", {
        route: "xeriffe_reservation",
        scriptKey: "reserva_xeriffe",
        responseText: scripts.reserva_xeriffe,
        text,
        channel
      });
    }

    if (matches(normalizedText, ["cardapio", "menu", "preco", "valores", "opcoes", "catalogo"])) {
      return result("menu_request", {
        route: "menu",
        scriptKey: "cardapio",
        responseText: scripts.cardapio,
        text,
        channel
      });
    }

    if (structuredItems.length) {
      return result("immediate_order", {
        route: "mesa",
        scriptKey: "pedido",
        responseText: scripts.pedido,
        enrichedPayload: payload,
        text,
        channel
      });
    }

    if (looksLikeOrder(normalizedText)) {
      const matchesProducts = matchProducts(normalizedText, menuCache.items || []);
      if (!matchesProducts.length) {
        return result("needs_review", {
          route: "review",
          reason: "produto_sem_productId",
          scriptKey: "produto_nao_encontrado",
          responseText: scripts.produto_nao_encontrado,
          text,
          channel
        });
      }

      const items = matchesProducts.map((product) => ({
        productId: product.productId,
        qty: extractQuantity(normalizedText, product) || 1,
        addons: matchAddons(normalizedText, product.addons || []),
        serveMode: normalizedText.includes("mesa") ? "Mesa" : "Levar",
        note: text
      }));

      return result("immediate_order", {
        route: "mesa",
        scriptKey: "pedido",
        responseText: scripts.pedido,
        matchedProducts: matchesProducts.map((product) => ({ productId: product.productId, name: product.name })),
        enrichedPayload: {
          ...payload,
          customer,
          order: {
            ...(payload.order || {}),
            items,
            notes: payload.order?.notes || payload.notes || text
          }
        },
        text,
        channel
      });
    }

    if (!normalizedText) {
      return result("needs_review", {
        route: "review",
        reason: "mensagem_vazia",
        scriptKey: "greeting_initial",
        responseText: scripts.greeting_initial,
        text,
        channel
      });
    }

    return result("needs_review", {
      route: "review",
      reason: "mensagem_confusa",
      scriptKey: "pedido_confuso",
      responseText: scripts.pedido_confuso,
      text,
      channel
    });
  }

  async loadScripts() {
    try {
      const raw = await readFile(this.scriptsFile, "utf8");
      return { ...DEFAULT_SCRIPTS, ...JSON.parse(stripBom(raw) || "{}") };
    } catch (error) {
      if (error.code === "ENOENT") return DEFAULT_SCRIPTS;
      throw error;
    }
  }
}

function result(intent, data) {
  if (!INTENTS.has(intent)) throw new Error(`Intent invalida: ${intent}`);
  return { ok: true, intent, ...data };
}

export function extractMessageText(payload = {}) {
  return String(
    payload.message ||
    payload.text ||
    payload.body ||
    payload.caption ||
    payload.order?.notes ||
    payload.notes ||
    ""
  ).trim();
}

function looksLikeOrder(text) {
  return matches(text, ["quero", "manda", "me ve", "pedido", "pedir", "levar", "entrega", "delivery", "retirar", "vou querer", "separa"]);
}

function matchProducts(text, products = []) {
  const found = [];
  for (const product of products) {
    const productTerms = [
      product.productId,
      product.name,
      product.description
    ].map(normalizeText).filter(Boolean);
    if (productTerms.some((term) => term.length >= 4 && text.includes(term))) {
      found.push(product);
    }
  }
  return found.slice(0, 6);
}

function matchAddons(text, addons = []) {
  return addons
    .filter((addon) => {
      const terms = [addon.id, addon.name, addon.nome].map(normalizeText).filter(Boolean);
      return terms.some((term) => term.length >= 3 && text.includes(term));
    })
    .map((addon) => addon.id);
}

function extractQuantity(text) {
  const match = text.match(/(?:^|\s)(\d{1,2})(?:\s|x|$)/);
  if (!match) return 1;
  const qty = Number(match[1]);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function matches(text, terms) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
