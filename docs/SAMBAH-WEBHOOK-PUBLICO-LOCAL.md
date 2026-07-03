# SamBah Webhook Publico Local

Use um tunel HTTPS temporario para expor o servidor local do SamBah para a Meta.

Servidor local esperado:

```text
http://127.0.0.1:3000
```

Webhook Meta local:

```text
GET/POST /api/sambah-meta-whatsapp/webhook
```

Verify token:

```text
sambah_local_verify
```

## Opcao ngrok

```bash
ngrok http 3000
```

Use a URL HTTPS gerada na Meta:

```text
https://URL_GERADA/api/sambah-meta-whatsapp/webhook
```

## Opcao Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:3000
```

Use a URL HTTPS gerada na Meta:

```text
https://URL_GERADA/api/sambah-meta-whatsapp/webhook
```

## Validacao local

```bash
curl http://127.0.0.1:3000/health
curl "http://127.0.0.1:3000/api/sambah-meta-whatsapp/webhook?hub.mode=subscribe&hub.verify_token=sambah_local_verify&hub.challenge=ok123"
```

O segundo comando deve retornar:

```text
ok123
```
