# SamBah Ecossistema

A Fase Ecossistema unifica os modulos SamBah em uma primeira camada operacional acessivel por telas locais.

## Rotas visuais

- /sambah-central
- /sambah-pay
- /sambah-autoserve
- /sambah-devices
- /sambah-voice-pay
- /sambah-locker
- /sambah-weight
- /sambah-events
- /sambah-observability

## Escopo desta fase

Central, menus, paineis basicos, dados demo, permissoes mockadas, auditoria e contrato futuro de seguranca.

Nao ha WhatsApp real, STT/TTS real, IA externa, Pix, TEF, ERP real, MQTT, hardware, sensor, locker, balanca ou i9ACAO real.

## Consolidacao v0.2

A instancia operacional local consolidada usa a porta padrao 3000. A porta 3001 foi usada apenas como validacao temporaria e nao e necessaria para testar a versao atual.

Checklist da consolidacao:

- /login abre em 3000.
- /sambah-central abre em 3000 e mostra o card Locker Frio.
- /sambah-locker abre em 3000 apos login.
- /api/sambah-pay/locker/bootstrap popula cerca de 40 zonas simuladas.
- Eventos criticos do Locker geram audit_log, machine_alert e estrutura futura i9ACAO.

Comando recomendado:

```powershell
npm run start:clean:3000
```

## Event Bus + Cockpit Operacional

A Fase 1 adiciona mensageria e observabilidade simuladas:

- `/sambah-events` para event store, outbox, dead letter, retry e consumidores.
- `/sambah-observability` para health, metricas, traces, alertas e busca por correlacao.
- Central com cards SamBah Event Bus e Cockpit Operacional.
- Persistencia local em arquivos `data/sambah-events*.json`, `data/sambah-metrics.json`, `data/sambah-traces.json` e `data/sambah-operational-alerts.json`.

Kafka, RabbitMQ, Redis, Prometheus, Grafana, Loki, ELK, OpenTelemetry e microsservicos reais continuam fora do escopo desta etapa.
