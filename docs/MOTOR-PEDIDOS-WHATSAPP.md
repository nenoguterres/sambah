# Motor de pedidos WhatsApp do samBah!

## Objetivo

O motor entende texto livre do cliente, monta um rascunho e so envia ao Mesa do Xeriffe depois de confirmacao.

O `samBah!` nao inventa produto. O Mesa continua sendo a fonte oficial do cardapio.

## Arquivos

```text
src/orderDraftService.js
data/sambah-menu-rules.json
data/order-drafts.json
```

## Fluxo

```text
Cliente escreve -> samBah! normaliza -> classifica intencao -> procura produto no cardapio Mesa -> monta rascunho -> pede confirmacao -> valida novamente -> envia ao Mesa
```

## Intencoes

- `immediate_order`
- `menu_request`
- `event_lead`
- `reservation`
- `commercial_lead`
- `human_request`
- `needs_review`

## Regras de confianca

- `confidence >= 0.80`: rascunho pronto para confirmacao.
- `confidence entre 0.50 e 0.79`: sugestao de opcoes.
- `confidence < 0.50`: revisao manual.

Nunca enviar ao Mesa sem:

- `productId` valido
- quantidade valida
- cardapio sincronizado
- confirmacao do cliente ou operador

## Tags e apelidos

Arquivo:

```text
data/sambah-menu-rules.json
```

Ele contem:

- sinonimos globais
- aliases por produto
- keywords por produto
- aliases de adicionais
- regra de adicional como `note` ou `addon`

Exemplos:

- `espetim` -> `espetinho`
- `kachurasco` -> `kachurrasco`
- `sem cebola` -> note
- `bacon extra` -> addon, se existir no produto oficial

## Adicionais

Remocao simples vira observacao:

```text
sem cebola -> note: sem cebola
```

Adicional pago precisa existir como addon oficial no produto:

```text
bacon extra -> addons: ["bacon-extra"]
```

Se o addon pago nao existir, o rascunho fica `needs_review` com motivo `addon_invalido`.

## Endpoints

```text
GET /admin/orders/drafts
POST /admin/orders/drafts/test-parse
POST /admin/orders/drafts/confirm
POST /admin/orders/drafts/cancel
```

### Testar leitura

Entrada:

```json
{
  "text": "me vê dois kachurrasco sem cebola",
  "customer": {
    "name": "Cliente Teste",
    "phone": "51999999999"
  }
}
```

Saida esperada:

```json
{
  "ok": true,
  "draft": {
    "status": "draft",
    "confidence": 0.8,
    "items": [
      {
        "productId": "kachurrasco",
        "qty": 2,
        "addons": [],
        "note": "sem cebola"
      }
    ],
    "needsConfirmation": true
  }
}
```

## Exemplos

- `me vê dois kachurrasco sem cebola`
- `quero um espetinho de carne e uma coca`
- `tem cachorro?`
- `quero food truck para aniversário`

## Revisao manual

Quando o motor nao tem seguranca:

- produto inexistente
- produto sem `productId`
- addon pago inexistente
- quantidade invalida
- cardapio nao sincronizado

O rascunho fica `needs_review`. O operador decide se cancela, corrige em etapa futura ou atende manualmente.
