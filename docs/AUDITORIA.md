# Auditoria Operacional samBah!

Versao: 1.0.0

## Persistencia

Os eventos sao persistidos em `data/audit-logs.json`. O arquivo deve existir como uma lista JSON e pode comecar vazio:

```json
[]
```

## Servico

A camada de auditoria fica isolada em `src/auditService.js`.

Ela e responsavel por:

- gravar eventos do webhook e do sistema;
- mascarar telefone, e-mail, tokens, senhas e chaves sensiveis;
- gerar estatisticas por tipo e status;
- listar eventos recentes com paginacao;
- evitar duplicacao de `processing_error` com a mesma chave operacional.

## Endpoints

`GET /admin/audit/stats`

Retorna:

```json
{
  "total": 0,
  "byType": {},
  "byStatus": {},
  "lastEventAt": null,
  "lastErrorAt": null,
  "health": "ok"
}
```

`GET /admin/audit/logs?limit=100&offset=0`

Parametros:

- `limit`: quantidade de eventos, limitado a 500;
- `offset`: deslocamento da consulta;
- `type`: filtro opcional por tipo;
- `status`: filtro opcional por status.

Resposta:

```json
{
  "total": 0,
  "limit": 100,
  "offset": 0,
  "items": []
}
```

## Eventos principais

- `webhook_received`: entrada recebida no webhook;
- `webhook_processed`: processamento concluido;
- `processing_error`: falha operacional durante processamento;
- `system_error`: erro inesperado no servidor HTTP;
- `system_event`: evento operacional geral.

## Painel

O painel fica em `GET /admin` e consome os endpoints de auditoria para mostrar:

- status operacional;
- total de eventos;
- ultimo erro;
- contadores por tipo e status;
- ultimos erros;
- logs recentes.

## Identidade visual

O painel usa a marca publica `samBah!` e a logo oficial em `public/assets/brand/logo-sambah-oficial.png`.

O mascote CapBah so deve ser aplicado quando o arquivo aprovado for fornecido em `public/assets/brand/capbah-oficial.png`.

Arquivos gerados, sources com fundo magenta e variacoes nao aprovadas ficam isolados em `public/assets/rejeitados/` e nao sao chamados pelo app.

O favicon usa uma cuia estilizada em `public/assets/favicon.png` e `public/assets/favicon.svg`.
