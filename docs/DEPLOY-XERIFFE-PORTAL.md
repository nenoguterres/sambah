# Deploy Xeriffe Portal

## Dominio principal

```text
xeriffeobirici.com.br
```

O dominio principal deve apontar para o servidor publico do SamBah e abrir o portal tecnologico em `GET /`.

## Rotas publicas

```text
Portal: https://xeriffeobirici.com.br/
Webhook Meta: https://xeriffeobirici.com.br/webhooks/meta
Health: https://xeriffeobirici.com.br/health
```

## Gastronomia

O conteudo gastronomico, pedidos publicos e comunicacao de comida migram para:

```text
https://insanofoodtruck.com.br
```

## Checklist de publicacao

1. Apontar `xeriffeobirici.com.br` para o servidor publico.
2. Ativar HTTPS no dominio principal.
3. Configurar variaveis de ambiente Meta no servidor sem commitar token real.
4. Confirmar `GET /` servindo `portal-xeriffe.html`.
5. Confirmar `GET /health`.
6. Confirmar webhook Meta em `https://xeriffeobirici.com.br/webhooks/meta`.

## Fora do escopo desta fase

- Criar banco novo.
- Alterar logica do SamBah.
- Alterar integracao Meta.
- Alterar SamBah Pay alem de links de navegacao.
