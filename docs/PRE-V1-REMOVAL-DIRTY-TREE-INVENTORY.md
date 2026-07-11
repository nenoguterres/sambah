# Pre V1 Removal Dirty Tree Inventory

Data: 2026-07-10
Repositorio: SamBah oficial
Branch inicial: main
Commit inicial: f5b8977 fix: harden production flow reset and health version
Remote: origin https://github.com/nenoguterres/sambah.git

## Objetivo

Inventariar, classificar e preservar as alteracoes ja existentes antes de qualquer remocao do WhatsApp V1.

Nesta etapa nao foi feita remocao de V1, incorporacao de V2, deploy, limpeza destrutiva, reset, restore, checkout de arquivos, clean ou stash.

## Comandos registrados

### git status --short

```text
 M public/conversas.css
 M public/conversas.html
 M public/conversas.js
 M public/login.css
 M public/login.html
 M public/login.js
 M src/auth/authService.js
 M src/server.js
 M src/whatsapp/whatsappMessageService.js
 M tests/audit.test.js
 M tests/sambah-pay.test.js
 M tests/sambah-personality.test.js
 M tests/whatsapp-conversation-inbox.test.js
 M tests/whatsapp-webhook-meta.test.js
?? INSTALADOR-SAMBAH-APP-WINDOWS.cmd
?? INSTALADOR-SAMBAH-WHATSAPP-PRODUCAO.cmd
?? abrir-sambah-app-producao.bat
?? abrir-sambah-whatsapp-producao.bat
?? public/sambah-ai-performance.html
?? public/sambah-ai.html
?? src/ai/
?? src/callCenterService.js
?? tests/ai-observability.test.js
?? tests/ai-performance.test.js
?? tests/call-center.test.js
?? tests/controlled-ai.test.js
?? tests/intent-engine.test.js
?? tests/operation-router.test.js
```

### git status

```text
On branch main
Your branch and 'origin/main' have diverged,
and have 3 and 34 different commits each, respectively.

Changes not staged for commit:
  modified: public/conversas.css
  modified: public/conversas.html
  modified: public/conversas.js
  modified: public/login.css
  modified: public/login.html
  modified: public/login.js
  modified: src/auth/authService.js
  modified: src/server.js
  modified: src/whatsapp/whatsappMessageService.js
  modified: tests/audit.test.js
  modified: tests/sambah-pay.test.js
  modified: tests/sambah-personality.test.js
  modified: tests/whatsapp-conversation-inbox.test.js
  modified: tests/whatsapp-webhook-meta.test.js

Untracked files:
  INSTALADOR-SAMBAH-APP-WINDOWS.cmd
  INSTALADOR-SAMBAH-WHATSAPP-PRODUCAO.cmd
  abrir-sambah-app-producao.bat
  abrir-sambah-whatsapp-producao.bat
  public/sambah-ai-performance.html
  public/sambah-ai.html
  src/ai/
  src/callCenterService.js
  tests/ai-observability.test.js
  tests/ai-performance.test.js
  tests/call-center.test.js
  tests/controlled-ai.test.js
  tests/intent-engine.test.js
  tests/operation-router.test.js

no changes added to commit
```

### git diff --stat

```text
 public/conversas.css                      |  67 ++++++-
 public/conversas.html                     |   2 +
 public/conversas.js                       | 129 ++++++++++++-
 public/login.css                          |   1 +
 public/login.html                         |   7 +-
 public/login.js                           |  11 ++
 src/auth/authService.js                   |  16 +-
 src/server.js                             | 297 +++++++++++++++++++++++++++++-
 src/whatsapp/whatsappMessageService.js    |  58 ++++++
 tests/audit.test.js                       | 180 +++++++++++++++++-
 tests/sambah-pay.test.js                  |  35 ++++
 tests/sambah-personality.test.js          |  47 ++++-
 tests/whatsapp-conversation-inbox.test.js |  95 ++++++++++
 tests/whatsapp-webhook-meta.test.js       |  49 ++++-
 14 files changed, 968 insertions(+), 26 deletions(-)
```

### git diff --name-status

