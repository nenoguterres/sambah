@echo off
setlocal

cd /d "%~dp0"

if exist "C:\Program Files\nodejs\node.exe" (
  set "PATH=C:\Program Files\nodejs;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado no PATH.
  echo Instale o Node.js LTS em https://nodejs.org/
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd nao encontrado no PATH.
  echo Reinstale o Node.js marcando a opcao de adicionar ao PATH.
  pause
  exit /b 1
)

if not exist package-lock.json (
  echo Instalando dependencias...
  call npm.cmd install
  if errorlevel 1 (
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

echo Iniciando samBah! em http://127.0.0.1:3000/admin
start "" "http://127.0.0.1:3000/admin"
npm.cmd start

endlocal
