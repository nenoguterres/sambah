# SamBah i9ACAO Future Contract

Esta fase apenas mostra e persiste eventos simulados para contrato futuro. Nenhum envio real para i9ACAO e executado.

Eventos previstos:

- security_violation
- device_offline
- door_open_without_payment
- weight_fraud_suspected
- secure_zone_mismatch
- delivery_failed

Endpoint de consulta:

```http
GET /api/sambah-pay/security/events
```

## Secure Pickup Locker

O locker frio prepara eventos futuros para i9ACAO quando houver security_violation, extra_quantity_suspected, door_open_without_payment, wrong_zone_attempt ou delivery_failed. Nenhum envio real e executado.

## Weight Control

O Weight Control prepara eventos futuros para weight_fraud_suspected, weight_inventory_mismatch, weight_unstable, pickup_extra_quantity, door_open_without_weight_change, over_delivery e under_delivery.

Os eventos sao persistidos em modo simulado com source sambah-pay, module weight-control, severity, deviceId, zoneId, productId, pickupSessionId, paymentId, expectedWeight, actualWeight, unit, timestamp e actionRequired.
# Contrato Futuro i9ACAO

O Security Bridge prepara payloads no formato:

```json
{
  "source": "sambah-pay",
  "target": "i9acao-security",
  "eventType": "security.incident.created",
  "severity": "critical",
  "correlationId": "corr_...",
  "deviceId": "device_...",
  "zoneId": "door_...",
  "cameraId": null,
  "sensorId": null,
  "recommendedAction": "Acionar operador",
  "timestamp": "...",
  "payload": {}
}
```

Nenhum envio real e feito nesta fase.
