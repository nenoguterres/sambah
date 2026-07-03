# SamBah Observability

## Cockpit Operacional

Painel disponivel em:

- `/sambah-observability`

## Endpoints

- `GET /api/sambah-observability/health`
- `GET /api/sambah-observability/metrics`
- `GET /api/sambah-observability/traces`
- `GET /api/sambah-observability/alerts`
- `GET /api/sambah-observability/correlation/:correlationId`
- `POST /api/sambah-observability/alerts/:id/resolve`
- `POST /api/sambah-observability/simulate-critical-alert`

## Metricas

- `total_events`
- `pending_events`
- `processed_events`
- `failed_events`
- `dead_letter_events`
- `erp_failures`
- `erp_retries`
- `avg_processing_time_ms`
- `locker_fraud_events`
- `machine_alerts_open`
- `security_events_prepared`
- `events_by_type`
- `events_by_status`
- `consumers_status`

## Limites

Prometheus, Grafana, Loki, ELK e OpenTelemetry real nao foram implementados nesta fase.
