export function buildEcosystemDistributionPackage(approvedAction = {}) {
  if (approvedAction.status !== "approved_by_admin") {
    return {
      integrationStatus: "not_ready_for_distribution",
      reason: "action_not_approved_by_admin"
    };
  }

  const modulePayloads = approvedAction.modulePayloads || {};
  const basePackage = {
    source: "ecosystem",
    origin: "perola",
    actionId: text(approvedAction.id),
    sourceStrategy: text(approvedAction.sourceStrategy || "demographic_timing"),
    actionType: text(approvedAction.type),
    title: text(approvedAction.title),
    description: text(approvedAction.description),
    timingWindow: normalizeTimingWindow(approvedAction.timingWindow),
    targetDemographic: text(approvedAction.targetDemographic),
    productFocus: text(approvedAction.productFocus),
    integrationStatus: "ready_for_module_ack",
    requiresModuleAck: true
  };

  return {
    ...basePackage,
    targets: {
      mesa: buildTarget(modulePayloads.mesa, "mesa_ack"),
      sambah: buildTarget(modulePayloads.sambah, "sambah_ack"),
      sambahPay: buildTarget(modulePayloads.sambahPay, "sambah_pay_ack"),
      perola: buildTarget(modulePayloads.perola, "perola_ack")
    }
  };
}

export function buildMesaPackageFromDistribution(distributionPackage = {}) {
  if (distributionPackage.integrationStatus !== "ready_for_module_ack") return null;
  return {
    source: "perola",
    actionId: text(distributionPackage.actionId),
    actionType: text(distributionPackage.actionType),
    title: text(distributionPackage.title),
    description: text(distributionPackage.description),
    timingWindow: normalizeTimingWindow(distributionPackage.timingWindow),
    productFocus: text(distributionPackage.productFocus),
    mesaStatus: "waiting_mesa_ack",
    requiresCashierOk: true,
    useMesaRules: true,
    executeAutomatically: false
  };
}

export function buildSambahPackageFromDistribution(distributionPackage = {}) {
  if (distributionPackage.integrationStatus !== "ready_for_module_ack") return null;
  return {
    source: "perola",
    actionId: text(distributionPackage.actionId),
    actionType: text(distributionPackage.actionType),
    title: text(distributionPackage.title),
    description: text(distributionPackage.description),
    targetDemographic: text(distributionPackage.targetDemographic),
    preferredChannel: "whatsapp",
    sambahStatus: "waiting_crm_action",
    useSambahRules: true,
    executeAutomatically: false
  };
}

export function buildSambahPayPackageFromDistribution(distributionPackage = {}) {
  if (distributionPackage.integrationStatus !== "ready_for_module_ack") return null;
  return {
    source: "perola",
    actionId: text(distributionPackage.actionId),
    actionType: text(distributionPackage.actionType),
    title: text(distributionPackage.title),
    productFocus: text(distributionPackage.productFocus),
    timingWindow: normalizeTimingWindow(distributionPackage.timingWindow),
    payStatus: "waiting_commercial_rule",
    useSambahPayRules: true,
    executeAutomatically: false
  };
}

export function buildPerolaPackageFromDistribution(distributionPackage = {}) {
  if (distributionPackage.integrationStatus !== "ready_for_module_ack") return null;
  return {
    source: "ecosystem",
    actionId: text(distributionPackage.actionId),
    actionType: text(distributionPackage.actionType),
    title: text(distributionPackage.title),
    description: text(distributionPackage.description),
    perolaStatus: "waiting_campaign_execution",
    usePerolaRules: true,
    executeAutomatically: false
  };
}

function buildTarget(payload = {}, expectedAck = "") {
  return {
    ...(payload && typeof payload === "object" ? payload : {}),
    deliveryStatus: "ready",
    expectedAck,
    executeAutomatically: false
  };
}

function normalizeTimingWindow(input = {}) {
  return {
    start: text(input.start),
    end: text(input.end)
  };
}

function text(value = "") {
  return String(value || "").trim();
}
