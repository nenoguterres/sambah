# SamBah Message Contracts

Modelo padrao:

```json
{
  "id": "msg_...",
  "eventId": "evt_...",
  "type": "payment.confirmed",
  "topic": "sambah.payments",
  "routingKey": "payment.confirmed",
  "source": "sambah-pay",
  "correlationId": "corr_...",
  "causationId": "evt_...",
  "payload": {},
  "headers": {
    "schemaVersion": "1.0",
    "actor": "admin",
    "role": "ADMIN",
    "origin": "api"
  },
  "createdAt": "..."
}
```

Contratos iniciais:

- `payment.confirmed -> sambah.payments`
- `wallet.credited -> sambah.wallet`
- `locker.pickup.completed -> sambah.locker`
- `locker.pickup.fraud_suspected -> sambah.security`
- `machine_alert.created -> sambah.security`
- `device.offline -> sambah.devices`
- `erp.sync.failed -> sambah.erp`
- `audit.created -> sambah.audit`
- `lgpd.request.created -> sambah.lgpd`
- `security.incident.created -> sambah.security`
