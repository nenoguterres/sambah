# SamBah Auditoria

## Tela

- Rota: /admin/auditoria.
- Acesso: exige login interno no modo session.
- Link de entrada: /admin, atalho "Auditoria SamBah".

## Endpoint

- GET /api/admin/auditoria.
- Acesso: exige sessao valida no modo session.
- Limite inicial: ultimos 100 eventos.
- Ordenacao: eventos mais recentes primeiro.

## Campos exibidos

- timestamp: data/hora do evento.
- event: tipo publico do evento.
- username: usuario que executou ou tentou executar a acao, quando existir.
- role: perfil do usuario que executou ou tentou executar a acao.
- source: origem publica do evento.
- action: acao ou permissao relacionada.
- status: status do evento.
- route: rota relacionada, quando existir.
- method: metodo HTTP relacionado, quando existir.
- reason: motivo publico do evento.
- targetUsername: usuario alvo de uma acao administrativa, quando existir.
- targetRole: perfil do usuario alvo, quando existir.

## Tipos de eventos

- sambah_login_success: login interno realizado.
- sambah_login_failed: tentativa de login recusada.
- sambah_logout: logout interno realizado.
- sambah_permission_denied: acao bloqueada por permissao.
- sambah_user_created: usuario interno criado.
- sambah_user_updated: nome ou perfil de usuario interno atualizado.
- sambah_user_password_changed: credencial de usuario interno alterada.
- sambah_user_status_changed: usuario interno ativado ou desativado.

## Destaques visuais

- Permissao negada: destaque vermelho.
- Criacao/edicao de usuario: destaque azul.
- Troca de credencial: destaque amarelo.
- Ativacao/desativacao: destaque verde.

## Seguranca

- A tela /admin/auditoria redireciona anonimos para /login.
- O endpoint /api/admin/auditoria retorna 401 sem sessao.
- A resposta nao expoe contexto bruto do audit_log.
- A resposta nao expoe senha, hash, salt, cookie, token ou segredo.
- Eventos de login e gestao de usuarios mostram ator e alvo separados.
- Eventos de permissao negada continuam destacados pela tela.
- Nenhuma integracao externa foi criada.
- Nenhum banco novo foi criado.

## Proximos passos

- Filtros por data.
- Filtros por usuario.
- Filtros por tipo de evento.
- Exportacao CSV.
- Paginacao.
- Auditoria persistente em banco.
