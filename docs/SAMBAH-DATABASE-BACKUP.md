# SamBah Database Backup

## JSON Atual

Copiar a pasta `data/` antes de qualquer migracao.

## PostgreSQL Futuro

Quando PostgreSQL for ativado, usar `pg_dump` com retencao externa.

## Politica Recomendada

- Backup diario em operacao real.
- Backup antes de migrations.
- Teste periodico de restore.
