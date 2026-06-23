# SamBah Redis Streams Futuro

Redis Streams esta preparado como adapter mockado para uma fase futura.

## Quando usar

- Filas leves e persistentes.
- Processamento por grupos de consumidores.
- Ambientes onde Redis ja existe na infraestrutura.

## Estado atual

- `MESSAGE_BROKER=redis_streams` e `REDIS_URL` sao reconhecidos.
- Nenhuma conexao real e aberta.
- Health retorna `mock_ready` quando configurado ou `not_configured` quando ausente.
