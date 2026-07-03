# SamBah Painel Operacional Consolidado

Esta fase consolida a SamBah Central como painel operacional unico para os blocos simulados do ecossistema.

## Escopo

- Missao operacional com estado, alertas, eventos i9ACAO e validacoes de peso.
- Cards para Pay, Voice Pay, AutoServe, Devices, Locker Frio, Weight Control, auditoria, permissoes e contratos futuros.
- Alertas criticos recentes.
- Auditoria recente.
- Fluxo demo guiado: pagamento mock, Secure Pickup Locker, PIN, abertura de zonas, validacao de peso e auditoria.
- Permissoes visuais por perfil.

## Perfis

- ADMIN: bootstrap, demo guiado, operacao e auditoria.
- CAIXA: demo guiado e operacao.
- OPERADOR: demo guiado e operacao.
- AUDITOR: consulta e auditoria.
- ATENDENTE: sem acoes operacionais criticas no painel.

## Fluxo Demo Guiado

O botao Executar demo guiado chama apenas endpoints simulados:

1. /api/sambah-pay/locker/bootstrap
2. /api/sambah-pay/payments
3. /api/sambah-pay/secure-pickup/create
4. /api/sambah-pay/secure-pickup/validate-pin
5. /api/sambah-pay/secure-pickup/open-authorized-zones
6. /api/sambah-pay/weight/validate

## Regras

Nenhuma integracao real foi ativada. Pix, TEF, ERP, WhatsApp real, IA externa, MQTT, hardware, balanca, locker, sensor e i9ACAO real seguem desativados.
