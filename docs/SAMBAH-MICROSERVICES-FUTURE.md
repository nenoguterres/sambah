# SamBah Microservices Future

## Visao Futura

O modulo atual continua monolitico. O Event Bus simulado cria contratos para uma possivel separacao futura em servicos:

- Pay
- Wallet
- AutoServe
- Locker
- Devices
- Voice Pay
- BI
- Observability
- Integracoes ERP/Pix/TEF

## Contrato de Migracao

Eventos devem manter:

- `type`
- `aggregateId`
- `correlationId`
- `causationId`
- `payload`
- `metadata`

## Fora do Escopo Atual

Nao ha deploy distribuido, service discovery, filas reais, API Gateway novo ou bancos separados.
