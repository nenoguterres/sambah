export function getSalesReportMock() {
  return {
    period: {
      label: 'Semana mockada do Perola',
      startsAt: '2026-06-10',
      endsAt: '2026-06-16',
    },
    productsSold: [
      {
        name: 'Combo Feijoada da Casa',
        quantity: 42,
        revenue: 1890,
        previousQuantity: 32,
        stock: 12,
        category: 'almoco',
      },
      {
        name: 'Executivo de Frango Grelhado',
        quantity: 35,
        revenue: 1225,
        previousQuantity: 39,
        stock: 18,
        category: 'almoco',
      },
      {
        name: 'Suco Natural de Laranja',
        quantity: 58,
        revenue: 696,
        previousQuantity: 44,
        stock: 25,
        category: 'bebida',
      },
      {
        name: 'Pudim Artesanal',
        quantity: 26,
        revenue: 468,
        previousQuantity: 31,
        stock: 9,
        category: 'sobremesa',
      },
      {
        name: 'Sanduiche Gaucho',
        quantity: 12,
        revenue: 420,
        previousQuantity: 28,
        stock: 34,
        category: 'lanche',
      },
    ],
    strongestHour: '12:00 - 14:00',
    strongestDay: 'sexta-feira',
    hourlySales: [
      { hour: '11:00 - 12:00', quantity: 24, revenue: 840 },
      { hour: '12:00 - 14:00', quantity: 72, revenue: 2450 },
      { hour: '18:00 - 20:00', quantity: 39, revenue: 1320 },
    ],
    dailySales: [
      { day: 'quarta-feira', quantity: 37, revenue: 1290 },
      { day: 'quinta-feira', quantity: 43, revenue: 1510 },
      { day: 'sexta-feira', quantity: 68, revenue: 2360 },
    ],
  };
}
