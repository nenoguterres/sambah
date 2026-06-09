import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";

const DEFAULT_DRAFTS_FILE = "data/order-drafts.json";
const DEFAULT_RULES_FILE = "data/sambah-menu-rules.json";

const NUMBER_WORDS = new Map([
  ["um", 1],
  ["uma", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["sete", 7],
  ["oito", 8],
  ["nove", 9],
  ["dez", 10]
]);

export class OrderDraftService {
  constructor({ draftsFile = DEFAULT_DRAFTS_FILE, rulesFile = DEFAULT_RULES_FILE, now = () => new Date() } = {}) {
    this.draftsFile = draftsFile;
    this.rulesFile = rulesFile;
    this.now = now;
  }

  async createDraft({ text = "", customer = {}, source = "WhatsApp / samBah!", menu = null } = {}) {
    const rules = await this.readRules();
    const menuPayload = menu || { items: [] };
    const draft = buildOrderDraft(text, menuPayload, rules, { customer, source, now: this.now });
    const drafts = await this.readDrafts();
    drafts.unshift(draft);
    await this.writeDrafts(drafts);
    return draft;
  }

  async listDrafts({ limit = 100 } = {}) {
    const drafts = await this.readDrafts();
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return {
      ok: true,
      total: drafts.length,
      items: drafts.slice(0, normalizedLimit).map(sanitizeDraft)
    };
  }

  async confirmDraft(id, menu) {
    const drafts = await this.readDrafts();
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return { ok: false, error: "draft_not_found" };
    if (!["draft", "suggested_options"].includes(draft.status)) {
      return { ok: false, error: "draft_not_confirmable", status: draft.status };
    }

    const validation = validateDraftAgainstMenu(draft, menu);
    if (!validation.ok) {
      draft.status = "needs_review";
      draft.reviewReason = validation.reason;
      draft.questions = validation.questions || [];
      draft.updatedAt = this.now().toISOString();
      await this.writeDrafts(drafts);
      return { ok: false, error: "draft_invalid", draft: sanitizeDraft(draft), validation };
    }

    draft.status = "confirmed";
    draft.needsConfirmation = false;
    draft.confirmedAt = this.now().toISOString();
    draft.updatedAt = draft.confirmedAt;
    await this.writeDrafts(drafts);
    return { ok: true, draft: sanitizeDraft(draft), order: draftToMesaPayload(draft) };
  }

  async cancelDraft(id) {
    const drafts = await this.readDrafts();
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return { ok: false, error: "draft_not_found" };
    draft.status = "canceled";
    draft.canceledAt = this.now().toISOString();
    draft.updatedAt = draft.canceledAt;
    await this.writeDrafts(drafts);
    return { ok: true, draft: sanitizeDraft(draft) };
  }

  async readRules() {
    try {
      const raw = await readFile(this.rulesFile, "utf8");
      return JSON.parse(stripBom(raw) || "{}");
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, globalSynonyms: {}, products: {}, addons: {} };
      throw error;
    }
  }

  async readDrafts() {
    try {
      const raw = await readFile(this.draftsFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeDrafts([]);
        return [];
      }
      throw error;
    }
  }

  async writeDrafts(drafts) {
    await mkdir(dirname(this.draftsFile), { recursive: true });
    await writeFile(this.draftsFile, `${JSON.stringify(drafts, null, 2)}\n`, "utf8");
  }
}

export function normalizeText(text = "", rules = {}) {
  let normalized = String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [from, to] of Object.entries(rules.globalSynonyms || {})) {
    normalized = normalized.replace(new RegExp(`\\b${escapeRegExp(normalizeText(from))}\\b`, "g"), normalizeText(to));
  }
  return normalized;
}

