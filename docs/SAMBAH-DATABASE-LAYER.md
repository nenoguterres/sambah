# SamBah Database Layer

## Objetivo

Preparar o SamBah para PostgreSQL sem remover a persistencia JSON atual.

## Modos

- `DATABASE_MODE=json`: padrao atual, usa arquivos em `data/*.json`.
- `DATABASE_MODE=postgres`: usa adapter PostgreSQL futuro.

## Configuracao

```env
DATABASE_MODE=json
DATABASE_URL=postgres://user:password@localhost:5432/sambah
```

`DATABASE_URL` e sempre mascarada nos endpoints.

## Endpoints

- `GET /api/sambah-database/health`
- `GET /api/sambah-database/config`
- `GET /api/sambah-database/migrations`
- `POST /api/sambah-database/migrations/dry-run`
- `POST /api/sambah-database/seed/demo`
- `GET /api/sambah-database/repositories`

## Painel

- `/sambah-database`

## Garantias

- JSON/local continua sendo o modo padrao.
- PostgreSQL nao e obrigatorio para subir o app ou rodar testes.
- Falhas de PostgreSQL retornam health claro e nao derrubam o app no modo JSON.
