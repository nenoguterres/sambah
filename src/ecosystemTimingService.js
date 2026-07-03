const REQUIRED_SOURCES = ["mesa", "sambahPay", "sambah", "perola"];

export function buildDemographicTimingContext(input = {}) {
  const missingSources = REQUIRED_SOURCES.filter((source) => !isPresent(input[source]));
  const mesa = input.mesa || {};
  const sambahPay = input.sambahPay || {};
  const sambah = input.sambah || {};
  const perola = input.perola || {};
  const context = {
    source: "ecosystem",
    strategyType: "demographic_timing",
    status: "ready_for_perola_action",
    timingWindow: {
      start: text(mesa.period?.start),
      end: text(mesa.period?.end)
    },
    targetDemographic: text(sambah.targetDemographic),
    productFocus: text(sambahPay.productFocus),
    reason: text(mesa.signalType),
    suggestedActionType: text(perola.actionType),
    requiresAdminApproval: true,
    readiness: missingSources.length ? "incomplete" : "complete",
    modulePlan: buildModulePlan()
  };

  if (missingSources.length) {
    context.missingSources = missingSources;
  }

  return context;
}

export function buildModuleTimingPayloads(context = {}) {
  return {
    mesa: {
      source: "perola",
      timingStrategy: "demographic_timing",
      mesaStatus: "waiting_mesa_ack",
      useMesaRules: true
    },
    sambah: {
      source: "perola",
      timingStrategy: "demographic_timing",
      sambahStatus: "waiting_crm_action",
      useSambahRules: true
    },
    sambahPay: {
      source: "perola",
      timingStrategy: "demographic_timing",
      payStatus: "waiting_commercial_rule",
      useSambahPayRules: true
    },
    perola: {
      source: "ecosystem",
      timingStrategy: text(context.strategyType || "demographic_timing"),
      perolaStatus: "ready_to_create_campaign",
      usePerolaRules: true
    }
  };
}

function buildModulePlan() {
  return {
    mesa: {
      role: "execute_on_operation",
      useOwnRules: true,
      targets: ["tv", "panels", "menu"]
    },
    sambah: {
      role: "communicate_with_customers",
      useOwnRules: true,
      targets: ["crm", "whatsapp"]
    },
    sambahPay: {
      role: "apply_commercial_rule_after_approval",
      useOwnRules: true,
      targets: ["self_service", "checkout"]
    },
    perola: {
      role: "create_campaign_and_content",
      useOwnRules: true,
      targets: ["campaign", "post", "commercial_action"]
    }
  };
}

function isPresent(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "") {
  return String(value || "").trim();
}
