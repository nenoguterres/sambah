function getHighestBy(products, field) {
  return products.reduce((bestProduct, currentProduct) => {
    if (!bestProduct || currentProduct[field] > bestProduct[field]) {
      return currentProduct;
    }

    return bestProduct;
  }, null);
}

function score(value, max, floor = 20) {
  if (!max) return floor;
  return Math.min(100, Math.max(floor, Math.round((Number(value || 0) / max) * 100)));
}

export function generateSalesInsights(report) {
  const products = Array.isArray(report && report.productsSold)
    ? report.productsSold
    : [];
  const maxQuantity = Math.max(...products.map((product) => Number(product.quantity || 0)), 0);
  const maxRevenue = Math.max(...products.map((product) => Number(product.revenue || 0)), 0);
  const enrichedProducts = products.map((product) => {
    const quantity = Number(product.quantity || 0);
    const previousQuantity = Number(product.previousQuantity || 0);
    const revenue = Number(product.revenue || 0);
    const growthPercent = previousQuantity > 0
      ? Math.round(((quantity - previousQuantity) / previousQuantity) * 100)
      : quantity > 0 ? 100 : 0;
    return {
      ...product,
      growthPercent,
      relevanceScore: score(quantity, maxQuantity),
      salesPotentialScore: score(revenue, maxRevenue),
      urgencyScore: Math.min(100, Math.max(20, Number(product.stock || 0) > quantity ? 78 : 46)),
    };
  });
  const topSellingProduct = getHighestBy(enrichedProducts, 'quantity');
  const highestRevenueProduct = getHighestBy(enrichedProducts, 'revenue');
  const growingProduct = getHighestBy(enrichedProducts, 'growthPercent');
  const decliningProduct = enrichedProducts.reduce((lowestProduct, currentProduct) => {
    if (!lowestProduct || currentProduct.growthPercent < lowestProduct.growthPercent) return currentProduct;
    return lowestProduct;
  }, null);
  const promotionOpportunity = enrichedProducts
    .slice()
    .sort((left, right) => (right.stock - right.quantity) - (left.stock - left.quantity))[0] || null;

  return {
    products: enrichedProducts,
    topSellingProduct,
    highestRevenueProduct,
    growingProduct,
    decliningProduct,
    promotionOpportunity,
    bestHour: report && report.strongestHour ? report.strongestHour : null,
    bestDay: report && report.strongestDay ? report.strongestDay : null,
    insights: [
      { type: 'produto_campeao', label: 'Produto campeao', product: topSellingProduct, score: topSellingProduct?.relevanceScore || 0 },
      { type: 'maior_faturamento', label: 'Maior faturamento', product: highestRevenueProduct, score: highestRevenueProduct?.salesPotentialScore || 0 },
      { type: 'produto_em_crescimento', label: 'Produto em crescimento', product: growingProduct, score: growingProduct?.relevanceScore || 0 },
      { type: 'produto_em_queda', label: 'Produto em queda', product: decliningProduct, score: decliningProduct?.urgencyScore || 0 },
      { type: 'horario_campeao', label: 'Horario campeao', value: report && report.strongestHour ? report.strongestHour : null, score: 88 },
      { type: 'dia_campeao', label: 'Dia campeao', value: report && report.strongestDay ? report.strongestDay : null, score: 86 },
      { type: 'oportunidade_promocional', label: 'Oportunidade promocional', product: promotionOpportunity, score: promotionOpportunity?.urgencyScore || 0 },
    ],
  };
}
