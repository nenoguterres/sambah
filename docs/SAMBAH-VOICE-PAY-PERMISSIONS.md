# SamBah Voice Pay Permissions

## Acoes protegidas

- checkout por voz: ADMIN, CAIXA.
- wallet topup por voz: ADMIN, CAIXA.
- autoserve release por voz: ADMIN.
- handoff humano: ADMIN, OPERADOR, ATENDENTE.
- auditoria completa: ADMIN, AUDITOR.
- auditoria resumida: CAIXA.
- reprocessamento/mock confirmacao de intent: ADMIN.

## UI

O painel /sambah-voice-pay exibe perfil ativo e seletor mockado. Botoes sem permissao ficam desabilitados. A protecao principal fica no backend, usando o header x-sambah-role.

Em SAMBAH_AUTH_MODE=session, o perfil ativo vem da sessao interna do operador e o header x-sambah-role nao libera acoes criticas sozinho. O seletor mockado fica oculto na UI.

Em SAMBAH_AUTH_MODE=mock, o seletor mockado e o header x-sambah-role continuam disponiveis para desenvolvimento e testes controlados.

## Matriz administrativa

- Tela: /admin/permissoes.
- Endpoint: GET /api/sambah-pay/permissions/matrix.
- Objetivo: visualizar, em uma tabela administrativa simples, os estados Liberado, Parcial e Bloqueado por perfil e por acao critica do SamBah Voice Pay.
- Escopo atual: permissoes internas locais com sessao simples e modo mock controlado para testes.
- Fora do escopo desta fase: autenticacao externa, OAuth, login social, gateway de pagamento, ERP e WhatsApp/Meta.

## Autenticacao

- Login: /login.
- Me: GET /api/auth/me.
- Logout: POST /api/auth/logout.
- Variavel de segredo: SAMBAH_SESSION_SECRET.
- Variavel de modo: SAMBAH_AUTH_MODE.
- Usuarios dev documentados em docs/SAMBAH-AUTH.md.

## Proximos passos

- Persistir usuarios com senha criptografada administravel.
- Criar tela de usuarios editaveis no admin.
- Adicionar recuperacao de senha.
- Manter auditoria de negativas com sambah_permission_denied durante a transicao.
