# Correção SamBah Conversas — 30/07/2026

## Corrigido

- Serialização das gravações da auditoria para impedir corrupção por concorrência.
- Escrita atômica de `audit-logs.json`.
- Recuperação automática de arrays JSON concatenados já existentes.
- Registro seguro no Render de falhas do envio manual:
  - `httpStatus`
  - `metaCode`
  - `metaSubcode`
  - tipo e mensagem devolvidos pela Meta
- Exibição do erro real da Meta na Central de Conversas.
- Abertura explícita da conversa no mobile.
- Correção da classe responsiva usada para alternar lista e chat.
- Atualização da chave dos arquivos estáticos para evitar o carregamento da interface antiga pelo navegador.

## Preservado

- Tokens e variáveis do Render.
- Webhook da Meta.
- Número do WhatsApp e Phone Number ID.
- Fluxos automáticos, atendimento humano, CRM, Mesa, Pérola e SamBah Pay.

## Validação

- Testes focados: 49 aprovados, 0 falhos.
- Suíte completa: 374 testes; 372 aprovados, 0 falhos e 2 ignorados.

## Após publicar

Se a Meta ainda recusar uma mensagem, procurar no Render:

```text
whatsapp.manual_send.failed
```

O registro mostrará a causa real sem expor token ou telefone. A interface também exibirá o código e a mensagem da Meta no atendimento.
