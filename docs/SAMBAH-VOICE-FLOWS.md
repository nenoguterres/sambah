# SAMBAH-VOICE-FLOWS

## Fluxo principal

1. Cliente envia voz pelo WhatsApp.
2. Mock WhatsApp recebe a midia.
3. Voice Gateway registra `voice_message`.
4. Mock STT cria `voice_transcription`.
5. Mock AI Intent cria `voice_intent`.
6. Voice Response cria texto e audio simulado.
7. Se a intent for critica, o sistema pede confirmacao.
8. Se confirmado, SamBah Pay executa checkout, wallet ou AutoServe.
9. Casos complexos criam `voice_handoff_log`.
10. Tudo gera auditoria.

## Intents iniciais

- novo_pedido
- adicionar_item
- remover_item
- consultar_cardapio
- fechar_mesa
- pagar_conta
- gerar_pix
- consultar_status
- falar_com_humano
- orcar_evento
- comprar_credito_wallet
- consultar_saldo_wallet
- autoserve_purchase
- autoserve_release
- consultar_maquina
- reportar_falha_maquina

## Fluxo Voice Checkout

1. Intent `pagar_conta` e confirmacao recebida.
2. SamBah Pay Core cria pagamento simulado.
3. `voice_payment_link` e criado.
4. Auditoria registra checkout por voz.

## Fluxo Wallet por voz

1. Intent `comprar_credito_wallet` e confirmacao recebida.
2. Core cria pagamento simulado.
3. Wallet recebe credito.
4. Wallet movement e auditoria sao registrados.

## Fluxo AutoServe por voz

1. Intent `autoserve_purchase` ou `autoserve_release` e confirmada.
2. AutoServe cria sessao/carrinho/checkout ou inicia release token existente.
3. Release token continua unico, expira e e de uso unico.
4. Liberacao fisica real nao existe nesta etapa.

## Fluxo do painel operacional

1. Operador abre `/sambah-voice-pay`.
2. Dashboard carrega totais via `/api/sambah-pay/voice/dashboard`.
3. Simulador envia audio mockado para `/api/sambah-voice/webhook/whatsapp`.
4. Painel lista transcricoes, intents, handoffs e auditoria em rotas isoladas.
5. Acoes criticas de checkout, wallet e AutoServe exigem confirmacao no payload.
6. AutoServe por voz continua passando por SamBah Pay e release_token.
