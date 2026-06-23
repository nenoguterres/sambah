# SamBah Security Bridge

## Objetivo

Converter eventos criticos do ecossistema SamBah em incidentes de seguranca simulados, rastreaveis por `correlationId` e `causationId`.

## Tela

- `/sambah-security`

## Endpoints

- `GET /api/sambah-security/incidents`
- `GET /api/sambah-security/incidents/:id`
- `POST /api/sambah-security/incidents/:id/acknowledge`
- `POST /api/sambah-security/incidents/:id/resolve`
- `POST /api/sambah-security/incidents/:id/dismiss`
- `POST /api/sambah-security/incidents/:id/escalate`
- `POST /api/sambah-security/incidents/:id/block_device_mock`
- `POST /api/sambah-security/incidents/:id/block_customer_mock`
- `POST /api/sambah-security/incidents/:id/mark_camera_clip_mock`
- `POST /api/sambah-security/incidents/:id/notify_operator_mock`
- `POST /api/sambah-security/incidents/:id/trigger_siren_mock`
- `POST /api/sambah-security/simulate/locker-fraud`
- `POST /api/sambah-security/simulate/zone-mismatch`
- `POST /api/sambah-security/simulate/device-offline`
- `POST /api/sambah-security/simulate/door-open-without-payment`
- `POST /api/sambah-security/simulate/weight-fraud`
- `GET /api/sambah-security/rules`
- `POST /api/sambah-security/rules`
- `GET /api/sambah-security/device-map`
- `POST /api/sambah-security/device-map`
- `GET /api/sambah-security/dashboard`

## Dados

- `data/sambah-security-events.json`
- `data/sambah-security-incidents.json`
- `data/sambah-security-actions.json`
- `data/sambah-security-rules.json`
- `data/sambah-security-device-map.json`

## Garantias

- Toda ocorrencia gera `audit_log`.
- Toda ocorrencia publica `security.incident.created`.
- Toda acao publica evento de seguranca.
- Acoes terminadas em `_mock` tambem publicam `security.action.mocked`.
- Nenhuma camera, sirene, trava, sensor, MQTT ou hardware real e acionado.
