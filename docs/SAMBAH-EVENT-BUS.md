# SamBah Event Bus

Fase 1 implementada em modo simulado.

## Objetivo

Centralizar eventos operacionais do ecossistema SamBah em um barramento local com event store, outbox, consumidores mockados, retry, dead letter e correlacao por `correlationId`.

## Rotas

- `POST /api/sambah-events/publish`
- `GET /api/sambah-events`
- `GET /api/sambah-events/outbox`
- `GET /api/sambah-events/dead-letter`
- `POST /api/sambah-events/process`
- `POST /api/sambah-events/retry/:eventId`
- `POST /api/sambah-events/retry-all`
- `GET /api/sambah-events/consumers`
- `GET /api/sambah-events/correlation/:correlationId`
- `POST /api/sambah-events/simulate-erp-failure`
- `POST /api/sambah-events/simulate-payment-confirmed`

## Persistencia

- `data/sambah-events.json`
- `data/sambah-event-outbox.json`
- `data/sambah-event-dead-letter.json`
- `data/sambah-event-consumer-state.json`
- `data/sambah-metrics.json`
- `data/sambah-traces.json`
- `data/sambah-operational-alerts.json`

## Consumidores Mockados

- `audit`
- `erp`
- `bi`
- `security`
- `notification`

Os consumidores usam chave idempotente `consumer:eventId`, evitando processamento duplicado.

## Regras

- Todo evento publicado entra no event store e na outbox.
- Toda publicacao registra trace e auditoria simulada.
- Falha ERP simulada gera `erp.sync.failed`.
- Falha persistente vai para dead letter.
- Alertas criticos sao registrados no Cockpit Operacional.
- Eventos criticos mapeados pelo Security Bridge podem gerar `security.incident.created`.
- Migrations PostgreSQL futuras incluem indices para `correlation_id`, `causation_id`, `type`, `status` e `created_at`.
- Nenhum broker real foi implementado nesta fase.

## FASE 6 - Messaging Layer

O Event Bus interno continua sendo o padrao operacional. A camada `SamBah Messaging Layer` adiciona contratos, rotas e adapters mockados para Redis Streams, RabbitMQ e Kafka futuro sem trocar o barramento atual.
