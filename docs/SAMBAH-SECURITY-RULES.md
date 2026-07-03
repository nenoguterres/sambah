# SamBah Security Rules

## Regras Padrao

As regras padrao ficam no `securityBridgeService` e mapeiam eventos criticos para modulo, severidade, mensagem e acao recomendada.

## Regras Customizadas

Rotas mockadas:

- `GET /api/sambah-security/rules`
- `POST /api/sambah-security/rules`

Nesta fase, regras customizadas sao persistidas, mas nao substituem motor real de regras.
