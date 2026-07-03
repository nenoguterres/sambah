# SamBah PostgreSQL Prepared

## Estado

PostgreSQL esta preparado como adapter opcional. A fase cria migrations, contracts e health check, mas nao migra dados reais automaticamente.

## Adapter

Arquivo:

- `src/sambahPay/database/postgresRepositoryAdapter.js`

O adapter tenta importar `pg` apenas quando o health PostgreSQL e executado em modo `postgres`. Sem `DATABASE_URL`, retorna `not_configured`.

## Fora do Escopo

- Instalacao de PostgreSQL.
- Migracao automatica.
- Docker ou Kubernetes.
- Troca obrigatoria dos services para SQL.
