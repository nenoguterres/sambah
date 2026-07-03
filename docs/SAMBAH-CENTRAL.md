# SamBah Central

A SamBah Central e o hub administrativo do ecossistema.

## Cards

- SamBah Voice Pay
- SamBah Pay
- AutoServe
- Devices
- Wallet
- Auditoria
- Usuarios e Permissoes
- Seguranca e i9ACAO futuro
- Integracoes futuras
- Status do Ecossistema

Cada card usa /api/sambah-pay/ecosystem/status e mostra status mockado, contagem, resumo e link para o painel.

## Locker Frio

A Central inclui o card Locker Frio, apontando para /sambah-locker. O card usa as contagens de locker_zones e secure_pickup_sessions.

Na consolidacao v0.2, o link canonico e relativo:

```text
/sambah-locker
```

Nao usar porta fixa no link da Central. A mesma instancia que serve /sambah-central deve servir /sambah-locker.

## Weight Control

A Central inclui o card Weight Control, apontando para /sambah-weight. O card usa contagens de weight_validations e mostra o status da camada de peso simulada.

Na FASE WEIGHT CONTROL, a navegacao principal tambem inclui o link direto /sambah-weight.

Indicadores dedicados: weight_readings, weight_validations, weight_alerts e weight_fraud_suspected.

## Painel Operacional Consolidado

A Central agora tambem exibe missao operacional, alertas criticos, auditoria recente, cards consolidados e um fluxo demo guiado de pedido, pagamento mock, Locker, PIN, peso e auditoria.

As permissoes visuais seguem o perfil selecionado no painel e nao ativam integracoes reais.

## Event Bus e Cockpit Operacional

A Central inclui os cards:

- SamBah Event Bus -> `/sambah-events`
- Cockpit Operacional -> `/sambah-observability`

Os indicadores novos expostos no status consolidado sao:

- `event_bus_events`
- `event_outbox`
- `event_dead_letter`
- `operational_alerts`
- `traces`

Esses cards operam somente em modo simulado e nao ativam Kafka, RabbitMQ, Redis, Prometheus, Grafana, Loki, ELK ou OpenTelemetry real.

## Seguranca / i9ACAO

A Central inclui o card Seguranca / i9ACAO, apontando para `/sambah-security`.

O card usa os indicadores `security_incidents`, `security_incidents_open` e `security_actions_mocked`.

## LGPD e Logs Criticos

A Central inclui o card LGPD e Logs Criticos, apontando para `/sambah-lgpd`.

O painel agrega logs criticos, exportacao mascarada, politicas de retencao e solicitacoes de privacidade simuladas.

## Banco / PostgreSQL

A Central inclui o card Banco / PostgreSQL, apontando para `/sambah-database`.

A Central inclui o card Mensageria, apontando para `/sambah-messaging`, com Event Bus interno como padrao e brokers reais apenas preparados.

O painel mostra `DATABASE_MODE`, health da persistencia, migrations SQL, tabelas planejadas e dry-run sem exigir PostgreSQL instalado.
