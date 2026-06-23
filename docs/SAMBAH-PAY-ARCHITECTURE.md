# SAMBAH-PAY-ARCHITECTURE

## FASE 2

A FASE 2 cria a arquitetura inicial implementavel do SamBah Pay sem alterar os fluxos atuais de pedido, CRM, WhatsApp ou Mesa do Xeriffe.

O modulo entra isolado em `src/sambahPay/` e expoe apenas rotas sob `/api/sambah-pay/*`.

## Blocos implementados

- SamBah Pay Core: pagamentos manuais/simulados, status, listagem e auditoria.
- SamBah Pay AutoServe: sessoes, carrinho, checkout, release token e entrega simulada.
- SamBah Device Controller: dispositivos, produtos por dispositivo, heartbeat, comandos simulados, sensores e alertas.
- SamBah Wallet: wallet simples, credito, debito e extrato.
- SamBah Event: evento cashless simples, participantes, consumos, relatorio e fechamento.
- SamBah BI: dashboard operacional simulado.
- SamBah Audit: auditoria isolada em JSON e espelhamento no `AuditService` existente.

## Estrutura

```text
src/sambahPay/
  adapters/
  controllers/
  models/
  services/
  storage/
  index.js
  routes.js
```

## Persistencia

O projeto atual usa arquivos JSON em `data/`. O SamBah Pay segue o mesmo padrao com arquivos prefixados por `sambah-pay-`.

Exemplos:

- `data/sambah-pay-payments.json`
- `data/sambah-pay-devices.json`
- `data/sambah-pay-release-tokens.json`
- `data/sambah-pay-release-attempts.json`
- `data/sambah-pay-delivery-events.json`
- `data/sambah-pay-machine-alerts.json`

## Integracao com servidor

O `src/server.js` importa `createSambahPayModule`, cria uma instancia com `dataDir` e `auditService`, e delega rotas iniciadas por `/api/sambah-pay` para o router do modulo.

Nenhuma rota existente foi removida ou substituida.

## Adapters simulados

- `SimulatedPaymentAdapter`
- `SimulatedErpAdapter`
- `SimulatedDeviceAdapter`
- `SimulatedSensorAdapter`

Nao ha Pix automatico, TEF, ERP real, MQTT real, rele real, ESP32, Arduino, Raspberry Pi, CLP, balanca real ou sensor de fluxo real nesta fase.

## Mesa do Xeriffe

A integracao atual com Mesa do Xeriffe permanece nos arquivos existentes:

- `src/mesaIntegrationService.js`
- rotas `/admin/mesa/*`
- rotas `/mesa/...`
- rotas `/api/mesa/site/orders`

A FASE 2 nao altera o fluxo de pedido para Mesa.

## SamBah Voice Pay

A etapa Voice Pay adiciona atendimento por voz em modo simulado ao SamBah Pay.

Novos componentes:

- `MockWhatsappAdapter`.
- `MockSttAdapter`.
- `MockTtsAdapter`.
- `MockAiIntentAdapter`.
- `MockHumanHandoffAdapter`.
- `SambahVoicePayService`.
- `SambahVoicePayController`.

Novos namespaces:

- `/api/sambah-voice/*` para gateway, transcricao, intent, resposta e handoff.
- `/api/sambah-pay/voice/*` para checkout, wallet topup, autoserve release e consulta de sessao.

O webhook real atual do WhatsApp permanece separado. A integracao desta etapa nao implementa WhatsApp real, STT real, TTS real ou IA externa real.
