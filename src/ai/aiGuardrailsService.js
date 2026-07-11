const SENSITIVE_RULES = [
  {
    key: "price",
    pattern: /(?:r\$|\bvalor\b|\bpreco\b|\bpreco\b|\bcusta\b|\bcusto\b|\bpor\s+\d+[,.]?\d*)/i,
    blockedActions: /\b(confirmado|garantido|fechado|aprovado)\b/i
  },
  {
    key: "discount",
    pattern: /\b(desconto|promo|promocao|%|off)\b/i,
    blockedActions: /\b(aplicado|autorizado|garantido|confirmado)\b/i
  },
  {
    key: "deadline",
    pattern: /\b(prazo|em\s+\d+\s*(minuto|minutos|hora|horas|dia|dias)|ate\s+\d{1,2}[:h]\d{0,2})\b/i,
    blockedActions: /\b(garantido|confirmado|prometido)\b/i
  },
  {
    key: "cancellation",
    pattern: /\b(cancelar|cancelamento|cancelado|cancelei)\b/i,
    blockedActions: /\b(cancelado|cancelei|confirmado)\b/i
  },
  {
    key: "payment",
    pattern: /\b(pix|cartao|boleto|pagamento|pago|pagar)\b/i,
    blockedActions: /\b(aprovado|confirmado|recebido|compensado)\b/i
  }
];

const FINAL_ACTION_PATTERN = /\b(pedido confirmado|pedido criado|pagamento aprovado|desconto aplicado|cancelamento realizado|envio finalizado)\b/i;

export class AiGuardrailsService {
  validate({ text = "", internalSources = {}, route = {}, classification = {} } = {}) {
    const value = String(text || "").trim();
    const violations = [];

    if (!value) {
      violations.push({ code: "empty_response", message: "Resposta vazia." });
    }

    if (FINAL_ACTION_PATTERN.test(value)) {
      violations.push({ code: "final_action_not_allowed", message: "IA nao pode declarar acao final executada." });
    }

    for (const rule of SENSITIVE_RULES) {
      if (!rule.pattern.test(value)) continue;
      if (hasInternalSource(internalSources, rule.key)) continue;
      if (rule.blockedActions.test(value) || rule.key !== "deadline") {
        violations.push({
          code: `missing_internal_source_${rule.key}`,
          message: `${rule.key} precisa vir de fonte interna.`
        });
      }
    }

    if (classification.requiresHandoff || route.requiresHuman) {
      return {
        approved: false,
        action: "handoff",
        violations,
        reason: "human_handoff_required"
      };
    }

    return {
      approved: violations.length === 0,
      action: violations.length === 0 ? "allow_send" : "block_send",
      violations,
      reason: violations.length === 0 ? "approved" : "guardrail_blocked"
    };
  }
}

function hasInternalSource(internalSources = {}, key = "") {
  if (internalSources[key] === true) return true;
  if (Array.isArray(internalSources.allowedCommercialFields)) {
    return internalSources.allowedCommercialFields.includes(key);
  }
  return false;
}
