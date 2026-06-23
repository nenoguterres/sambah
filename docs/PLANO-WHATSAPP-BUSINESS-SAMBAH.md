# SamBah assumindo o WhatsApp Business

Objetivo: fazer o WhatsApp passar primeiro pelo SamBah, registrar o atendimento, classificar a conversa e só depois seguir para resposta humana quando precisar.

## Estado atual

- O site do Insano pode mandar cliente para o SamBah.
- O SamBah cria lead, atendimento, evento e pre-comanda.
- O SamBah gera `whatsappUrl` com o numero `5551980413745`.
- O endpoint `POST /webhook/whatsapp` ja existe para receber mensagens.
- O endpoint `POST /webhook/site` ja existe para entradas vindas do site.
- A Cozinha ja recebe pre-comandas criadas pelo SamBah.

## O que ainda falta

1. Contratar ou ativar um provedor de WhatsApp Business API.
2. Apontar o webhook do provedor para o SamBah.
3. Configurar tokens no Render.
4. Testar mensagem real entrando no CRM.
5. Ativar envio automatico somente depois do teste de entrada funcionar.

## URLs

Hoje no Render:

```text
https://sambah.onrender.com/webhook/whatsapp
```

Producao recomendada:

```text
https://api.insanofoodtruck.com.br/webhook/whatsapp
```

Alternativa:

```text
https://api.sambahcrm.com.br/webhook/whatsapp
```

## Variaveis no Render

```text
WHATSAPP_PROVIDER=meta
WHATSAPP_SEND_ENABLED=false
WHATSAPP_VERIFY_TOKEN=trocar-no-painel-meta
WHATSAPP_ACCESS_TOKEN=trocar-no-painel-meta
WHATSAPP_PHONE_NUMBER_ID=trocar-no-painel-meta
WHATSAPP_BUSINESS_ACCOUNT_ID=trocar-no-painel-meta
WHATSAPP_WEBHOOK_SECRET=trocar-no-painel-meta
WHATSAPP_API_BASE_URL=https://graph.facebook.com/v20.0
WHATSAPP_NUMBER=5551980413745
```

Comecar com `WHATSAPP_SEND_ENABLED=false`. Assim o SamBah recebe e registra sem disparar resposta automatica antes da validacao.

## Fluxo desejado

```text
Cliente envia WhatsApp
-> WhatsApp Business API
-> /webhook/whatsapp no SamBah
-> CRM / Oportunidades
-> Classificacao: pedido, evento, empresa, Xeriffe ou atendimento
-> Pre-comanda ou oportunidade
-> Resposta humana ou automatica aprovada
```

## Regra para o site Wix

Botao comum nao deve mandar direto para `wa.me` quando a intencao for atendimento pelo SamBah.

Use o SamBah primeiro:

```text
https://sambah.onrender.com/
```

ou a pagina criada no site:

```text
https://www.insanofoodtruck.com.br/blank-2
```

Depois o SamBah registra e abre WhatsApp quando for necessario.

## Checklist simples

- [ ] Confirmar se o numero `5551980413745` ja esta como WhatsApp Business.
- [ ] Escolher provedor: Meta Cloud API, 360dialog, Twilio, Z-API ou Evolution API.
- [ ] Criar app/projeto no provedor.
- [ ] Copiar `PHONE_NUMBER_ID`, `BUSINESS_ACCOUNT_ID` e token.
- [ ] Configurar webhook para `/webhook/whatsapp`.
- [ ] Colocar variaveis no Render.
- [ ] Testar mensagem real chegando em `/api/crm/resumo`.
- [ ] Testar oportunidade criada.
- [ ] Testar pedido indo para pre-comanda/cozinha.
- [ ] So depois ativar `WHATSAPP_SEND_ENABLED=true`.

## Decisao operacional

Para o SamBah assumir de verdade, o WhatsApp nao pode ser apenas um link. Ele precisa receber mensagens por webhook oficial. Enquanto o site usa so `wa.me`, o SamBah consegue registrar o clique, mas nao consegue ler a conversa depois que o cliente entra no aplicativo do WhatsApp.
