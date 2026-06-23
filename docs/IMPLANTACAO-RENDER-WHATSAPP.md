# Implantacao Render - WhatsApp Business

Projeto: SamBah CRM / Portal Insano

Objetivo: deixar o Render preparado para receber mensagens do WhatsApp Business API sem ativar envio automatico ainda.

## Variaveis no Render

Cadastrar em `Environment` no servico do Render:

```text
WHATSAPP_PROVIDER=meta
WHATSAPP_SEND_ENABLED=false
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_SECRET=
WHATSAPP_API_BASE_URL=https://graph.facebook.com/v20.0
WHATSAPP_NUMBER=5551980413745
```

## O que fica vazio por enquanto

Manter vazias ate termos a API oficial configurada:

```text
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_SECRET=
```

Nao colocar token real neste arquivo.

## Modo seguro

Manter:

```text
WHATSAPP_SEND_ENABLED=false
```

Assim o SamBah pode ser preparado e testado sem disparar mensagens automaticas para clientes.

Nao mudar para `true` antes de validar entrada de mensagem, CRM, Oportunidades e fluxo operacional.

## Webhook atual para painel da Meta

Usar no painel da Meta enquanto o SamBah estiver no Render:

```text
https://sambah.onrender.com/webhook/whatsapp
```

## Webhook ideal em producao

Quando o dominio/API final estiver apontado:

```text
https://api.insanofoodtruck.com.br/webhook/whatsapp
```

## Teste de saude

Abrir no navegador:

```text
https://sambah.onrender.com/health
```

Resposta esperada:

```json
{ "ok": true, "service": "sambha-automacao-whats" }
```

## Teste do webhook

Teste tecnico com `POST`:

```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://sambah.onrender.com/webhook/whatsapp" `
  -ContentType "application/json" `
  -Body '{"eventId":"teste-whatsapp-render","from":"5551980413745","message":"Teste WhatsApp SamBah","source":"whatsapp"}'
```

Resultado esperado:

```text
O SamBah responde JSON e registra o atendimento sem derrubar o servidor.
```

## Regras

- Nao colocar token real em arquivo do projeto.
- Nao ativar envio automatico agora.
- Nao alterar Mesa.
- Nao criar ZIP nesta etapa.
- O WhatsApp so sera assumido de verdade quando o provedor oficial enviar mensagens para o webhook do SamBah.
