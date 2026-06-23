# SamBah RabbitMQ Futuro

RabbitMQ esta preparado como adapter mockado para uma fase futura.

## Quando usar

- Roteamento por exchanges e routing keys.
- Padroes de confirmacao, retry e dead letter mais ricos.
- Integracoes entre servicos com diferentes ritmos.

## Estado atual

- `MESSAGE_BROKER=rabbitmq` e `RABBITMQ_URL` sao reconhecidos.
- Nenhuma conexao real e aberta.
- Health retorna `mock_ready` quando configurado ou `not_configured` quando ausente.
