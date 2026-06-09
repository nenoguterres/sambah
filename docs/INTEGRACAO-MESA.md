# Integração Mesa do Xeriffe

## Papel dos sistemas

O `samBah!` é um módulo auxiliar de recepção via WhatsApp. Ele recebe mensagens e pedidos externos, registra auditoria operacional, normaliza o conteúdo e mantém uma fila local para encaminhamento.

O Mesa do Xeriffe continua sendo o sistema principal de caixa, pedido e produção. O `samBah!` não substitui o Mesa.

Fluxo previsto:

```text
WhatsApp -> samBah! -> Fila segura -> Mesa do Xeriffe -> Caixa/Produção -> Retorno ao cliente
```

## Configuração

Configuração padrão:

```text
MESA_BASE_URL=http://127.0.0.1:4173
MESA_ORDER_PATH=/api/orders/external
MESA_MENU_PATH=/api/menu
MESA_HEALTH_PATH=/health
MESA_TIMEOUT_MS=1500
```

Essas variáveis podem ser definidas no ambiente antes de iniciar o servidor.

## Contrato interno do pedido

Pedido normalizado criado a partir do webhook WhatsApp:

```json
{
  "source": "whatsapp",
  "channel": "samBah",
  "externalId": "evt-123",
  "customer": {
    "name": "Cliente",
    "phone": "11999990000"
  },
  "order": {
    "type": "whatsapp",
    "table": null,
    "items": [],
    "notes": "Mensagem recebida pelo WhatsApp",
    "total": null
  },
  "status": "received",
  "createdAt": "2026-06-03T12:00:00.000Z"
}
```

Para teste integrado com o Mesa v144, use item com `productId` real do catálogo do Mesa:

```json
{
  "productId": "kachurrasco",
  "qty": 1,
  "addons": [],
  "serveMode": "Levar",
  "note": "Pedido teste samBah!"
}
```

O Mesa v144 não converte nome livre de produto nesta etapa.

## Cardápio único

O Mesa do Xeriffe é a fonte oficial do cardápio. O `samBah!` não mantém lista própria de produtos.

Arquivos no `samBah!`:

```text
src/menuSyncService.js
data/menu-cache.json
```

Endpoints administrativos:

```text
GET /admin/menu/status
POST /admin/menu/sync
GET /admin/menu/cache
```

Fluxo:

1. `POST /admin/menu/sync` busca `GET /api/menu` no Mesa.
2. O resultado fica salvo em `data/menu-cache.json`.
3. Antes de enviar pedido ao Mesa, o `samBah!` valida se todos os itens têm `productId` válido no cache.
4. Pedido com item sem `productId` ou com `productId` inexistente fica em revisão e não é enviado automaticamente.

Nome livre de produto deve ir para conferência manual.

## Fila local

Arquivo:

```text
data/mesa-queue.json
```

A fila mantém pedidos quando o Mesa estiver fora do ar. Cada entrada registra:

- pedido normalizado
- status atual
- tentativas de envio
- último erro
- último envio
- aceite pelo Mesa
- histórico operacional resumido

Status usados nesta etapa:

- `pending`: salvo localmente e aguardando envio ou reenvio
- `sending`: tentativa em andamento
- `accepted`: Mesa respondeu com sucesso HTTP 2xx

Os endpoints administrativos mascaram telefone antes de exibir os dados no painel.

## Endpoints administrativos

### `GET /admin/mesa/status`

Consulta a saúde configurada do Mesa e retorna também um resumo da fila.

### `GET /admin/mesa/queue`

Lista a fila local. Aceita `limit`.

Exemplo:

```text
/admin/mesa/queue?limit=100
```

### `POST /admin/mesa/retry`

Tenta reenviar pedidos pendentes ao Mesa.

### `POST /admin/mesa/send-test-order`

Cria um pedido teste local, tenta encaminhar ao Mesa e registra auditoria da tentativa.

## Webhook WhatsApp

Endpoint existente:

```text
POST /webhook/whatsapp
```

Na recepção normal:

1. registra auditoria do webhook
2. cria pedido normalizado
3. salva na fila local
4. tenta enviar ao Mesa
5. se o Mesa falhar, mantém o pedido como pendente

Falhas operacionais continuam usando `processing_error` com deduplicação para evitar registro duplicado do mesmo erro.

## Validação local

Com PowerShell, usar `npm.cmd`:

```text
npm.cmd test
```

Validações HTTP esperadas:

```text
GET /admin
GET /admin/mesa/status
GET /admin/mesa/queue
```

Todos devem responder `200`.

## Revisao manual de pedidos bloqueados

Pedido invalido nao e perdido. Quando a validacao do cardapio falha, o `samBah!` salva o pedido em `data/mesa-queue.json` com status `needs_review` e motivo claro. O pedido nao e enviado automaticamente ao Mesa.

Motivos previstos:

- `productId_invalido`
- `produto_sem_productId`
- `produto_indisponivel`
- `addon_invalido`
- `addon_indisponivel`
- `quantidade_invalida`
- `menu_nao_sincronizado`

Endpoints:

```text
GET /admin/orders/review
POST /admin/orders/review/cancel
```

O painel `/admin` exibe a area "Pedidos para revisao" com cliente, telefone mascarado, itens recebidos, motivo do bloqueio, horario e status. Nesta etapa o operador pode cancelar a revisao. A edicao e reenvio manual ficam para etapa futura.

Regra operacional:

```text
Mesa cadastra -> samBah! sincroniza -> Cliente pede -> samBah! valida -> Mesa executa
```

O Mesa continua sendo a fonte oficial do produto. O `samBah!` nao inventa produto e nao converte nome livre em pedido automatico.
