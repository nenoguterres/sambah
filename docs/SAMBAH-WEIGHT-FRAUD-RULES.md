# SamBah Weight Fraud Rules

## Regras iniciais

- Peso dentro da tolerancia: weight_ok.
- Peso menor que esperado: weight_under.
- Peso maior que esperado: weight_over.
- Peso maior que autorizado em pickup pago: weight_fraud_suspected.
- Peso ausente ou sem mudanca em retirada: weight_missing ou not_picked_up no Locker.
- Peso instavel: weight_unstable.
- Estoque fisico por peso diferente do estoque logico: weight_inventory_mismatch.

## Acoes

- weight_ok: fluxo pode seguir.
- weight_under: operador deve revisar entrega incompleta.
- weight_over: pode indicar entrega acima ou retirada extra.
- weight_fraud_suspected: gera machine_alert, audit_log e evento futuro i9ACAO.
- weight_inventory_mismatch: gera alerta operacional de estoque.
- weight_unstable: exige nova leitura ou revisao manual.
- under_delivery e over_delivery: ficam preparados no contrato futuro i9ACAO quando a simulacao detecta entrega abaixo ou acima.

## Simulacao

Todas as regras sao simuladas. Nenhuma balanca, sensor, trava, locker ou integracao real e acionada.