export function classifyIntent(text = "") {
  const normalized = normalizeText(text);
  if (hasAny(normalized, ["humano", "atendente", "neno", "kazuko", "pessoa"])) return "human_request";
  if (hasAny(normalized, ["food truck", "foodtruck", "evento", "orcamento", "aniversario", "festa", "casamento"])) return "event_lead";
  if (hasAny(normalized, ["reserva", "reservar", "mesa para", "xeriffe"])) return "reservation";
  if (hasAny(normalized, ["empresa", "condominio", "parceria", "proposta", "comercial"])) return "commercial_lead";
  if (hasAny(normalized, ["cardapio", "menu", "preco", "valor", "valores", "tem"])) return "menu_request";
  if (hasAny(normalized, ["quero", "qro", "me ve", "me v", "manda", "pedido", "pedir", "levar", "delivery", "retirar"])) return "immediate_order";
  return "needs_review";
}

export function extractQuantities(text = "") {
  const normalized = normalizeText(text);
  const quantities = [];
  for (const match of normalized.matchAll(/\b(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/g)) {
    const raw = match[1];
    quantities.push({
      value: NUMBER_WORDS.get(raw) || Number(raw),
      index: match.index
    });
  }
  return quantities;
}

export function matchProductsFromMenu(text, menu, rules = {}) {
  const normalized = normalizeText(text, rules);
  const products = Array.isArray(menu?.items) ? menu.items : [];
  const matches = [];

  for (const product of products) {
    const productRules = rules.products?.[product.productId] || {};
    const primaryTerms = [
      product.productId,
      product.name,
      ...(productRules.aliases || [])
    ].map((term) => normalizeText(term, rules)).filter((term) => term.length >= 3);
    const keywordTerms = (productRules.keywords || []).map((term) => normalizeText(term, rules)).filter((term) => term.length >= 4);
    const matchedPrimary = [...new Set(primaryTerms.filter((term) => normalized.includes(term)))];
    if (matchedPrimary.length) {
      const matchedKeywords = [...new Set(keywordTerms.filter((term) => normalized.includes(term)))];
      const firstIndex = Math.min(...matchedPrimary.map((term) => normalized.indexOf(term)).filter((index) => index >= 0));
      matches.push({
        product,
        productId: product.productId,
        name: product.name,
        matchedTerms: [...matchedPrimary, ...matchedKeywords],
        index: firstIndex,
        score: Math.min(1, 0.7 + matchedPrimary.length * 0.15 + matchedKeywords.length * 0.05 + (matchedPrimary.some((term) => term === normalizeText(product.name, rules)) ? 0.12 : 0))
      });
    }
  }

  return matches.sort((a, b) => a.index - b.index || b.score - a.score).slice(0, 8);
}

export function matchAddons(text, product, rules = {}) {
  const normalized = normalizeText(text, rules);
  const matched = [];
  const officialAddons = Array.isArray(product?.addons) ? product.addons : [];

  for (const [ruleId, rule] of Object.entries(rules.addons || {})) {
    const aliases = [ruleId, ...(rule.aliases || [])].map((term) => normalizeText(term, rules));
    if (!aliases.some((alias) => normalized.includes(alias))) continue;
    if (rule.type === "note") {
      matched.push({ type: "note", id: ruleId, note: aliases.find((alias) => normalized.includes(alias)) || ruleId });
      continue;
    }
    const official = officialAddons.find((addon) => addon.id === ruleId || aliases.includes(normalizeText(addon.id, rules)) || aliases.includes(normalizeText(addon.name, rules)));
    matched.push(official ? { type: "addon", id: official.id } : { type: "invalid_addon", id: ruleId });
  }

  return matched;
}

export function buildOrderDraft(message, menu, rules = {}, { customer = {}, source = "WhatsApp / samBah!", now = () => new Date() } = {}) {
  const normalizedText = normalizeText(message, rules);
  let intent = classifyIntent(normalizedText);
  const candidateProductMatches = matchProductsFromMenu(message, menu, rules);
  if (intent === "needs_review" && candidateProductMatches.length) intent = "immediate_order";
  const productMatches = intent === "immediate_order" ? candidateProductMatches : [];
  const quantities = extractQuantities(message);
  const questions = [];
  const items = productMatches.map((match, index) => {
    const segment = textSegmentForMatch(normalizedText, productMatches, index);
    const addons = matchAddons(segment, match.product, rules);
    const notes = addons.filter((addon) => addon.type === "note").map((addon) => addon.note);
    const invalidAddons = addons.filter((addon) => addon.type === "invalid_addon");
    if (invalidAddons.length) questions.push({ reason: "addon_invalido", productId: match.productId, addons: invalidAddons.map((addon) => addon.id) });
    return {
      productId: match.productId,
      name: match.name,
      qty: quantityForMatch(normalizedText, match, quantities),
      addons: addons.filter((addon) => addon.type === "addon").map((addon) => addon.id),
      note: notes.join("; "),
      confidence: match.score
    };
  });

  if (intent === "immediate_order" && !items.length) {
    questions.push({ reason: "productId_invalido", message: "Nao encontrei produto oficial do Mesa na mensagem" });
  }

  const confidence = calculateConfidence(productMatches);
  const status = intent !== "immediate_order"
    ? "needs_review"
    : questions.some((question) => question.reason === "addon_invalido")
      ? "needs_review"
      : confidence >= 0.8
        ? "draft"
        : confidence >= 0.5
          ? "suggested_options"
          : "needs_review";
  const createdAt = now().toISOString();

  return {
    id: `draft_${crypto.randomUUID()}`,
    source,
    status,
    customer: {
      name: customer.name || "",
      phone: customer.phone || ""
    },
    rawText: String(message || ""),
    normalizedText,
    intent,
    confidence,
    items,
    questions,
    needsConfirmation: status === "draft" || status === "suggested_options",
    createdAt,
    updatedAt: createdAt
  };
}

function textSegmentForMatch(normalizedText, matches, index) {
  const start = matches[index].index;
  const end = matches[index + 1]?.index ?? normalizedText.length;
  const previousConnector = normalizedText.lastIndexOf(" e ", start);
  const segmentStart = previousConnector >= 0 ? previousConnector + 3 : 0;
  return normalizedText.slice(segmentStart, end).trim();
}

function quantityForMatch(normalizedText, match, quantities) {
  const candidates = quantities
    .filter((quantity) => quantity.index <= match.index)
    .sort((a, b) => b.index - a.index);
  const nearby = candidates.find((quantity) => match.index - quantity.index <= 28);
  return nearby?.value || 1;
}

export function validateDraftAgainstMenu(draft, menu) {
  const productById = new Map((menu?.items || []).map((item) => [item.productId, item]));
  const questions = [];
  if (!productById.size) questions.push({ reason: "menu_nao_sincronizado" });
  for (const item of draft.items || []) {
    const product = productById.get(item.productId);
    if (!product) {
      questions.push({ reason: "productId_invalido", productId: item.productId });
      continue;
    }
    if (product.available === false || product.availability?.available === false) questions.push({ reason: "produto_indisponivel", productId: item.productId });
    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) questions.push({ reason: "quantidade_invalida", productId: item.productId });
    const addonIds = new Set((product.addons || []).map((addon) => addon.id));
    for (const addonId of item.addons || []) {
      if (!addonIds.has(addonId)) questions.push({ reason: "addon_invalido", productId: item.productId, addonId });
    }
  }
  if (!draft.items?.length) questions.push({ reason: "pedido_sem_itens" });
  return {
    ok: questions.length === 0,
    reason: questions[0]?.reason || null,
    questions
  };
}

export function calculateConfidence(matches = []) {
  if (!matches.length) return 0;
  const average = matches.reduce((sum, match) => sum + Number(match.score || 0), 0) / matches.length;
  return Number(Math.min(1, Math.max(0, average)).toFixed(2));
}

export function draftToMesaPayload(draft) {
  return {
    eventId: draft.id,
    customer: draft.customer,
    order: {
      type: "whatsapp",
      table: null,
      items: draft.items.map((item) => ({
        productId: item.productId,
        qty: item.qty,
        addons: item.addons,
        serveMode: "Levar",
        note: item.note || ""
      })),
      notes: draft.rawText,
      total: null
    }
  };
}

function sanitizeDraft(draft) {
  return {
    ...draft,
    customer: {
      ...draft.customer,
      phoneMasked: maskPhone(draft.customer?.phone),
      phone: undefined
    }
  };
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

function maskPhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
