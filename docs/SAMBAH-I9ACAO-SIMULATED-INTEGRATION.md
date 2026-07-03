# SamBah i9ACAO Simulated Integration

## Estado

A integracao i9ACAO nesta fase e simulada. O SamBah prepara incidentes e contratos de envio futuro, mas nao chama API externa.

## Fluxo

1. Evento critico entra no Event Bus.
2. Security Bridge avalia a regra.
3. Incidente de seguranca e criado.
4. Auditoria e registrada.
5. Evento `security.incident.created` e publicado.
6. Cockpit e painel `/sambah-security` passam a exibir o caso.

## Eventos Mapeados

- `locker.pickup.fraud_suspected`
- `locker.pickup.partial`
- `machine_alert.created`
- `weight.fraud_suspected`
- `weight.inventory_mismatch`
- `zone_not_authorized`
- `door_open_without_payment`
- `device.offline`
- `delivery_failed`
- `over_delivery`
- `under_delivery`
