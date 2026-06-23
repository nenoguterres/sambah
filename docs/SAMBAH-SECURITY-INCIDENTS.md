# SamBah Security Incidents

## Modelo

Cada incidente possui `id`, `module`, `eventType`, `severity`, `status`, `correlationId`, `causationId`, `deviceId`, `zoneId`, `customerId`, `paymentId`, `pickupSessionId`, `message`, `payload` e `recommendedAction`.

## Status

- `open`
- `acknowledged`
- `investigating`
- `resolved`
- `dismissed`
- `escalated`

## Severidade

- `low`
- `medium`
- `high`
- `critical`

## Acoes Simuladas

- `acknowledge`
- `resolve`
- `dismiss`
- `escalate`
- `block_device_mock`
- `block_customer_mock`
- `mark_camera_clip_mock`
- `notify_operator_mock`
- `trigger_siren_mock`
