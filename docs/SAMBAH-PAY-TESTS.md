# SAMBAH-PAY-TESTS

## Cobertura inicial

Os testes da FASE 2 verificam:

- Existencia do modulo.
- Rota de health.
- Criacao de device.
- Vinculo de produto ao device.
- Heartbeat simulado.
- Sessao AutoServe.
- Carrinho AutoServe.
- Checkout simulado.
- Criacao de release token.
- Start e complete de liberacao simulada.
- Uso unico do release token.
- Registro de release_attempt.
- Registro de delivery_event.
- Falha simulada gerando machine_alert.
- BI dashboard respondendo.

## Comando

```bash
npm test
```

## Observacao

Os testes usam diretorio temporario e nao dependem dos dados reais em `data/`.

## Cobertura Voice Pay

Os testes adicionais verificam:

- Webhook mockado de audio WhatsApp.
- Registro de `voice_message`.
- Transcricao simulada.
- Intent simulada.
- Resposta em texto/audio simulada.
- Checkout por voz exigindo confirmacao.
- Wallet topup por voz.
- AutoServe por voz sem liberacao direta por audio.
- Handoff humano simulado.

## Cobertura painel Voice Pay

- Carregamento de `/sambah-voice-pay`.
- Carregamento de `/voice-pay.js` e `/voice-pay.css`.
- Webhook WhatsApp mockado pelo painel.
- Dashboard/listagens de transcricoes, intents e auditoria.
- Transcricao mock direta.
- Intent mock direta.
- Resposta mock direta.
- Checkout, wallet, AutoServe e handoff continuam cobertos pelos testes anteriores.

## Cobertura SamBah Weight Control

Testes adicionados para leitura de peso, painel /sambah-weight, link na Central, validacoes weight_ok, weight_under, weight_over, weight_missing, weight_unstable, weight_fraud_suspected, divergencia critica com machine_alert e audit_log, release token com delivery event, simulacoes por tipo de uso, eventos/calibracao, integracao com Locker, estoque por peso e evento futuro i9ACAO Security.

Na fase oficial v1.0 simulada, tambem foram cobertos product_unavailable no estoque por peso, eventos under_delivery/over_delivery e indicadores weight_alerts/weight_fraud_suspected na Central.

## Cobertura Permissoes Voice Pay

Testes adicionados para link no admin, abertura direta do painel, permissao de ADMIN/CAIXA/AUDITOR, bloqueios para OPERADOR/ATENDENTE, perfil padrao ATENDENTE e auditoria de negativa.

## Cobertura Fase Ecossistema

Testes adicionados para abertura das rotas /login, /sambah-central, /sambah-pay, /sambah-autoserve, /sambah-devices, /sambah-voice-pay, /sambah-locker e /sambah-weight; bootstrap demo; device demo; AutoServe por voz com e sem device_id; permissao; auditoria de negativa; status da central; cards Locker Frio e Weight Control; e contrato futuro i9ACAO.

## Cobertura Locker Frio

Testes adicionados para painel /sambah-locker, bootstrap com zonas, sessao com dois itens, PIN correto/errado/expirado, abertura somente de zonas autorizadas, retirada completa/parcial, peso zero, excesso, alertas, auditoria e evento futuro i9ACAO.

## Cobertura Consolidacao Ecossistema v0.2

- Nenhuma rota principal do ecossistema deve retornar 404.
- A Central deve conter link visivel para /sambah-locker.
- /api/sambah-pay/locker/bootstrap deve criar zonas simuladas.
- Fluxo Locker com dois itens deve seguir funcionando.
- Eventos criticos devem gerar audit_log.
- Eventos criticos devem preparar evento futuro i9ACAO.

## Cobertura Painel Operacional Consolidado

- A Central deve conter Missao operacional, Fluxo demo guiado, Alertas criticos e Auditoria recente.
- O JavaScript da Central deve conter o fluxo demo Pedido -> Pagamento -> Locker -> Peso -> Auditoria.
- O status do ecossistema deve expor cards para Weight Control e Locker Frio.
- Alertas e auditoria recentes devem continuar disponiveis para o painel.

## Cobertura Event Bus + Cockpit Operacional

- Rotas visuais `/sambah-events` e `/sambah-observability` nao retornam 404.
- Central contem links e cards para Event Bus e Cockpit.
- Publicacao de evento cria event store, outbox, trace e auditoria.
- Processamento da outbox marca eventos como processados.
- Consumidores simulados mantem idempotencia por evento.
- Pagamento confirmado gera sincronizacao ERP futura.
- Falha ERP simulada gera `erp.sync.failed`, retry, dead letter e alerta operacional.
- Observability expoe health, metricas, traces, alertas e resolucao de alerta.
- Locker, heartbeat de device e machine_alert publicam eventos no barramento.

## Cobertura Security Bridge / i9ACAO Simulado

- `/sambah-security` abre e carrega asset dedicado.
- Central contem link e card para Seguranca / i9ACAO.
- Simulacoes criam incidentes com `correlationId` e `causationId`.
- Eventos criticos do Event Bus viram incidentes.
- Zona nao autorizada no Locker gera incidente high.
- Device offline critico e machine alert alta geram incidentes.
- Acoes acknowledge, resolve, dismiss, escalate e mocks geram auditoria e eventos.
- Cockpit expoe metricas de seguranca.
- Contrato futuro i9ACAO retorna estrutura valida.

## Cobertura LGPD e Logs Criticos

- `/sambah-lgpd` abre e carrega asset dedicado.
- Central contem link e card LGPD.
- Dashboard LGPD agrega logs criticos, politicas e solicitacoes.
- Exportacao de auditoria retorna dados mascarados.
- Solicitacao LGPD pode ser criada e atualizada.
- Permissoes bloqueiam perfil sem acesso.
- Politica de retencao customizada pode ser criada.

## Cobertura Database Layer / PostgreSQL Prepared

- `/sambah-database` abre e carrega asset dedicado.
- `/sambah-messaging` abre e carrega asset dedicado.
- `/api/sambah-messaging/config` preserva `MESSAGE_BROKER=internal`.
- Redis Streams, RabbitMQ e Kafka aparecem como preparados/futuros sem conexao real.
- `publish-test` gera evento no Event Bus e preserva `correlationId` e `causationId`.
- Falha simulada de broker gera `operational_alert` e `audit_log`.
- Replay por `correlationId` responde estrutura valida.
- Central contem link e card Banco / PostgreSQL.
- Health retorna `json` por padrao.
- Config mascara senha em `DATABASE_URL`.
- RepositoryFactory entrega JSON adapter por padrao.
- Postgres adapter existe sem ser obrigatorio.
- Dry-run lista migrations SQL sem executar banco real.
- SQL contem indices essenciais.
- Seed demo responde em modo simulado.
