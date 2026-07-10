# WhatsApp V1 Removed

Data: 2026-07-10

O motor automatico WhatsApp V1 foi removido da arvore oficial do SamBah. A integracao Meta permanece tecnicamente acessivel apenas para receber webhooks, validar challenge e registrar callbacks de status.

## Estado atual

- Recebimento Meta: ativo.
- Envio automatico: desativado.
- Resposta automatica: desativada.
- Intent Engine V1: removido.
- Router Operacional V1: removido.
- Personality V1: removida.
- Flow Manager V1: removido.
- Incorporacao WhatsApp V2: nao realizada.

## Handler de manutencao

Mensagens em `/webhook/whatsapp` sao registradas pelo handler neutro `whatsappMaintenanceHandler`.

O handler retorna `reason: "whatsapp_engine_disabled"` e grava auditoria `whatsapp_engine_disabled`, sem criar resposta automatica e sem chamar provider/Graph API.

## Validacao

A suite `tests/whatsapp-webhook-meta.test.js` valida:

- challenge GET da Meta;
- POST Meta registrando entrada sem envio;
- callback de status Meta ainda atualizando mensagens;
- `/webhook/site` preservado;
- `/health` preservado.

A suite `tests/whatsapp-v1-removed.test.js` valida ausencia estrutural dos arquivos e referencias do V1 no runtime.

## Regra de continuidade

Qualquer incorporacao futura do WhatsApp V2 deve acontecer somente depois dos testes independentes no lab externo e em commit/proposta separados.
