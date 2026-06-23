export function buildMesaOperationalSignal(input = {}) {
  return {
    source: "mesa",
    signalType: input.type,
    period: input.period,
    summary: input.summary,
    severity: input.severity,
    status: "detected"
  };
}

export function buildMesaReceivedCommercialAction(commercialAction = {}) {
  if (commercialAction.status !== "approved") return null;

  const product = commercialAction.product || {};
  const productName = commercialAction.productName || product.name || "";
  const channels = Array.isArray(commercialAction.channels) && commercialAction.channels.length
    ? commercialAction.channels
    : ["Cardapio do Mesa", "Telas do Mesa", "SamBah"];

  return {
    source: commercialAction.origin,
    status: "approved",
    actionId: commercialAction.id,
    actionType: commercialAction.type,
    title: commercialAction.title,
    description: commercialAction.description,
    productId: commercialAction.productId || product.id || "",
    productName,
    product: {
      id: commercialAction.productId || product.id || "",
      name: productName
    },
    channels,
    startsAt: commercialAction.startsAt,
    endsAt: commercialAction.endsAt,
    mesaStatus: "waiting_mesa_ack",
    requiresCashierOk: true,
    useMesaRules: true
  };
}
