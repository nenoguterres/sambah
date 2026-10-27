@echo off
setlocal
title Instalar SamBah Central

set "SAMBAH_INSTALLER=%TEMP%\install-sambah-workstation.ps1"
set "SAMBAH_SOURCE=https://raw.githubusercontent.com/nenoguterres/sambah/main/scripts/install-sambah-workstation.ps1"

echo Preparando o SamBah Central permanente...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%SAMBAH_SOURCE%' -OutFile '%SAMBAH_INSTALLER%'"
if errorlevel 1 goto :download_error

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SAMBAH_INSTALLER%"
if errorlevel 1 goto :install_error

echo.
echo SamBah instalado. A janela abrira automaticamente.
echo Entre uma vez e permita as notificacoes do Windows.
timeout /t 8 >nul
exit /b 0

:download_error
echo.
echo Nao foi possivel baixar o instalador. Confira a internet e tente novamente.
pause
exit /b 1

:install_error
echo.
echo O Windows nao concluiu a instalacao. Envie uma foto desta tela.
pause
exit /b 1
