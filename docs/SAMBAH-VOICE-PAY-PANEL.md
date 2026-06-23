# SAMBAH-VOICE-PAY-PANEL

## Objetivo

Painel operacional para testar e auditar o SamBah Voice Pay em modo mock.

A tela fica em `/sambah-voice-pay` e consome apenas rotas simuladas.

## Areas do painel

- Dashboard Voice.
- Simulador WhatsApp Voz.
- Transcricoes.
- Intents.
- Checkout por Voz.
- Wallet por Voz.
- AutoServe por Voz.
- Handoff Humano.
- Auditoria Voice.

## Rotas consumidas

- `GET /api/sambah-pay/voice/dashboard`
- `GET /api/sambah-pay/voice/transcriptions`
- `GET /api/sambah-pay/voice/intents`
- `POST /api/sambah-pay/voice/intents/:id/confirm`
- `GET /api/sambah-pay/voice/handoffs`
- `GET /api/sambah-pay/voice/audit`
- `POST /api/sambah-voice/webhook/whatsapp`
- `POST /api/sambah-voice/handoff`
- `POST /api/sambah-pay/voice/checkout`
- `POST /api/sambah-pay/voice/wallet-topup`
- `POST /api/sambah-pay/voice/autoserve-release`

## Garantias

- Nao usa WhatsApp real.
- Nao usa STT/TTS real.
- Nao usa IA externa real.
- Nao usa Pix real.
- Nao usa maquina real.
- Nao altera o Mesa do Xeriffe.

## Permissoes Mockadas

O painel mostra o perfil ativo no topo e permite alternar entre ADMIN, CAIXA, OPERADOR, ATENDENTE e AUDITOR em modo dev. Os botoes criticos sao desabilitados quando o perfil nao tem permissao. As chamadas para rotas criticas enviam o header mockado `x-sambah-role`.

## Correcao AutoServe por Voz

O botao Criar device demo agora usa /api/sambah-pay/devices/demo, preenche automaticamente device_id e evita o erro cru missing_required_fields. Sem device selecionado, o operador recebe: "Crie ou selecione um device antes da compra AutoServe."
