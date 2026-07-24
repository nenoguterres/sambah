# SamBah Android — atendimento simples

Escopo desta primeira versão:

1. O SamBah cria o alerta de atendimento humano.
2. O aplicativo Android consulta os alertas a cada 10 segundos por um serviço nativo.
3. O celular toca e mostra a mensagem recebida.
4. O atendente abre a conversa e responde.
5. A resposta volta para o endpoint real do SamBah.
6. O SamBah envia ao cliente pelo provider já configurado.
7. O atendente pode concluir a conversa.

Não usa Chrome, WebView, Web Push ou Firebase.

## Servidor

O endereço é fixo nesta versão:

`https://api.insanofoodtruck.com.br`

O aplicativo usa somente endpoints já existentes:

- `POST /api/auth/login`
- `GET /api/call-center/alerts`
- `POST /api/call-center/alerts/:id/read`
- `GET /api/conversas/:id`
- `POST /api/conversas/:id/responder`
- `POST /api/conversas/:id/resolve`

## Compilar

Na pasta `android/sambah-atendimento`:

```bash
gradle :app:assembleDebug
```

APK gerado:

`app/build/outputs/apk/debug/app-debug.apk`

## Critério de aprovação

Uma mensagem real entra no SamBah, o celular alerta, a resposta é escrita no aplicativo e o cliente recebe a mensagem. Nenhuma tela ou confirmação isolada substitui esse teste.
