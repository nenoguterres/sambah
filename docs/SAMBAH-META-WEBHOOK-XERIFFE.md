# SamBah Meta Webhook - Xeriffe

## Objetivo

Preparar o SamBah para receber webhooks HTTPS da Meta WhatsApp Cloud API usando o dominio publico `api.xeriffeobirici.com.br`.

## Porta local

O servidor principal esta em `src/server.js` e usa `getRuntimeConfig().port`.

Padrao local:

```env
PORT=3000
```

Sem `PORT` definido, o SamBah sobe em `http://127.0.0.1:3000`.

## Variaveis locais

Arquivo local: `.env.local`

```env
WHATSAPP_PROVIDER=meta
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=3410074799062817
META_WABA_ID=157729062223618
META_VERIFY_TOKEN=sambah_verify_2026
```

`META_ACCESS_TOKEN` deve ser preenchido somente no ambiente seguro do servidor. Nao gravar token real no codigo, documentacao, commits ou prints.

## Endpoints

### Health

```http
GET /health
```

Resposta esperada:

```json
{ "ok": true, "service": "sambah", "provider": "meta" }
```

### Verificacao da Meta

```http
GET /webhooks/meta?hub.mode=subscribe&hub.verify_token=sambah_verify_2026&hub.challenge=CHALLENGE
```

Quando `hub.verify_token` for igual a `META_VERIFY_TOKEN`, o servidor responde `hub.challenge` como texto puro.

Se o token estiver incorreto, responde `403`.

### Recebimento de eventos

```http
POST /webhooks/meta
```

O endpoint recebe eventos da Meta, registra auditoria com mascaramento de dados sensiveis e responde `200` rapidamente. O handler tolera mensagens, statuses, payload vazio e eventos sem mensagens.

## Publicacao

Proximos passos de DNS e servidor:

1. Criar o subdominio `api.xeriffeobirici.com.br`.
2. Apontar o DNS para o servidor publico onde o SamBah vai rodar.
3. Publicar o SamBah com HTTPS obrigatorio.
4. Configurar as variaveis de ambiente no servidor, incluindo `META_ACCESS_TOKEN` real.
5. Configurar o webhook no painel da Meta:

```text
Callback URL: https://api.xeriffeobirici.com.br/webhooks/meta
Verify Token: sambah_verify_2026
```

## Comandos locais de validacao

```powershell
npm test
node src/server.js
Invoke-RestMethod http://127.0.0.1:3000/health
```
