function formatCurrencyBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function generatePostIdeasFromInsights(insights) {
  const topSellingProduct = insights && insights.topSellingProduct;
  const highestRevenueProduct = insights && insights.highestRevenueProduct;
  const bestHour = insights && insights.bestHour;
  const bestDay = insights && insights.bestDay;

  return [
    {
      type: 'produto_campeao',
      title: 'Produto campeao da semana',
      idea: topSellingProduct
        ? 'Mostrar o ' + topSellingProduct.name + ' como o queridinho dos clientes, destacando ' + topSellingProduct.quantity + ' vendas no periodo.'
        : 'Mostrar o produto mais vendido assim que houver dados suficientes.',
      suggestedCaption: topSellingProduct
        ? 'O favorito da casa passou por aqui: ' + topSellingProduct.name + ' foi o campeao de pedidos da semana.'
        : 'O favorito da casa esta quase aparecendo por aqui.',
      relevanceScore: topSellingProduct ? topSellingProduct.relevanceScore : 0,
      salesPotentialScore: topSellingProduct ? topSellingProduct.salesPotentialScore : 0,
      urgencyScore: topSellingProduct ? topSellingProduct.urgencyScore : 0,
    },
    {
      type: 'horario_pico',
      title: 'Movimento no horario forte',
      idea: bestHour
        ? 'Criar um post convidando o publico para aproveitar o movimento do horario ' + bestHour + '.'
        : 'Criar um post de horario de pico quando o relatorio indicar o melhor periodo.',
      suggestedCaption: bestHour
        ? 'Entre ' + bestHour + ', o Perola fica no ponto certo para aquele pedido caprichado.'
        : 'Quando o movimento esquenta, o Perola prepara algo especial.',
      relevanceScore: 86,
      salesPotentialScore: 82,
      urgencyScore: 58,
    },
    {
      type: 'campanha_dia_forte',
      title: 'Campanha para o dia forte',
      idea: bestDay
        ? 'Planejar uma campanha para ' + bestDay + ', puxando o produto de maior faturamento: ' + (highestRevenueProduct ? highestRevenueProduct.name : 'item destaque') + '.'
        : 'Planejar uma campanha para o dia mais forte quando o relatorio estiver completo.',
      suggestedCaption: bestDay && highestRevenueProduct
        ? bestDay + ' pede destaque especial: ' + highestRevenueProduct.name + ', que ja movimentou ' + formatCurrencyBRL(highestRevenueProduct.revenue) + '.'
        : 'O melhor dia merece uma campanha sob medida no Perola.',
      relevanceScore: highestRevenueProduct ? highestRevenueProduct.relevanceScore : 0,
      salesPotentialScore: highestRevenueProduct ? highestRevenueProduct.salesPotentialScore : 0,
      urgencyScore: 72,
    },
    {
      type: 'produto_em_crescimento',
      title: 'Produto crescendo no gosto do publico',
      idea: insights && insights.growingProduct
        ? 'Destacar o crescimento do ' + insights.growingProduct.name + ' e convidar clientes a experimentar enquanto esta em alta.'
        : 'Destacar um produto em crescimento quando houver historico suficiente.',
      suggestedCaption: insights && insights.growingProduct
        ? insights.growingProduct.name + ' ganhou tracao e merece aparecer no feed do Perola.'
        : 'Tem produto ganhando forca no Perola.',
      relevanceScore: insights && insights.growingProduct ? insights.growingProduct.relevanceScore : 0,
      salesPotentialScore: insights && insights.growingProduct ? insights.growingProduct.salesPotentialScore : 0,
      urgencyScore: 64,
    },
    {
      type: 'estoque_parado',
      title: 'Oportunidade para produto parado',
      idea: insights && insights.promotionOpportunity
        ? 'Criar campanha leve para girar ' + insights.promotionOpportunity.name + ' sem publicar automaticamente.'
        : 'Criar campanha de giro para produto com estoque parado.',
      suggestedCaption: insights && insights.promotionOpportunity
        ? 'Hoje e um bom dia para redescobrir ' + insights.promotionOpportunity.name + '.'
        : 'O Perola encontrou uma oportunidade de giro.',
      relevanceScore: insights && insights.promotionOpportunity ? insights.promotionOpportunity.relevanceScore : 0,
      salesPotentialScore: insights && insights.promotionOpportunity ? insights.promotionOpportunity.salesPotentialScore : 0,
      urgencyScore: insights && insights.promotionOpportunity ? insights.promotionOpportunity.urgencyScore : 0,
    },
    {
      type: 'urgencia',
      title: 'Chamada de urgencia simulada',
      idea: insights && insights.decliningProduct
        ? 'Criar uma chamada de urgencia controlada para testar recuperacao do ' + insights.decliningProduct.name + '.'
        : 'Criar chamada de urgencia simulada para produto que precisa de atencao.',
      suggestedCaption: insights && insights.decliningProduct
        ? insights.decliningProduct.name + ' merece uma nova chance hoje.'
        : 'Tem oportunidade pedindo acao rapida no Perola.',
      relevanceScore: insights && insights.decliningProduct ? insights.decliningProduct.relevanceScore : 0,
      salesPotentialScore: insights && insights.decliningProduct ? insights.decliningProduct.salesPotentialScore : 0,
      urgencyScore: insights && insights.decliningProduct ? insights.decliningProduct.urgencyScore : 0,
    },
  ].map((idea) => ({
    ...idea,
    score: Math.round(((idea.relevanceScore || 0) + (idea.salesPotentialScore || 0) + (idea.urgencyScore || 0)) / 3),
  }));
}