```text
M public/conversas.css
M public/conversas.html
M public/conversas.js
M public/login.css
M public/login.html
M public/login.js
M src/auth/authService.js
M src/server.js
M src/whatsapp/whatsappMessageService.js
M tests/audit.test.js
M tests/sambah-pay.test.js
M tests/sambah-personality.test.js
M tests/whatsapp-conversation-inbox.test.js
M tests/whatsapp-webhook-meta.test.js
```

### git diff --cached --stat / --name-status

```text
No staged changes.
```

### git ls-files --others --exclude-standard

```text
INSTALADOR-SAMBAH-APP-WINDOWS.cmd
INSTALADOR-SAMBAH-WHATSAPP-PRODUCAO.cmd
abrir-sambah-app-producao.bat
abrir-sambah-whatsapp-producao.bat
public/sambah-ai-performance.html
public/sambah-ai.html
src/ai/aiAuditService.js
src/ai/aiConversionService.js
src/ai/aiGuardrailsService.js
src/ai/aiIntentClassifier.js
src/ai/aiMetricsService.js
src/ai/aiPerformanceService.js
src/ai/aiResponseDraftService.js
src/ai/controlledAiService.js
src/callCenterService.js
tests/ai-observability.test.js
tests/ai-performance.test.js
tests/call-center.test.js
tests/controlled-ai.test.js
tests/intent-engine.test.js
tests/operation-router.test.js
```

## Inventario por arquivo

