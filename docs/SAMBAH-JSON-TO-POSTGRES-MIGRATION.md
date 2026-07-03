# SamBah JSON para PostgreSQL

## Plano Seguro

1. Fazer backup completo de `data/*.json`.
2. Subir PostgreSQL em ambiente de teste.
3. Executar migrations SQL.
4. Criar job de importacao por modulo.
5. Validar contagens entre JSON e SQL.
6. Rodar app em `DATABASE_MODE=json` durante comparacao.
7. Alternar para `DATABASE_MODE=postgres` apenas depois de homologacao.

## Regra

Esta fase nao executa migracao automatica nem apaga JSON.
