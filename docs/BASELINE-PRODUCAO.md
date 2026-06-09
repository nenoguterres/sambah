# Baseline de Producao - samBah!

Data do registro: 2026-06-05 02:01:27 -03:00

## Versao

- Aplicacao: samBah!
- Pacote: `sambha-automacao-whats`
- Versao: `1.0.0`
- Node validado nesta maquina: `v24.16.0`
- npm validado nesta maquina: `11.13.0`

## Pasta ativa

```text
C:\Users\PC\Documents\Codex\2026-06-05\sambah
```

## Backup

Backup criado em:

```text
C:\Users\PC\Documents\Codex\2026-06-05\sambah-baseline-producao-2026-06-05.zip
```

Observacao: arquivos `*.log` foram excluidos do zip porque sao artefatos de execucao/diagnostico e estao ignorados pelo projeto.

## Testes

Comando executado:

```powershell
npm.cmd test
```

Resultado:

- Total: 16 testes
- Aprovados: 16
- Falhas: 0
- Cancelados: 0
- Ignorados: 0
- Duracao reportada: 1742.2954 ms

## Estado atual

- Servidor Node.js ESM com entrada em `src/server.js`.
- Porta padrao local: `3000`, com suporte a `PORT` por variavel de ambiente.
- Painel administrativo em `/admin`.
- Site publico em `/`.
- Webhooks em `/webhook/whatsapp` e `/webhook/site`.
- Auditoria operacional em `data/audit-logs.json`.
- Fila Mesa em `data/mesa-queue.json`.
- Rascunhos de pedido em `data/order-drafts.json`.
- Leads de eventos em `data/event-leads.json`.
- Cardapio sincronizado em `data/menu-cache.json`.
- Integracao Mesa configuravel por variaveis `MESA_*`, com default local `http://127.0.0.1:4173`.
- Nenhuma autenticacao de admin implementada neste baseline.
- Nenhuma alteracao em `src` foi feita nesta etapa.

## Riscos conhecidos

- `/admin` ainda nao possui autenticacao.
- Persistencia operacional usa arquivos JSON locais; isso exige cuidado com backup, concorrencia, corrupcao e crescimento.
- Defaults de Mesa apontam para `127.0.0.1:4173`, adequado para desenvolvimento local, nao para producao remota.
- Webhooks ainda precisam de protecao/validacao de origem antes de exposicao publica.
- Nao ha servico Windows configurado para restart automatico.
- Logs de execucao precisam de politica de rotacao.
- Integracao Mesa precisa ser validada contra o Mesa real em ambiente-alvo antes de liberar pedidos reais.

## Proximos passos

1. Definir configuracao de producao: `PORT`, `MESA_BASE_URL`, paths Mesa e timeouts.
2. Implementar autenticacao do painel `/admin`.
3. Proteger webhooks com segredo, assinatura ou outro mecanismo acordado.
4. Criar execucao como servico Windows, preferencialmente com WinSW, NSSM ou PM2 configurado como servico.
5. Validar contrato real com Mesa: `/health`, `/api/menu` e `/api/orders/external`.
6. Definir estrategia de persistencia: manter JSON com backup/rotacao ou migrar para SQLite.
7. Criar checklist de deploy, rollback e monitoramento.
