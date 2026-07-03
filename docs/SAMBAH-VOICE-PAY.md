# SAMBAH-VOICE-PAY

## Objetivo

Integrar atendimento por voz no WhatsApp ao SamBah Pay em modo simulado.

O SamBah Voice Pay recebe audio, registra a mensagem, simula transcricao, identifica intent operacional, gera resposta em texto/audio e encaminha a acao para SamBah Pay quando envolver pagamento, wallet ou AutoServe.

## Submodulos

- SamBah Voice Gateway.
- SamBah Speech Adapter.
- SamBah Voice Intent.
- SamBah Voice Response.
- SamBah Voice Handoff.
- SamBah Pay Voice Checkout.

## Entidades

- voice_messages.
- voice_transcriptions.
- voice_intents.
- voice_sessions.
- voice_responses.
- voice_handoff_logs.
- voice_payment_links.

## Endpoints

- POST `/api/sambah-voice/webhook/whatsapp`
- POST `/api/sambah-voice/transcribe`
- POST `/api/sambah-voice/intent`
- POST `/api/sambah-voice/respond`
- POST `/api/sambah-voice/handoff`
- POST `/api/sambah-pay/voice/checkout`
- POST `/api/sambah-pay/voice/wallet-topup`
- POST `/api/sambah-pay/voice/autoserve-release`
- GET `/api/sambah-pay/voice/session/:sessionId`

## Regras

- Audio nunca libera produto diretamente.
- Audio sempre passa por transcricao antes de acao operacional.
- Texto transcrito vira intent.
- Intents criticas exigem confirmacao.
- Pagamentos passam pelo SamBah Pay.
- Liberacao de maquina passa por release_token.
- Toda transcricao, intent, resposta, handoff e falha gera auditoria.
- Fornecedores reais ficam fora desta etapa.
