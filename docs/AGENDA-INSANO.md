# Agenda Insano

O Agenda Insano registra pedidos de Food Truck, eventos, aniversários, reservas no Xeriffe, eventos corporativos, condomínio e Beer Truck / Chope recebidos pelo samBah!.

## Papel no fluxo

- Pedido imediato continua no Mesa do Xeriffe.
- Food Truck, evento e reserva entram na Agenda Insano.
- Google Agenda ainda não está integrado.
- O samBah! registra o lead em JSON local e mostra no painel admin.

## Arquivos

- `src/eventScheduleService.js`: serviço de agenda e leads.
- `data/event-leads.json`: leads recebidos.
- `data/insano-services.json`: serviços iniciais configuráveis.

## Lead

```json
{
  "id": "event_...",
  "source": "site / whatsapp / samBah!",
  "status": "new",
  "customer": {
    "name": "",
    "phone": "",
    "email": ""
  },
  "event": {
    "type": "",
    "date": "",
    "time": "",
    "location": "",
    "people": null,
    "service": "",
    "notes": ""
  },
  "createdAt": "",
  "updatedAt": "",
  "history": []
}
```

No retorno admin, telefone é mascarado em `phoneMasked`.

## Status

- `new`: lead novo.
- `needs_info`: aguardando informação.
- `pre_reserved`: pré-reserva.
- `quote_sent`: orçamento enviado.
- `confirmed`: confirmado.
- `canceled`: cancelado.
- `lost`: perdido.

## Endpoints

### GET /admin/events/leads

Lista leads. Aceita `limit` e `status`.

### POST /admin/events/leads

Cria lead manual.

### POST /admin/events/leads/update

Atualiza status, dados do cliente ou dados do evento.

### POST /admin/events/leads/cancel

Marca lead como `canceled`. Não apaga direto.

### GET /admin/events/services

Lista serviços disponíveis.

### GET /admin/events/stats

Retorna contadores por status e próximos eventos.

## Webhooks

Quando `/webhook/site` ou `/webhook/whatsapp` classifica como `event_lead` ou `reservation`, o samBah! salva um lead em `data/event-leads.json` e retorna o `leadId`.

## Limites atuais

- Não sincroniza Google Agenda.
- Não envia proposta automática.
- Não cria pedido no Mesa para evento.
- Comercial puro ainda pode ser tratado pelo Radar Comercial em etapa futura.
