# Producao SamBah

Checklist minimo antes de publicar o SamBah para operacao real sem derrubar o site atual.

## Arquitetura definida
- Site publico atual: `https://insanofoodtruck.com.br`.
- API SamBah recomendada: `https://api.insanofoodtruck.com.br`.
- API alternativa: `https://api.sambahcrm.com.br`.
- O dominio principal continua sendo vitrine publica; o SamBah entra como motor de CRM, atendimento, oportunidades e WhatsApp.

## Dominio
- Manter `https://insanofoodtruck.com.br` como site principal.
- Criar subdominio recomendado `api.insanofoodtruck.com.br` para o SamBah.
- Manter `api.sambahcrm.com.br` como alternativa tecnica, se necessario.

## DNS
- Criar registro `A` ou `CNAME` para `api.insanofoodtruck.com.br` apontando para o servidor SamBah.
- Se usar alternativa, criar/apontar `api.sambahcrm.com.br` para o mesmo servidor.
- Validar propagacao DNS antes de colar os blocos no site real.

## SSL
- Instalar certificado TLS valido para `api.insanofoodtruck.com.br`.
- Se usar alternativa, instalar certificado para `api.sambahcrm.com.br`.
- Forcar HTTPS no proxy reverso.
- Renovacao automatica obrigatoria.

## Node em producao
- Usar Node LTS em servidor dedicado, VPS ou container.
- Rodar com `NODE_ENV=production`.
- Configurar `.env` real a partir de `.env.example`.
- Usar `BASE_URL=https://api.insanofoodtruck.com.br`.
- Usar `PUBLIC_BASE_URL=https://insanofoodtruck.com.br`.
- Expor somente HTTPS publico via proxy.

## PM2 ou servico equivalente
- Rodar `node src/server.js` via PM2, systemd, Docker ou servico equivalente.
- Habilitar restart automatico.
- Persistir variaveis de ambiente no gerenciador escolhido.

## Banco persistente futuro
- Hoje os dados ficam em arquivos JSON em `DATA_DIR`.
- Para producao longa, planejar migracao para banco persistente.
- Antes da migracao, garantir volume/disco persistente para `DATA_DIR`.

## Logs
- Coletar stdout/stderr do processo Node.
- Preservar logs de auditoria em `DATA_DIR`.
- Criar rotina de rotacao para evitar crescimento ilimitado.

## Restart automatico
- Reiniciar em falha do processo.
- Reiniciar em reboot do servidor.
- Monitorar `/health` apos cada restart.

## Backup automatico
- Automatizar backup do `DATA_DIR`.
- Guardar copias fora do servidor.
- Testar restauracao periodicamente.
- Nao depender de backup manual.

## Integracao Wix/site real
- No site atual, colar blocos via HTML Embed.
- Usar `const BASE_API = "https://api.insanofoodtruck.com.br";`.
- Alternativa: `const BASE_API = "https://api.sambahcrm.com.br";`.
- Confirmar CORS para `https://insanofoodtruck.com.br`, `https://www.insanofoodtruck.com.br`, `https://api.insanofoodtruck.com.br` e `https://api.sambahcrm.com.br`.
- Testar lead, pedido, food truck, evento corporativo, Xeriffe e WhatsApp no site publicado.

## Health check
- Validar `GET /health` em `https://api.insanofoodtruck.com.br/health`.
- Resposta esperada: `{ "ok": true, "service": "sambha-automacao-whats" }`.
