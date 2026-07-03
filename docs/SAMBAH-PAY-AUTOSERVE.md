# SAMBAH-PAY-AUTOSERVE

## Objetivo

Adicionar ao SamBah Pay suporte a maquinas autonomas de bebidas, chopeiras, geladeiras inteligentes, dispensers, totens, retirada por QR Code/senha e operacoes de self-service.

Nesta etapa, o modulo deve funcionar em modo simulado, sem depender de hardware real. A arquitetura, porem, deve deixar preparados adapters para ESP32, Arduino, Raspberry Pi, CLP, MQTT, HTTP local, placas de rele, sensores de fluxo, balancas e travas eletricas.

## Blocos

### SamBah Pay AutoServe

Responsavel pela jornada de autosservico do cliente.

Funcionalidades:

- Autoatendimento por QR Code.
- Totem de pedido futuro.
- Carrinho de compra autonomo.
- Checkout autonomo.
- Liberacao de produto apos pagamento.
- Self-service livre.
- Self-service por kg manual.
- Self-service por kg autonomo futuro.
- Retirada por senha ou QR Code.
- Status de entrega ao cliente.

### SamBah Device Controller

Camada tecnica responsavel por comunicar, simular e futuramente controlar dispositivos fisicos.

Funcionalidades:

- Cadastro de dispositivos.
- Comunicacao com maquinas.
- Envio de comandos.
- Controle de reles.
- Controle por pulso.
- Controle por tempo.
- Controle por volume.
- Controle por unidade.
- Controle por peso.
- Heartbeat de dispositivos.
- Status online/offline.
- Registro de falhas.

## Tipos de dispositivos

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

## Tipos de liberacao

- time_based
- pulse_based
- volume_based
- unit_based
- weight_based
- access_based

## Status de liberacao

- release_pending
- release_authorized
- releasing
- delivered
- partial_delivery
- delivery_failed
- blocked
- manual_review
- refunded

## Entidades

### devices

Campos minimos:

- id
- name
- type
- location
- status
- control_mode
- ip_address opcional
- mqtt_topic opcional
- api_endpoint opcional
- relay_channel opcional
- created_at
- updated_at

### device_products

Relaciona produtos a dispositivos.

Campos minimos:

- id
- device_id
- product_id
- price
- quantity_per_release
- unit
- status
- created_at
- updated_at

### device_commands

Campos minimos:

- id
- device_id
- release_token_id
- command_type
- payload
- status
- response
- created_at
- executed_at

### device_status_logs

Campos minimos:

- id
- device_id
- status
- heartbeat_at
- payload
- created_at

### release_tokens

Campos minimos:

- id
- token
- payment_id
- product_id
- device_id
- session_id
- quantity
- unit
- expires_at
- used_at
- status
- created_at

### release_attempts

Campos minimos:

- id
- release_token_id
- token
- device_id
- action
- result
- error_message
- created_at

### delivery_events

Campos minimos:

- id
- release_token_id
- device_id
- event_type
- expected_quantity
- delivered_quantity
- unit
- sensor_confirmed
- error_message
- created_at

### flow_meter_readings

Campos minimos:

- id
- device_id
- product_id
- release_token_id
- volume
- unit
- raw_payload
- created_at

### stock_volumes

Campos minimos:

- id
- product_id
- device_id
- initial_quantity
- current_quantity
- unit
- min_quantity
- updated_at

Unidades aceitas:

- ml
- litro
- unidade
- grama
- kg

### machine_alerts

Campos minimos:

- id
- device_id
- release_token_id
- severity
- type
- message
- status
- resolved_by
- resolved_at
- created_at

### autoserve_sessions

Campos minimos:

- id
- customer_id
- channel
- status
- cart
- payment_id
- started_at
- completed_at
- canceled_at

### pickup_codes

Campos minimos:

- id
- code
- session_id
- payment_id
- status
- expires_at
- used_at
- created_at

### scale_readings

Campos minimos:

- id
- device_id
- session_id
- product_id
- weight
- unit
- stable
- raw_payload
- created_at

## Endpoints

### AutoServe

- POST `/api/sambah-pay/autoserve/session`
- POST `/api/sambah-pay/autoserve/cart`
- POST `/api/sambah-pay/autoserve/checkout`
- GET `/api/sambah-pay/autoserve/status/:sessionId`

### Devices

- POST `/api/sambah-pay/devices`
- GET `/api/sambah-pay/devices`
- GET `/api/sambah-pay/devices/:deviceId`
- PATCH `/api/sambah-pay/devices/:deviceId`
- POST `/api/sambah-pay/devices/:deviceId/heartbeat`
- POST `/api/sambah-pay/devices/:deviceId/command`
- GET `/api/sambah-pay/devices/:deviceId/status`

### Releases

- POST `/api/sambah-pay/releases/create`
- POST `/api/sambah-pay/releases/:token/validate`
- POST `/api/sambah-pay/releases/:token/start`
- POST `/api/sambah-pay/releases/:token/complete`
- POST `/api/sambah-pay/releases/:token/fail`

### Sensores

- POST `/api/sambah-pay/scale/reading`
- POST `/api/sambah-pay/flow-meter/reading`

### Alertas

- GET `/api/sambah-pay/machine-alerts`
- POST `/api/sambah-pay/machine-alerts/:id/resolve`

## Fluxo obrigatorio

