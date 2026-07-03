# SamBah Meta Token Permanente

Use token permanente do Business Manager para envio real pela WhatsApp Cloud API.

Valores mantidos:

```env
SAMBAH_META_PHONE_NUMBER_ID=3410074799062817
SAMBAH_META_WABA_ID=157729062223618
SAMBAH_META_ACCESS_TOKEN=
```

O token temporario do painel Meta for Developers pode ficar vinculado ao numero/conta de teste e gerar conflito. Para producao ou homologacao real, gere um token permanente com usuario do sistema.

## Caminho na Meta

1. Acesse o Business Manager.
2. Abra **Configuracoes do negocio**.
3. Va em **Usuarios**.
4. Abra **Usuarios do sistema**.
5. Clique em **Criar usuario**.
6. Atribua os ativos ao usuario.
7. Selecione a **Conta do WhatsApp** correta.
8. Gere um novo token.
9. Marque as permissoes:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
10. Copie o token gerado e use localmente em `SAMBAH_META_ACCESS_TOKEN`.

Nao coloque o token em prints, docs, codigo ou chat. Use `.env.local` local ou variavel de ambiente da maquina/servidor.
