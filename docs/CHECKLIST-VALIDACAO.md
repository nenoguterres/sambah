# Checklist de Validacao

Versao: 1.0.0

## Validacao Local Windows

- [x] Node v24.16.0 validado.
- [x] npm 11.13.0 validado.
- [x] `npm install` executado com sucesso.
- [x] `npm test` executado com sucesso, 5/5.
- [x] Servidor local validado em `127.0.0.1:3000`.
- [x] Admin validado no Chrome real.
- [x] Endpoints de auditoria responderam `200`.
- [x] Webhook manual validado.
- [x] Deduplicacao de `processing_error` validada.
- [x] `data/audit-logs.json` limpo em UTF-8 sem BOM.
- [x] Arquivos temporarios removidos.
- [x] Porta `3000` encerrada apos validacao.

Observacao: no PowerShell, usar `npm.cmd` quando a politica de execucao bloquear `npm.ps1`.

## Auditoria

- [x] `data/audit-logs.json` existe e esta em formato JSON valido.
- [x] Telefones, tokens, senhas e e-mails nao aparecem em claro nos logs.
- [x] Falhas `processing_error` com a mesma chave operacional geram apenas um evento.
- [x] Eventos de webhook recebido e processado sao registrados.
- [x] Erros operacionais sao registrados como `status=error`.

## Endpoints

- [x] `GET /admin/audit/stats` responde `200`.
- [x] `GET /admin/audit/logs?limit=100` responde `200`.
- [x] `GET /admin/audit/logs?status=error&limit=100` responde `200`.
- [x] A consulta com limite ampliado encontra eventos mais antigos.

## Painel

- [x] `GET /admin` abre o painel.
- [x] Contadores por tipo/status aparecem no painel.
- [x] Ultimos erros aparecem com dados mascarados.
- [x] O botao de atualizar recarrega a auditoria.

## Visual

- [x] Paleta principal usa grafite, cinza escuro, azul, ciano e ambar discreto.
- [x] Verde, amarelo e vermelho nao sao usados como identidade visual principal.
- [x] Alertas nao usam vermelho agressivo.
- [x] Sucesso nao usa verde forte.

## Testes

- [x] Rodar `npm test`.
- [x] Validar servidor com `npm start` e acessar `http://localhost:3000/admin`.
- [x] Confirmar que qualquer dado de teste foi removido de `data/audit-logs.json`.
