# SAMBAH-PAY-DEVICE-CONTROLLER

## Objetivo

Criar uma camada tecnica para controlar dispositivos autonomos em modo simulado nesta fase, mantendo contrato futuro para hardware real.

## Tipos suportados

- beverage_machine
- beer_tap
- soda_dispenser
- juice_dispenser
- coffee_machine
- smart_fridge
- vending_machine
- buffet_scale
- pickup_locker
- access_gate
- generic_relay

## Modos de controle

- time_based
- pulse_based
- volume_based
- unit_based
- weight_based
- access_based

## Regras

- Todo device tem status.
- Todo device pode receber heartbeat simulado.
- Device sem heartbeat recente e tratado como `offline` no status.
- Produto sem estoque suficiente bloqueia carrinho/release.
- Toda falha simulada gera `machine_alert` e auditoria.
- Toda liberacao gera `device_command`, `release_attempt` e `delivery_event`.

## Adapters futuros

A interface atual e simulada, mas deixa espaco para:

- HTTP local.
- MQTT.
- ESP32.
- Arduino.
- Raspberry Pi.
- CLP.
- Placas de rele.
- Sensores de fluxo.
- Balancas.
- Travas eletricas.

## Weight Control Simulado\n\nO Device Controller continua responsavel por devices, heartbeat, comandos, estoque e machine_alerts. O SamBah Weight Control usa essa camada para registrar alertas criticos de peso, sem falar com balanca ou hardware real.\n
