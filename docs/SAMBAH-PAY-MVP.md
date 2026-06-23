# SAMBAH-PAY-MVP

## MVP da FASE 2

Implementado em modo simulado:

1. Estrutura modular `src/sambahPay/`.
2. Core de pagamentos simulados.
3. Wallet simples.
4. Device Controller simulado.
5. AutoServe com sessao, carrinho, checkout e release token.
6. Release token com validade, uso unico e tentativas registradas.
7. Delivery event em liberacao simulada.
8. Machine alert em falha simulada.
9. Heartbeat e status de device.
10. Estoque por dispositivo/produto.
11. Event cashless simples.
12. BI operacional inicial.
13. Auditoria simulada e espelhada no audit existente.
14. Testes basicos de services e rotas.

## Fora do MVP

- Pix automatico real.
- TEF real.
- ERP real.
- MQTT real.
- ESP32, Arduino, Raspberry Pi ou CLP real.
- Balanca real.
- Sensor de fluxo real.
- Fiscal/NFC-e.

## Rotas principais

- `GET /api/sambah-pay/health`
- `GET /api/sambah-pay/core/status`
- `POST /api/sambah-pay/payments`
- `POST /api/sambah-pay/wallets`
- `POST /api/sambah-pay/autoserve/session`
- `POST /api/sambah-pay/autoserve/cart`
- `POST /api/sambah-pay/autoserve/checkout`
- `POST /api/sambah-pay/devices`
- `POST /api/sambah-pay/devices/:deviceId/products`
- `POST /api/sambah-pay/releases/:token/start`
- `POST /api/sambah-pay/releases/:token/complete`
- `POST /api/sambah-pay/releases/:token/fail`
- `GET /api/sambah-pay/bi/dashboard`

## MVP Voice Pay

Implementado em modo simulado:

1. Estrutura SamBah Voice Pay.
2. Rotas `/api/sambah-voice/*`.
3. Recebimento simulado de audio.
4. Transcricao simulada.
5. Identificacao simulada de intent.
6. Resposta simulada em texto e audio.
7. Handoff humano simulado.
8. Checkout por voz com confirmacao obrigatoria.
9. Compra de credito wallet por voz.
10. Compra AutoServe por voz sem liberacao direta por audio.
11. Auditoria para todas as etapas.
