# SamBah Messaging Failover

Nesta fase, failover e apenas simulado.

## Simulacao

`POST /api/sambah-messaging/simulate-broker-failure`

Gera:

- Evento `messaging.broker.failed`
- `operational_alert`
- `audit_log`

## Sem efeito colateral real

- Nao derruba o app.
- Nao tenta reconectar broker real.
- Nao instala Redis, RabbitMQ ou Kafka.
