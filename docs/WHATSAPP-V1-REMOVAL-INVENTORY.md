# WhatsApp V1 Removal Inventory

Data: 2026-07-10

## Escopo

Remocao controlada do motor automatico WhatsApp V1 no SamBah oficial. O WhatsApp V2 lab permanece fora desta arvore e nao foi incorporado.

## Arquivos V1 removidos

- `src/sambahPersonality.js`: respostas automaticas e personalidade acoplada ao WhatsApp V1.
- `src/intentEngine.js`: classificador antigo de intencao operacional.
- `src/operationRouter.js`: roteador operacional automatico do V1.
- `src/flowManager.js`: orquestrador de fluxo automatico do WhatsApp V1.
- `src/eventFlow.js`: fluxo guiado acoplado ao V1.

## Caminhos preservados

- `src/whatsapp/whatsappWebhookParser.js`: parser Meta compartilhado.
- `src/whatsappConversationService.js`: Central de Conversas preservada como registro neutro/manual.
- `src/whatsapp/whatsappMessageService.js`: historico, status e sessoes preservados sem envio automatico.
- `src/crmService.js`, `src/mesaIntegrationService.js`, `src/mesaConnectorService.js`: componentes compartilhados preservados.
- `/webhook/site`: fluxo de site preservado fora do motor automatico Meta WhatsApp.

## Substituicao operacional

O webhook Meta continua disponivel em `/webhook/whatsapp`, mas mensagens recebidas passam por `src/whatsapp/whatsappMaintenanceHandler.js`.

Resultado esperado:

- `engine: "disabled"`
- `reason: "whatsapp_engine_disabled"`
- `automaticReplyCreated: false`
- `sent: false`
- sem chamada Graph API
- sem chamada provider
- sem Intent Engine
- sem Operation Router
- sem resposta sugerida automatica

## Dados legados

Foi adicionado `scripts/audit-whatsapp-v1-data.js` para auditoria read-only de campos legados. O script exige `--dry-run` e nao escreve arquivos.

Comando seguro:

```bash
node scripts/audit-whatsapp-v1-data.js --dry-run
```
