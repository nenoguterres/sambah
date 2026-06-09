# Fluxo de atendimento samBah!

## Papel do samBah!

O `samBah!` recebe mensagens vindas do WhatsApp e dos canais digitais dos sites. Ele classifica a intencao, responde com script base, valida pedidos pelo cardapio oficial do Mesa e encaminha cada caso para o destino correto.

Regra principal:

```text
Mesa cadastra -> samBah! sincroniza -> Cliente pede -> samBah! valida -> Mesa executa
```

## Intencoes

Intencoes reconhecidas:

- `immediate_order`: pedido imediato para o Mesa.
- `menu_request`: pedido de cardapio, precos ou opcoes.
- `event_lead`: evento ou food truck, destino futuro Agenda Insano.
- `reservation`: reserva Xeriffe.
- `commercial_lead`: contato comercial, destino futuro Radar Comercial.
- `human_request`: atendimento humano, responsavel Neno, Kazuko ou geral.
- `needs_review`: mensagem confusa, produto sem `productId` ou pedido fora do cardapio.

## Scripts base

Arquivo:

```text
data/sambah-scripts.json
```

Scripts criados:

- `greeting_initial`
- `pedido`
- `cardapio`
- `evento`
- `food_truck`
- `reserva_xeriffe`
- `atendimento_humano`
- `confirmacao_pedido`
- `pedido_para_revisao`

## Pedido imediato

Pedido imediato usa apenas o cardapio oficial sincronizado do Mesa.

O `samBah!` pode montar itens automaticamente quando reconhece um produto pelo `productId`, alias ou nome oficial do cache. O resultado vira rascunho e precisa de confirmacao antes de seguir ao Mesa.

O item so segue ao Mesa quando passa pela validacao:

- `productId` existe no cache do Mesa
- produto esta disponivel
- adicional existe quando usado
- adicional esta disponivel quando usado
- quantidade e valida

Se falhar, o rascunho fica em `needs_review` e aparece no painel para conferencia.

## Rascunhos

Arquivo:

```text
data/order-drafts.json
```

Endpoints:

```text
GET /admin/orders/drafts
POST /admin/orders/drafts/test-parse
POST /admin/orders/drafts/confirm
POST /admin/orders/drafts/cancel
```

O painel `/admin` tem o bloco "Rascunhos do WhatsApp" para testar frases, revisar confianca, confirmar envio ao Mesa ou cancelar.

## Roteamento

```text
WhatsApp/Site -> samBah! -> classificador
```

Destinos:

- Mesa do Xeriffe: `immediate_order`
- Revisao manual: `needs_review`
- Agenda Insano futura: `event_lead` e food truck
- Radar Comercial futuro: `commercial_lead`
- Atendimento humano: `human_request`
- Cardapio: `menu_request`
- Reserva Xeriffe: `reservation`

## Endpoints de entrada

```text
POST /webhook/whatsapp
POST /webhook/site
```

Ambos usam a mesma arvore de atendimento.

## Garantias operacionais

- O `samBah!` nao inventa produto.
- Nome livre ou pedido confuso nao vai automaticamente ao Mesa.
- Pedido invalido nao e perdido; vira revisao.
- Evento e food truck nao entram no fluxo de producao do Mesa.
- Comercial nao entra no fluxo de pedido; vai para Radar Comercial futuro.
- Atendimento humano marca responsavel quando a mensagem cita Neno ou Kazuko.
