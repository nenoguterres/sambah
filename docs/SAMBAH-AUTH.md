# SamBah Auth Interno

## Rotas

- GET /login: tela de login interno.
- POST /api/auth/login: valida usuario e cria sessao.
- POST /api/auth/logout: encerra sessao.
- GET /api/auth/me: retorna o usuario logado sem senha.
- GET /api/auth/users: lista usuarios internos sem credenciais.
- POST /api/auth/users: cria usuario interno. Requer ADMIN em modo session.
- PATCH /api/auth/users/:username: atualiza nome e perfil. Requer ADMIN em modo session.
- POST /api/auth/users/:username/password: troca senha e encerra sessoes do usuario. Requer ADMIN em modo session.
- POST /api/auth/users/:username/status: ativa ou desativa usuario. Requer ADMIN em modo session.

## Usuarios dev

Credenciais apenas para ambiente local/dev:

- atendente / atendente123 / ATENDENTE.
- gerente / gerente123 / GERENTE.
- admin / admin123 / ADMIN.

As senhas nao ficam no frontend nem em respostas de API. No arquivo dev, ficam apenas hashes locais. Na primeira execucao local com sessao, esses usuarios sao copiados para data/auth-users.json e passam a ser administraveis pela tela /admin/usuarios.

## Gestao local

- Tela: /admin/usuarios.
- Permite criar usuario, editar nome/perfil, trocar senha e ativar/desativar.
- Apenas ADMIN consegue alterar usuarios no modo session.
- Usuarios desativados nao fazem login.
- Alteracao de senha e desativacao encerram sessoes ativas daquele usuario.
- Eventos administrativos geram audit_log: sambah_user_created, sambah_user_updated, sambah_user_password_changed e sambah_user_status_changed.

## Sessao

- Cookie HTTP-only: sambah_session.
- Segredo recomendado: SAMBAH_SESSION_SECRET.
- Sem SAMBAH_SESSION_SECRET, o sistema usa fallback local de desenvolvimento.
- As sessoes atuais ficam em memoria e expiram em 8 horas.

## Modos

- SAMBAH_AUTH_MODE=session: modo real/local. Protege /admin, /admin/permissoes e /sambah-voice-pay. Acoes criticas usam o perfil da sessao.
- SAMBAH_AUTH_MODE=mock: modo de desenvolvimento/teste. Mantem x-sambah-role para compatibilidade dos testes e do seletor mockado.

## Proximos passos

- Adicionar recuperacao de senha.
- Criar tela dedicada de auditoria administrativa.
- Definir rotina segura de bootstrap do primeiro ADMIN em producao.
