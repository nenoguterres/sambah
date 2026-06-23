# SamBah Permissions

Camada simulada de permissao interna. Nao existe login real nesta fase.

## Perfis

- ADMIN: acesso operacional completo.
- CAIXA: checkout por voz, wallet topup, sessoes e auditoria resumida.
- OPERADOR: dashboard, simulacao, consulta de sessao e handoff.
- ATENDENTE: simulacao, resposta, handoff e consulta de intent.
- AUDITOR: dashboard, sessoes e auditoria completa, sem acoes operacionais.

## Header mockado

As rotas criticas podem receber:

```http
x-sambah-role: ADMIN
```

Sem header, o perfil padrao e ATENDENTE.

Toda negativa gera audit_log com tipo `sambah_permission_denied`.

## Ecossistema

O ecossistema reutiliza o header mockado x-sambah-role. Sem header, o backend assume ATENDENTE. O bootstrap operacional exige permissao ecosystem_bootstrap, liberada para ADMIN.
