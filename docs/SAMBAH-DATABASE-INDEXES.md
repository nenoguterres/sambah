# SamBah Database Indexes

## Indices Preparados

As migrations incluem indices para:

- `correlation_id`
- `causation_id`
- `type`
- `event_type`
- `severity`
- `status`
- `created_at`
- `captured_at`

## Crescimento

Audit logs e events incluem nota de particionamento futuro por `created_at`, mas particionamento real nao e obrigatorio nesta fase.
