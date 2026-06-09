# Configuracao de Producao - samBah!

Este documento prepara a configuracao de producao sem alterar regra de negocio.

## Arquivos

- `.env.example`: modelo das variaveis de ambiente.
- `package.json`: scripts de execucao e teste.
- `src/server.js`: le `PORT`.
- `src/mesaIntegrationService.js`: le variaveis `MESA_*`.
- `src/menuSyncService.js`: le `MESA_MENU_PATH`.

## Variaveis de ambiente

### `NODE_ENV`

Valor recomendado:

```text
production
```

Nesta versao, o codigo ainda nao muda comportamento por `NODE_ENV`, mas a variavel deve ser definida pelo servico de producao para padronizar logs, processos e futuras validacoes.

### `PORT`

Porta HTTP do samBah!.

Default interno:

```text
3000
```

Exemplo:

```text
PORT=3000
```

### `MESA_BASE_URL`

Endereco base do Mesa do Xeriffe visto pelo servidor samBah!.

Default interno:

```text
http://127.0.0.1:4173
```

Em producao, trocar pelo endereco real do Mesa no ambiente-alvo, por exemplo um IP de rede local, DNS interno ou URL publicada.

### `MESA_ORDER_PATH`

Endpoint do Mesa para receber pedidos externos.

Default interno:

```text
/api/orders/external
```

### `MESA_MENU_PATH`

Endpoint do Mesa para sincronizar cardapio.

Default interno:

```text
/api/menu
```

### `MESA_HEALTH_PATH`

Endpoint do Mesa para checagem de saude.

Default interno:

```text
/health
```

### `MESA_TIMEOUT_MS`

Tempo maximo, em milissegundos, para chamadas ao Mesa.

Default interno:

```text
1500
```

Para producao, o valor deve ser validado com a rede real. Um timeout muito baixo pode gerar fila pendente desnecessaria; um timeout muito alto pode atrasar o atendimento.

## Como configurar no Windows

O arquivo `.env.example` e apenas modelo. Como o codigo atual nao carrega `.env` automaticamente, as variaveis precisam ser definidas pelo ambiente antes de iniciar o processo.

Exemplo em PowerShell para uma sessao:

```powershell
$env:NODE_ENV = "production"
$env:PORT = "3000"
$env:MESA_BASE_URL = "http://127.0.0.1:4173"
$env:MESA_ORDER_PATH = "/api/orders/external"
$env:MESA_MENU_PATH = "/api/menu"
$env:MESA_HEALTH_PATH = "/health"
$env:MESA_TIMEOUT_MS = "1500"
npm.cmd run start:prod
```

Exemplo em `cmd.exe` para uma sessao:

```bat
set NODE_ENV=production
set PORT=3000
set MESA_BASE_URL=http://127.0.0.1:4173
set MESA_ORDER_PATH=/api/orders/external
set MESA_MENU_PATH=/api/menu
set MESA_HEALTH_PATH=/health
set MESA_TIMEOUT_MS=1500
npm.cmd run start:prod
```

Em servico Windows, essas variaveis devem ser configuradas no proprio servico, no wrapper escolhido ou no ambiente do usuario/maquina.

## Scripts

### Desenvolvimento/local

```powershell
npm.cmd start
npm.cmd test
```

### Producao

```powershell
npm.cmd run start:prod
npm.cmd run test:prod
```

Os scripts `start:prod` e `test:prod` definem `NODE_ENV=production` antes de executar o mesmo servidor/testes atuais. Eles nao alteram regra de negocio.

## Validacao antes de subir

1. Definir variaveis de ambiente.
2. Rodar:

```powershell
npm.cmd run test:prod
```

3. Iniciar:

```powershell
npm.cmd run start:prod
```

4. Validar:

```text
GET /health
GET /admin
GET /admin/mesa/status
GET /admin/menu/status
```

## Observacoes importantes

- `/admin` ainda nao tem autenticacao nesta etapa.
- Webhooks ainda precisam de protecao antes de exposicao publica.
- Persistencia segue em arquivos JSON locais em `data/`.
- O Mesa do Xeriffe continua sendo a fonte oficial de cardapio e execucao de pedidos.
- Esta etapa nao altera `src` nem implementa autenticacao.
