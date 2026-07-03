# SamBah Event Driven Architecture

## Visao

O SamBah passa a ter uma base event-driven simulada. Os modulos continuam monoliticos no projeto atual, mas publicam eventos operacionais para preparar a evolucao futura para filas reais.

## Fontes iniciais

- SamBah Pay: `payment.created`, `payment.confirmed`, `payment.failed`
- Wallet: `wallet.credited`, `wallet.debited`
- AutoServe: `autoserve.checkout.completed`
- Locker Frio: `locker.pickup.created`, `locker.pickup.completed`, `locker.pickup.partial`, `locker.pickup.fraud_suspected`
- Devices: `device.heartbeat.received`, `device.offline`, `machine_alert.created`
- ERP futuro: `erp.sync.requested`, `erp.sync.completed`, `erp.sync.failed`
- Auditoria e seguranca: `audit.created`, `security.event.prepared`

## Correlacao

Cada evento possui:

- `id`
- `type`
- `aggregateType`
- `aggregateId`
- `correlationId`
- `causationId`
- `payload`
- `metadata`
- `status`
- `attempts`

## Limites desta fase

Nao ha Kafka, RabbitMQ, Redis Streams, microsservicos, ERP real, Pix real, TEF real, MQTT real ou hardware real.
## FASE 6 - Mensageria Real Futura

A arquitetura passa a ter uma camada `SamBah Messaging Layer` acima do Event Bus interno. O modo padrao segue `internal`; Redis Streams e RabbitMQ ficam preparados como adapters mockados; Kafka permanece documentado como futuro.

Regras preservadas:

- `correlationId` obrigatorio em mensagens operacionais.
- `causationId` preservado quando uma mensagem deriva de evento anterior.
- Nenhum broker real e obrigatorio para rodar testes ou servidor local.
