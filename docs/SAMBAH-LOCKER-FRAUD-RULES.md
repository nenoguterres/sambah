# SamBah Locker Fraud Rules

- PIN errado registra secure_pickup_attempt.
- Maximo de tentativas bloqueia sessao.
- Zona fora da lista gera wrong_zone_attempt.
- Peso zero marca not_picked_up.
- Peso acima da tolerancia marca extra_quantity_suspected.
- Divergencia critica gera machine_alert, audit_log e evento futuro i9ACAO.
