# SamBah WhatsApp Meta Checklist

Checklist local para preparar a conexao futura com WhatsApp Cloud API, sem ativar envio real ainda.

1. Criar a conta/estrutura no Meta Business Suite.
2. Criar um app do tipo Business no Meta for Developers.
3. Adicionar o produto WhatsApp ao app.
4. Usar primeiro o numero de teste fornecido pela Meta.
5. Configurar o webhook apontando para:
   - GET `/api/sambah-meta-whatsapp/webhook`
   - POST `/api/sambah-meta-whatsapp/webhook`
6. Informar o verify token configurado em `SAMBAH_META_VERIFY_TOKEN`.
7. Copiar o Phone Number ID para `SAMBAH_META_PHONE_NUMBER_ID`.
8. Copiar o token temporario para `SAMBAH_META_ACCESS_TOKEN`.
9. Testar uma mensagem recebida pelo webhook local/publico.
10. So depois validar numero real, permissões e producao.

Variaveis esperadas:

```env
SAMBAH_META_VERIFY_TOKEN=sambah_local_verify
SAMBAH_META_ACCESS_TOKEN=
SAMBAH_META_PHONE_NUMBER_ID=
SAMBAH_META_APP_ID=
SAMBAH_META_WABA_ID=
SAMBAH_PUBLIC_WEBHOOK_URL=
```
