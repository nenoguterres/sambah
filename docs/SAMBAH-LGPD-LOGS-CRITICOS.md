# SamBah LGPD e Logs Criticos

## Objetivo

Criar uma camada simulada de governanca para logs criticos, privacidade e retencao antes de integrar fornecedores reais.

## Tela

- `/sambah-lgpd`

## Endpoints

- `GET /api/sambah-lgpd/dashboard`
- `GET /api/sambah-lgpd/critical-logs`
- `GET /api/sambah-lgpd/audit/export`
- `GET /api/sambah-lgpd/privacy-requests`
- `POST /api/sambah-lgpd/privacy-requests`
- `POST /api/sambah-lgpd/privacy-requests/:id`
- `GET /api/sambah-lgpd/retention-policies`
- `POST /api/sambah-lgpd/retention-policies`

## Garantias

- Exportacao de auditoria e mascarada.
- Dados sensiveis sao mascarados antes de aparecerem em painel/export.
- Solicitacoes LGPD sao simuladas e auditadas.
- Politicas de retencao sao documentadas.
- Nenhum dado real e apagado automaticamente nesta fase.
- PostgreSQL preparado na FASE 5 mantem as politicas de retencao como contrato futuro, sem exclusao automatica.

## Permissoes

- `ADMIN`: visualizar, exportar e gerenciar solicitacoes/politicas.
- `AUDITOR`: visualizar e exportar.
- `GERENTE`: visualizar logs e painel.
- Demais perfis: bloqueados para endpoints LGPD.
