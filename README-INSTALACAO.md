# samBah! Automação Whats - Instalação Local Windows

Versão validada: 1.0.0

## Requisitos

- Windows 10 ou 11.
- Node.js instalado.
- npm instalado junto com o Node.js.

Versão validada nesta máquina:

- Node v24.16.0
- npm 11.13.0

## Primeiro uso

Abra o terminal na pasta do projeto:

```bat
cd /d C:\Users\PC\Documents\Codex\2026-06-03\o-cod-vamos-pro-sambah
```

Instale as dependências:

```bat
npm install
```

No PowerShell, se aparecer bloqueio de política de execução para `npm.ps1`, use:

```powershell
npm.cmd install
```

## Iniciar o samBah!

Use o inicializador:

```bat
iniciar-sambah.bat
```

Ele instala dependencias quando necessario, inicia o servidor local e abre o painel:

```text
http://127.0.0.1:3000/admin
```

## Comandos manuais

Rodar testes:

```bat
npm test
```

No PowerShell:

```powershell
npm.cmd test
```

Subir servidor:

```bat
npm start
```

No PowerShell:

```powershell
npm.cmd start
```

## Endpoints

Painel:

```text
http://127.0.0.1:3000/admin
```

Estatísticas:

```text
http://127.0.0.1:3000/admin/audit/stats
```

Logs:

```text
http://127.0.0.1:3000/admin/audit/logs?limit=100
```

Webhook WhatsApp:

```text
POST http://127.0.0.1:3000/webhook/whatsapp
```

## Identidade Visual

A marca pública oficial é `samBah!`.

O painel `/admin` foi organizado como uma central de comando modular: o Mesa do Xeriffe permanece como sistema principal, e o samBah! aparece como módulo auxiliar para receber WhatsApp, auditar, manter fila segura e preparar o encaminhamento ao Mesa.

A tela principal mostra:

- status do WhatsApp/webhook
- fila segura de pedidos
- conexão com o Mesa do Xeriffe
- auditoria operacional
- mapa do fluxo WhatsApp -> samBah! -> Fila segura -> Mesa do Xeriffe -> Caixa/Produção
- próximas etapas operacionais

Assets oficiais que o app pode chamar:

```text
public/assets/brand/logo-sambah-oficial.png
public/assets/favicon.png
public/assets/favicon.svg
```

O CapBah oficial fica pendente até o arquivo aprovado ser fornecido. Não usar variações em `public/assets/rejeitados/`.

Arquivos com fundo magenta/chroma que não devem ser aplicados no app ficam isolados em:

```text
public/assets/rejeitados/
```

Regra completa:

```text
docs/ASSETS-OFICIAIS.md
```

## Validação Final Registrada

- Node v24.16.0 OK.
- npm 11.13.0 OK.
- `npm install` OK.
- `npm test` OK, 5/5.
- Servidor local OK em `127.0.0.1:3000`.
- Admin OK.
- Endpoints de auditoria OK.
- Webhook OK.
- Deduplicação de `processing_error` OK.
- Painel visual conferido no Chrome real.
- `data/audit-logs.json` limpo em UTF-8 sem BOM.
- Arquivos temporários removidos.
- Porta `3000` encerrada após validação.

## Limpeza dos Logs de Auditoria

Para deixar a auditoria limpa, o arquivo deve conter apenas:

```json
[]
```

Arquivo:

```text
data/audit-logs.json
```
