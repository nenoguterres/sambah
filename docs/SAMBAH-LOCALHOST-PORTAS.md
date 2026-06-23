# SamBah Localhost e Portas

## Porta padrao

A porta operacional local padrao do ecossistema SamBah e:

- http://127.0.0.1:3000

Todas as rotas principais devem abrir na mesma instancia:

- /login
- /sambah-central
- /sambah-pay
- /sambah-autoserve
- /sambah-devices
- /sambah-voice-pay
- /sambah-locker

## Start limpo recomendado

Use o comando abaixo para encerrar uma instancia Node antiga que esteja ocupando a porta 3000 e subir a versao atual do projeto:

```powershell
npm run start:clean:3000
```

O script equivalente e:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-clean-3000.ps1
```

## Logs locais

O start limpo grava:

- server-out.log
- server-err.log

Depois de iniciar, `server-err.log` deve permanecer vazio. A saida esperada em `server-out.log` e semelhante a:

```text
samBah! admin em http://localhost:3000/admin
```

## Evitar duas versoes rodando

Antes de validar uma fase, confira as portas:

```powershell
Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue
```

Se a porta 3001 estiver ativa, ela deve ser tratada apenas como instancia temporaria de teste. A validacao final deve acontecer em `3000`.

## Escopo

Este documento nao habilita hardware real, sensor real, locker real, balanca real, i9ACAO real, WhatsApp real, Pix real, TEF real, ERP real ou MQTT real.