| Caminho | Tipo | Area funcional | Origem provavel | WhatsApp | IA nova | Telas publicas | Testes | Instalador/artefato | Possivel segredo | Preservar | Temporario/descartavel | Grupo | Destino |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| public/conversas.css | modificado | Central de Conversas UI | admin/delete/status UI | sim | nao | sim | nao | nao | nao | sim | nao | A/B | preservar codigo valido; avaliar na remocao V1 |
| public/conversas.html | modificado | Central de Conversas UI | status WhatsApp UI | sim | nao | sim | nao | nao | nao | sim | nao | A/B | preservar codigo valido; avaliar na remocao V1 |
| public/conversas.js | modificado | Central de Conversas UI | admin delete, status, UX | sim | nao | sim | nao | nao | referencia a env/token apenas em texto/status | sim | nao | A/B | preservar codigo valido; avaliar na remocao V1 |
| public/login.css | modificado | Login UI | ajuste visual | nao | nao | sim | nao | nao | palavra password em UI | sim | nao | A | preservar |
| public/login.html | modificado | Login UI | UX/autenticacao | nao | nao | sim | nao | nao | palavra password em UI | sim | nao | A | preservar |
| public/login.js | modificado | Login UI | UX/autenticacao | nao | nao | sim | nao | nao | palavra password em UI | sim | nao | A | preservar |
| src/auth/authService.js | modificado | Autenticacao | login flexivel/senha minima | nao | nao | nao | nao | nao | nomes de campos sensiveis, sem chave real detectada | sim | nao | A | preservar |
| src/server.js | modificado | Servidor, rotas, webhook, AI, call center | integracao de observabilidade/call center/status | sim | sim | nao | nao | nao | nomes de env/header em codigo, sem chave real detectada | sim | nao | A/B | preservar; avaliar pontos WhatsApp na remocao V1 |
| src/whatsapp/whatsappMessageService.js | modificado | Infra WhatsApp | status Meta e historico | sim | nao | nao | nao | nao | nao | sim | nao | B | preservar como infraestrutura neutra ate avaliacao V1 |
| tests/audit.test.js | modificado | Testes | audit/WhatsApp/router | sim | nao | nao | sim | nao | valores de teste/env mock | sim | nao | A/B | preservar |
| tests/sambah-pay.test.js | modificado | Testes Pay | cobertura Pay/credenciais mock | sim | nao | nao | sim | nao | valores de teste/mock | sim | nao | A | preservar |
| tests/sambah-personality.test.js | modificado | Testes V1/personality | cobertura de personality | sim | nao | nao | sim | nao | nao | sim | nao | B | preservar para futura avaliacao/remocao |
| tests/whatsapp-conversation-inbox.test.js | modificado | Testes Central Conversas | admin delete/inbox | sim | nao | nao | sim | nao | valores de teste/env mock | sim | nao | A/B | preservar |
| tests/whatsapp-webhook-meta.test.js | modificado | Testes webhook Meta | status callback, envio mock | sim | nao | nao | sim | nao | valores de teste/env mock | sim | nao | B | preservar para futura avaliacao/remocao |
| public/sambah-ai-performance.html | novo | UI IA observability | tela nova | nao | sim | sim | nao | nao | nao | sim | nao | A | preservar |
| public/sambah-ai.html | novo | UI IA observability | tela nova | nao | sim | sim | nao | nao | nao | sim | nao | A | preservar |
| src/ai/aiAuditService.js | novo | IA nova observability | servico novo | nao | sim | nao | nao | nao | nao | sim | nao | A | preservar |
| src/ai/aiConversionService.js | novo | IA nova conversion | servico novo | nao | sim | nao | nao | nao | nao | sim | nao | A | preservar |
| src/ai/aiGuardrailsService.js | novo | IA nova guardrails | servico novo | nao | sim | nao | nao | nao | nao | sim | nao | A | preservar |
| src/ai/aiIntentClassifier.js | novo | IA nova | servico novo, depende de intentEngine existente | sim indireto | sim | nao | nao | nao | nao | sim | nao | A/B | preservar; avaliar dependencias antigas na remocao V1 |
| src/ai/aiMetricsService.js | novo | IA nova metrics | servico novo | nao | sim | nao | nao | nao | nao | sim | nao | A | preservar |
| src/ai/aiPerformanceService.js | novo | IA nova performance | servico novo | nao | sim | nao | nao | nao | nao | sim | nao | A | preservar |
| src/ai/aiResponseDraftService.js | novo | IA nova drafts | servico novo, usa sambahPersonality | sim indireto | sim | nao | nao | nao | nao | sim | nao | A/B | preservar; avaliar dependencia antiga na remocao V1 |
| src/ai/controlledAiService.js | novo | IA nova controlada | servico novo, usa operationRouter | sim indireto | sim | nao | nao | nao | nao | sim | nao | A/B | preservar; avaliar dependencia antiga na remocao V1 |
| src/callCenterService.js | novo | Call center | servico novo | sim | nao | nao | nao | nao | nao | sim | nao | A/B | preservar; avaliar na remocao V1 |
| tests/ai-observability.test.js | novo | Testes IA | cobertura nova | nao | sim | nao | sim | nao | nao | sim | nao | A | preservar |
| tests/ai-performance.test.js | novo | Testes IA | cobertura nova | nao | sim | nao | sim | nao | nao | sim | nao | A | preservar |
| tests/call-center.test.js | novo | Testes call center | cobertura nova | sim | nao | nao | sim | nao | nao | sim | nao | A/B | preservar |
| tests/controlled-ai.test.js | novo | Testes IA | cobertura nova | nao | sim | nao | sim | nao | nao | sim | nao | A | preservar |
| tests/intent-engine.test.js | novo | Testes V1/intent | cobertura de engine antiga | sim | nao | nao | sim | nao | nao | sim | nao | B | preservar para futura avaliacao/remocao |
| tests/operation-router.test.js | novo | Testes router operacional | cobertura de router antigo/operacional | sim | nao | nao | sim | nao | nao | sim | nao | B | preservar para futura avaliacao/remocao |
| INSTALADOR-SAMBAH-APP-WINDOWS.cmd | novo | Instalador | artefato/atalho operacional | nao | nao | nao | nao | sim | nao detectado | nao automatico | possivelmente gerado | C | nao commitar automaticamente |
| INSTALADOR-SAMBAH-WHATSAPP-PRODUCAO.cmd | novo | Instalador WhatsApp producao | artefato/atalho operacional | sim | nao | nao | nao | sim | nao detectado | nao automatico | possivelmente gerado | C | nao commitar automaticamente |
| abrir-sambah-app-producao.bat | novo | Atalho launcher | artefato operacional | nao | nao | nao | nao | sim | nao detectado | nao automatico | possivelmente gerado | C | nao commitar automaticamente |
| abrir-sambah-whatsapp-producao.bat | novo | Atalho launcher WhatsApp | artefato operacional | sim | nao | nao | nao | sim | nao detectado | nao automatico | possivelmente gerado | C | nao commitar automaticamente |

