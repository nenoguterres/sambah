@echo off
setlocal

set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"
set "APP_NAME=SamBah CRM"
set "LAUNCHER=%APP_DIR%\iniciar-sambah.bat"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\SamBah CRM.lnk"

echo Instalando atalho local do %APP_NAME%...

if not exist "%LAUNCHER%" (
  echo Nao encontrei o iniciador: %LAUNCHER%
  pause
  exit /b 1
)

if exist "C:\Program Files\nodejs\node.exe" (
  set "PATH=C:\Program Files\nodejs;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  echo Instale o Node.js LTS em https://nodejs.org/
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd nao encontrado.
  echo Reinstale o Node.js marcando a opcao de adicionar ao PATH.
  pause
  exit /b 1
)

cd /d "%APP_DIR%"
if not exist "node_modules" (
  echo Instalando dependencias do SamBah...
  call npm.cmd install
  if errorlevel 1 (
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut('%SHORTCUT%'); $s.TargetPath='%LAUNCHER%'; $s.WorkingDirectory='%APP_DIR%'; $s.IconLocation='C:\Windows\System32\shell32.dll,220'; $s.Description='Abrir SamBah CRM local'; $s.Save()"

echo Atalho criado em:
echo %SHORTCUT%
echo.
echo Para usar: de dois cliques em "SamBah CRM" na Area de Trabalho.
echo.
pause
endlocal
