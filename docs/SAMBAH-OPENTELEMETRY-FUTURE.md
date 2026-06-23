# SamBah OpenTelemetry Future

## Proposito

Preparar a evolucao futura para OpenTelemetry sem ativar coletor real nesta fase.

## Mapeamento Futuro

- `correlationId` -> trace id de negocio
- `causationId` -> span/evento causador
- `traces` locais -> spans exportaveis
- `operationalAlerts` -> eventos ou logs estruturados

## Nao Implementado Agora

- Collector real
- Exporter OTLP
- Instrumentacao automatica
- Propagacao distribuida entre microsservicos
