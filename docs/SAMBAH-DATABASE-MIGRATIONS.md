# SamBah Database Migrations

## Arquivos

- `001_create_audit_logs.sql`
- `002_create_events.sql`
- `003_create_payments_wallets.sql`
- `004_create_devices_lockers.sql`
- `005_create_alerts_security.sql`
- `006_create_lgpd_critical_logs.sql`
- `007_create_observability.sql`

## Dry-run

```http
POST /api/sambah-database/migrations/dry-run
```

O dry-run lista arquivos, tabelas e indices sem executar banco real.
