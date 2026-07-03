# SamBah ERP Failover

## Estado Atual

O failover ERP e simulado pelo Event Bus. Quando um pagamento confirmado e processado, o consumidor ERP mockado publica `erp.sync.requested`.

## Falha Simulada

Use:

```powershell
POST /api/sambah-events/simulate-erp-failure
POST /api/sambah-events/process
```

Quando a falha esta ativa, `erp.sync.requested` falha e gera:

- `erp.sync.failed`
- incremento de metrica `erp_failures`
- retry manual por `POST /api/sambah-events/retry/:eventId`
- dead letter apos 3 tentativas
- alerta operacional `erp.failure.threshold`

## Futuro

Adapters reais de ERP devem consumir o mesmo contrato, sem alterar os fluxos de Pay, Locker ou Central.
