# SamBah Weight i9ACAO Future Contract

Esta fase apenas prepara o contrato. Nenhum envio real e executado.

## Event types

- weight_fraud_suspected
- weight_inventory_mismatch
- weight_unstable
- pickup_extra_quantity
- door_open_without_weight_change
- over_delivery
- under_delivery

## Payload

```json
{
  "source": "sambah-pay",
  "module": "weight-control",
  "eventType": "weight_fraud_suspected",
  "severity": "high",
  "deviceId": "device-123",
  "zoneId": "Z01",
  "productId": "agua",
  "pickupSessionId": "session-123",
  "paymentId": "payment-123",
  "expectedWeight": 400,
  "actualWeight": 650,
  "unit": "g",
  "timestamp": "2026-06-15T00:00:00.000Z",
  "actionRequired": true
}
```

## Persistencia simulada

Os eventos ficam em sambah-pay-i9acao-security-events.json com simulated: true e sent: false.
