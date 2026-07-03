# SamBah Weight Flows

## Leitura simples

1. Um device, zona ou simulador informa peso esperado.
2. MockScaleAdapter retorna peso real simulado.
3. A leitura e gravada em weight_readings.
4. Um weight_event e audit_log sao registrados.

## Validacao

1. O service compara peso esperado, peso real e tolerance_percent.
2. Dentro da tolerancia: weight_ok.
3. Abaixo da tolerancia: weight_under.
4. Acima da tolerancia: weight_over.
5. Sem produto ou peso zero esperado em retirada: weight_missing.
6. Peso instavel: weight_unstable.
7. Excesso critico com pagamento, release ou pickup: weight_fraud_suspected.

## Locker Frio

1. A porta/zona tem peso anterior e peso posterior simulados.
2. A diferenca vira actual_weight retirado.
3. Peso dentro da tolerancia marca item como picked_up.
4. Peso sem mudanca marca item como not_picked_up.
5. Peso acima do autorizado marca extra_quantity_suspected.
6. Sessao critica vira fraud_suspected ou partial_pickup.

## Estoque por peso

1. O sistema calcula quantidade fisica estimada por peso.
2. Compara quantidade fisica com estoque logico.
3. Divergencia gera weight_inventory_mismatch, machine_alert, audit_log e contrato i9ACAO futuro.
4. Zona sem produto pode ser marcada como empty e product_unavailable.

## Bebidas e self-service

As simulacoes usam gramas como aproximacao de ml ou porcao em kg. Nao ha valvula real, corte real, hardware real ou sensor real.

Resultados abaixo/acima do esperado podem preparar eventos futuros under_delivery e over_delivery.
