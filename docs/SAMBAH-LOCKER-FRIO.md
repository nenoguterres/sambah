# SamBah Locker Frio

Implementacao simulada de locker frio com multiplas portas. O modelo usa 1 PIN para 1 sessao segura de retirada vinculada a um pagamento confirmado.

Regra central: 1 PIN -> 1 pedido pago -> varios itens -> varias zonas autorizadas.

Nao ha hardware, trava, sensor, QR, Pix, TEF, ERP ou i9ACAO real nesta fase.

## Validacao local consolidada

A rota visual canonica e:

```text
http://127.0.0.1:3000/sambah-locker
```

Fluxo demo validado:

- Bootstrap cria aproximadamente 40 zonas simuladas.
- Pedido demo cria 1 PIN para 2 produtos diferentes.
- PIN valida a sessao inteira.
- Abertura ocorre apenas nas zonas autorizadas.
- Retirada completa finaliza como completed.
- Retirada parcial finaliza como partial_pickup.
- Zona nao autorizada retorna zone_not_authorized.
- Retirada acima do autorizado marca extra_quantity_suspected e session fraud_suspected.
- Divergencia critica gera audit_log, machine_alert e evento futuro i9ACAO simulado.

## Integracao com Weight Control

O Locker pode usar /api/sambah-pay/weight/validate com pickup_session_id, pickup_item_id e zone_id para aplicar leitura simulada ao item:

- weight_ok marca picked_up.
- weight_missing marca not_picked_up.
- weight_fraud_suspected ou excesso marca extra_quantity_suspected.
- Divergencia critica coloca a sessao em fraud_suspected e prepara machine_alert, audit_log e i9ACAO futuro.

O painel /sambah-weight permite simular validacao de peso por zona sem acionar balanca ou hardware real.
