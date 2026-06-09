# Changelog

## 1.0.0 - 2026-06-03

- Redesenhado o painel `/admin` como central de comando modular para WhatsApp, fila segura, Mesa do Xeriffe e auditoria operacional.
- Adicionados cards principais de status, mapa de fluxo visual, painel técnico da integração Mesa e bloco de próximas etapas.
- Mantida a trava visual: somente logo oficial e favicons oficiais são chamados; nenhum asset em `public/assets/rejeitados/` é usado.
- Travados assets oficiais em `logo-sambah-oficial.png` e `capbah-oficial.png`; variacoes sem aprovacao ficam em `public/assets/rejeitados/`.
- Reorganizados assets oficiais em `public/assets/brand/` e isolados arquivos magenta/chroma em `public/assets/rejeitados/`.
- Aplicada identidade visual oficial com logo `samBah!`, mascote CapBah e favicon de cuia.
- Padronizada a nomenclatura visual/oficial para `samBah!`.
- Registrada validacao local final no Windows.
- Confirmado Node v24.16.0 e npm 11.13.0.
- Confirmado `npm install` sem vulnerabilidades.
- Confirmado `npm test` com 5 testes aprovados.
- Confirmado servidor local em `127.0.0.1:3000`.
- Confirmado painel admin no Chrome real.
- Confirmados endpoints `/admin/audit/stats` e `/admin/audit/logs?limit=100`.
- Confirmado webhook manual e deduplicacao de `processing_error`.
- Confirmado `data/audit-logs.json` limpo em UTF-8 sem BOM.
- Adicionado guia `README-INSTALACAO.md` e inicializador `iniciar-sambah.bat`.
- Documentada observacao de PowerShell: usar `npm.cmd` quando `npm.ps1` for bloqueado.

## 0.1.0 - 2026-06-03

- Criada camada de auditoria operacional em arquivo JSON.
- Criados endpoints `/admin/audit/stats` e `/admin/audit/logs`.
- Criado painel admin com area visual de auditoria.
- Aplicada identidade visual sobria com base grafite, azul, ciano e ambar discreto.
- Adicionados testes para mascara de dados, estatisticas, paginacao, endpoints HTTP e deduplicacao de `processing_error`.
