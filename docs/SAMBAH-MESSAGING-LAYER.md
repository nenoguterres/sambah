# SamBah Messaging Layer

FASE 6 prepara mensageria real futura sem substituir o Event Bus interno.

## Modo padrao

- `MESSAGE_BROKER=internal`
- Event Bus simulado continua como barramento operacional.
- Redis Streams, RabbitMQ e Kafka nao sao conectados nesta fase.

## Rotas

- `GET /api/sambah-messaging/config`
- `GET /api/sambah-messaging/health`
- `GET /api/sambah-messaging/brokers`
- `GET /api/sambah-messaging/contracts`
- `GET /api/sambah-messaging/routes`
- `POST /api/sambah-messaging/publish-test`
- `POST /api/sambah-messaging/replay/:correlationId`
- `POST /api/sambah-messaging/simulate-redis`
- `POST /api/sambah-messaging/simulate-rabbitmq`
- `POST /api/sambah-messaging/simulate-broker-failure`

## Garantias

- Nao exige broker instalado.
- Nao expõe senhas de URLs.
- Preserva `correlationId` e `causationId`.
- Falha simulada gera `operational_alert`, `audit_log` e evento `messaging.broker.failed`.
