# SamBah Weight Control

Bloco simulado do SamBah Pay para validar entregas, retiradas e estoque por peso antes de qualquer integracao real com balanca ou hardware.

## Objetivo

Reduzir fraude, retirada acima do pago, retirada de produto errado, divergencia de estoque, porta aberta sem retirada e erro de entrega.

## Componentes

- MockScaleAdapter: simula leitura de balanca.
- SambahWeightControlService: calcula tolerancia, status, eventos, auditoria, alertas e contrato i9ACAO futuro.
- SambahWeightControlController: expoe a camada HTTP.
- Painel /sambah-weight: dashboard e simuladores.
- Repositorios JSON: weight_readings, weight_validations, weight_events, weight_calibrations e machine_alerts.

## Endpoints

- POST /api/sambah-pay/weight/reading
- POST /api/sambah-pay/weight/validate
- GET /api/sambah-pay/weight/readings
- GET /api/sambah-pay/weight/validations
- GET /api/sambah-pay/weight/events
- GET /api/sambah-pay/weight/alerts
- POST /api/sambah-pay/weight/calibrate
- POST /api/sambah-pay/weight/simulate-locker-zone
- POST /api/sambah-pay/weight/simulate-self-service
- POST /api/sambah-pay/weight/simulate-beverage
- POST /api/sambah-pay/weight/simulate-smart-fridge
- POST /api/sambah-pay/weight/simulate-pickup

## Status

- weight_ok
- weight_under
- weight_over
- weight_missing
- weight_unstable
- weight_fraud_suspected
- manual_review

## Regras

Toda leitura gera registro. Toda validacao critica gera audit_log. Toda divergencia critica gera machine_alert. Toda fraude suspeita prepara evento futuro i9ACAO. O modulo opera somente em modo simulado.

Na versao v1.0 simulada, a Central tambem expõe indicadores de leituras, validacoes, alertas de peso e fraudes suspeitas.

Nao ha balanca real, USB, serial, Bluetooth, MQTT, ESP32, Raspberry, CLP, sensor, trava, Pix, TEF, ERP, WhatsApp, STT/TTS, IA externa ou i9ACAO real.
