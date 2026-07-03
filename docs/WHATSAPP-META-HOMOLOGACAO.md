# WhatsApp Meta - Homologacao

Este roteiro prepara um teste real da WhatsApp Cloud API sem remover o mock local. O padrao do projeto continua:

```env
WHATSAPP_PROVIDER=mock
```

## Variaveis necessarias

Configure somente no ambiente seguro de homologacao, nunca no codigo:

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_META_PHONE_NUMBER_ID=
WHATSAPP_META_ACCESS_TOKEN=
WHATSAPP_META_VERIFY_TOKEN=
WHATSAPP_META_API_VERSION=v21.0
SAMBAH_WEBHOOK_SECRET=
SAMBAH_WHATSAPP_NENO=5551980413745
SAMBAH_WHATSAPP_KAZUKO=5551997920292
```

`WHATSAPP_META_ACCESS_TOKEN` nao deve aparecer em logs, respostas HTTP, frontend, prints ou arquivos versionados.

## Webhook na Meta

No painel da Meta Cloud API, configure o callback do WhatsApp para a URL publica do SamBah:

```text
https://SEU-DOMINIO/webhook/whatsapp
```

Use em homologacao o dominio publico que aponta para a instancia do SamBah. Em ambiente local, exponha a porta com uma ferramenta segura de tunel apenas durante o teste.

## Verify token

O valor informado no campo Verify token da Meta deve ser exatamente o mesmo de:

```env
WHATSAPP_META_VERIFY_TOKEN=
```

A Meta chamara:

```text
GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
```

Se o token bater, o SamBah responde o `hub.challenge`. Se nao bater, responde `403`.

## Alternar para Meta

1. Confirme que os testes locais passam com mock.
2. Configure as variaveis Meta no ambiente de homologacao.
3. Altere somente o ambiente para:

```env
WHATSAPP_PROVIDER=meta
```

4. Reinicie a instancia de homologacao.
5. Confira:

```text
GET /admin/whatsapp/status
```

O endpoint deve mostrar apenas booleanos, como `accessTokenConfigured: true`, sem retornar o token.

## Voltar para mock

Para desativar envio real:

```env
WHATSAPP_PROVIDER=mock
```

Reinicie a instancia. O webhook continua funcionando, mas as respostas ficam registradas localmente sem chamar a API externa.

## Checklist de teste real

- `npm.cmd test` passando antes da homologacao.
- `GET /webhook/whatsapp` validado pela Meta com o verify token correto.
- `GET /admin/whatsapp/status` retorna `provider: "meta"` e `configured: true` sem token.
- Enviar uma mensagem de texto real para o numero de teste da Cloud API.
- Confirmar que `POST /webhook/whatsapp` normaliza telefone, nome, mensagem e `messageId`.
- Conferir resposta enviada pela Cloud API.
- Testar pedido: o SamBah cria draft e nao envia ao Mesa antes de `CONFIRMAR`.
- Responder `ALTERAR` e confirmar que nada vai ao Mesa.
- Responder `CONFIRMAR` em um draft valido apenas no ambiente planejado para teste operacional.
- Voltar para `WHATSAPP_PROVIDER=mock` ao encerrar a homologacao.