1. Cliente inicia sessao autonoma por QR Code, totem ou app.
2. Cliente escolhe produto.
3. Sistema cria `autoserve_session`.
4. Sistema cria pagamento.
5. Apos pagamento confirmado, sistema cria `release_token`.
6. `release_token` deve ter validade curta, uso unico e vinculo com pagamento, produto, dispositivo e cliente/sessao.
7. Device Controller valida token.
8. Device Controller envia comando para a maquina.
9. Maquina executa liberacao.
10. Sistema registra resultado: entregue, entrega parcial, falha ou cancelado.
11. Sistema baixa estoque.
12. Sistema gera auditoria.
13. Sistema sincroniza com ERP Adapter, quando configurado.

## Regras obrigatorias

- Nenhuma maquina deve liberar produto sem pagamento confirmado ou token valido.
- Todo `release_token` deve ser de uso unico.
- Todo `release_token` deve expirar.
- Toda tentativa de uso deve gerar `release_attempt`.
- Toda liberacao deve gerar `delivery_event`.
- Toda falha deve gerar `machine_alert` e `audit_log`.
- Todo pagamento confirmado sem entrega deve ir para `manual_review`.
- Toda entrega parcial deve permitir complemento ou estorno parcial.
- Todo dispositivo deve enviar heartbeat.
- Dispositivo sem heartbeat deve ficar `offline`.
- Produto esgotado deve bloquear venda daquele produto naquele dispositivo.
- Estoque por volume deve aceitar `ml`, `litro`, `unidade`, `grama` e `kg`.
- O modulo deve funcionar inicialmente em modo simulado, sem hardware real.
- Nao quebrar o Mesa do Xeriffe existente.
- Nao depender de ERP especifico.
- Toda acao critica deve gerar auditoria.

## Adapters

### DeviceAdapter

Contrato generico para controlar dispositivos reais ou simulados.

Operacoes recomendadas:

- `getStatus(device)`
- `sendCommand(device, command)`
- `validateHeartbeat(device)`
- `simulateCommand(device, command)`
- `normalizeResponse(response)`

Implementacoes futuras:

- `SimulatedDeviceAdapter`
- `HttpLocalDeviceAdapter`
- `MqttDeviceAdapter`
- `Esp32DeviceAdapter`
- `ArduinoDeviceAdapter`
- `RaspberryPiDeviceAdapter`
- `ClpDeviceAdapter`

### StockAdapter

Contrato para baixa e validacao de estoque por dispositivo.

Operacoes recomendadas:

- `checkAvailability(deviceId, productId, quantity, unit)`
- `reserveStock(deviceId, productId, quantity, unit)`
- `commitStock(deviceId, productId, quantity, unit)`
- `releaseReservation(deviceId, productId, quantity, unit)`
- `markSoldOut(deviceId, productId)`

### ReleaseAdapter

Contrato para coordenar autorizacao e entrega.

Operacoes recomendadas:

- `createToken(payment, product, device, session)`
- `validateToken(token)`
- `startRelease(token)`
- `completeRelease(token, deliveryResult)`
- `failRelease(token, error)`

## MVP desta etapa

1. Criar cadastro de dispositivos.
2. Criar cadastro de produto por dispositivo.
3. Criar sessao de autosservico.
4. Criar checkout autonomo.
5. Criar token de liberacao.
6. Simular comando de liberacao.
7. Simular entrega confirmada ou falha.
8. Registrar estoque por volume/unidade.
9. Registrar alertas de maquina.
10. Criar painel AutoServe no SamBah Pay.
11. Criar documentacao `SAMBAH-PAY-AUTOSERVE.md`.
12. Criar testes automatizados dos fluxos principais.

## Fora do MVP

- Integracao fisica real com rele.
- MQTT real.
- ESP32 real.
- Balanca real.
- Sensor de fluxo real.
- TEF real.
- Pix automatico real.
- NFC-e/fiscal.

## Testes automatizados esperados

- Criar dispositivo com tipo e modo de controle validos.
- Vincular produto a dispositivo.
- Bloquear venda quando estoque do produto no dispositivo estiver esgotado.
- Criar sessao de autosservico.
- Criar checkout autonomo e pagamento.
- Impedir criacao de `release_token` para pagamento nao confirmado.
- Criar `release_token` para pagamento confirmado.
- Impedir reutilizacao de `release_token`.
- Impedir uso de `release_token` expirado.
- Registrar `release_attempt` em toda validacao, inicio, sucesso ou falha.
- Registrar `delivery_event` em entrega confirmada.
- Registrar `delivery_event`, `machine_alert` e `audit_log` em falha.
- Colocar pagamento confirmado sem entrega em `manual_review`.
- Permitir complemento ou estorno parcial em `partial_delivery`.
- Marcar dispositivo como `offline` quando heartbeat estiver vencido.
- Baixar estoque apos entrega confirmada.
- Sincronizar evento com `ErpAdapter` quando configurado.

## Criterios de aceite

- O painel AutoServe permite consultar sessoes, dispositivos, estoque, liberacoes e alertas.
- O fluxo completo funciona em modo simulado sem hardware real.
- Nenhuma liberacao ocorre sem pagamento confirmado e token valido.
- Token tem validade curta, uso unico e vinculo com pagamento, produto, dispositivo e sessao.
- Toda tentativa de liberacao fica auditavel.
- Falhas de maquina ficam visiveis para operacao.
- O desenho tecnico nao depende de ERP, TEF, Pix automatico, MQTT ou hardware especifico.

## SamBah Weight Control\n\nO AutoServe passa a contar com uma camada simulada de validacao por peso. A liberacao continua dependente de release_token; o Weight Control apenas registra leituras, valida divergencias e gera delivery_event, machine_alert, audit_log e revisao manual quando houver risco.\n\nEndpoints principais: /api/sambah-pay/weight/reading, /api/sambah-pay/weight/validate e simuladores de self-service, bebida, geladeira inteligente e pickup.\n
