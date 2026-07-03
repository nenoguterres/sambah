# SamBah Cockpit Operacional

## Objetivo

Dar visibilidade ao ecossistema SamBah em uma tela operacional unica, conectada ao Event Bus simulado.

## Tela

- `/sambah-observability`

## Recursos

- Health geral do barramento.
- Metricas de fila, falhas e dead letter.
- Traces recentes.
- Alertas abertos e resolvidos.
- Busca por `correlationId`.
- Simulacao de alerta critico.
- Link direto para `/sambah-events` e `/sambah-central`.
- Metricas de seguranca: `security_incidents_open`, `security_incidents_critical`, `security_incidents_by_module`, `security_incidents_by_status` e `security_actions_mocked`.

## Regra de operacao

O Cockpit nao resolve integracoes reais. Ele registra, exibe e correlaciona eventos simulados para validar o desenho operacional.
## Metricas de mensageria

FASE 6 adiciona:

- `messaging_broker_current`
- `messaging_test_messages`
- `messaging_failures`
- `messaging_replays`
- `messaging_contracts_count`
- `messaging_topics_count`