## Grupos

### A - Codigo valido que deve ser preservado

- public/login.css
- public/login.html
- public/login.js
- src/auth/authService.js
- public/sambah-ai-performance.html
- public/sambah-ai.html
- src/ai/aiAuditService.js
- src/ai/aiConversionService.js
- src/ai/aiGuardrailsService.js
- src/ai/aiMetricsService.js
- src/ai/aiPerformanceService.js
- tests/ai-observability.test.js
- tests/ai-performance.test.js
- tests/controlled-ai.test.js
- tests/sambah-pay.test.js

### B - Alteracoes relacionadas ao WhatsApp/V1 ou dependencias antigas a avaliar depois

- public/conversas.css
- public/conversas.html
- public/conversas.js
- src/server.js
- src/whatsapp/whatsappMessageService.js
- src/ai/aiIntentClassifier.js
- src/ai/aiResponseDraftService.js
- src/ai/controlledAiService.js
- src/callCenterService.js
- tests/audit.test.js
- tests/sambah-personality.test.js
- tests/whatsapp-conversation-inbox.test.js
- tests/whatsapp-webhook-meta.test.js
- tests/call-center.test.js
- tests/intent-engine.test.js
- tests/operation-router.test.js

### C - Artefatos gerados ou atalhos operacionais nao commitados automaticamente

| Arquivo | Tamanho |
|---|---:|
| INSTALADOR-SAMBAH-WHATSAPP-PRODUCAO.cmd | 917 bytes |
| INSTALADOR-SAMBAH-APP-WINDOWS.cmd | 854 bytes |
| abrir-sambah-app-producao.bat | 497 bytes |
| abrir-sambah-whatsapp-producao.bat | 179 bytes |

Recomendacao: manter fora do commit de preservacao ate decisao humana. Se forem artefatos recorrentes, avaliar regra futura de `.gitignore`; nenhuma regra foi adicionada nesta tarefa.

### D - Arquivos sensiveis ou duvidosos

Nenhum arquivo foi classificado como segredo real ou credencial real. Ocorrencias sensiveis detectadas foram classificadas como nomes de variaveis, headers, campos de UI ou valores mock/teste.

## Inspecao de seguranca

Busca por termos: TOKEN, SECRET, PASSWORD, AUTHORIZATION, BEARER, META_ACCESS_TOKEN, WHATSAPP_TOKEN, APP_SECRET, PRIVATE_KEY, BEGIN RSA, BEGIN PRIVATE, .env, credentials.

Ocorrencias encontradas sem exposicao de valores:

| Arquivo | Tipo | Acao recomendada |
|---|---|---|
| public/conversas.js | referencia env/token em texto/status | pode preservar; revisar na remocao V1 |
| public/login.css | campo/rotulo password | pode preservar |
| public/login.html | campo/rotulo password | pode preservar |
| public/login.js | campo/rotulo password | pode preservar |
| src/auth/authService.js | campos auth/secret/hash/token internos | pode preservar; sem segredo real detectado |
| src/server.js | nomes de env/header Authorization/Bearer/token | pode preservar; sem segredo real detectado |
| tests/audit.test.js | env e token mock | pode preservar |
| tests/sambah-pay.test.js | mock/credentials de teste | pode preservar |
| tests/whatsapp-conversation-inbox.test.js | env/token mock | pode preservar |
| tests/whatsapp-webhook-meta.test.js | env/token/header mock | pode preservar |

Nao foram detectados PRIVATE_KEY, BEGIN RSA, BEGIN PRIVATE ou padrao de token real longo em atribuicao direta.

## Artefatos e arquivos grandes

Nao foram encontrados `.exe`, `.zip`, `.msi`, bancos locais, caches, logs, `node_modules` ou arquivos acima de 1 MB entre modificados/novos.

Os quatro `.cmd/.bat` foram classificados como grupo C por serem instaladores/atalhos operacionais, ainda que pequenos.

## Conclusao operacional

O codigo valido dos grupos A e B deve ser preservado em branch propria antes da remocao da V1. Os itens do grupo C devem permanecer no disco, nao commitados automaticamente, aguardando decisao humana. Nenhum item do grupo D bloqueia o commit de preservacao.
