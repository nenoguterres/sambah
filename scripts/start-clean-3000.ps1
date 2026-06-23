param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$OutLog = Join-Path $Root "server-out.log"
$ErrLog = Join-Path $Root "server-err.log"

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -match "node|npm") {
    Stop-Process -Id $listener.OwningProcess -Force
    Write-Output "Stopped process $($listener.OwningProcess) on port $Port"
  }
}

if (Test-Path $OutLog) { Clear-Content -Path $OutLog }
if (Test-Path $ErrLog) { Clear-Content -Path $ErrLog }

$env:PORT = [string]$Port
Start-Process `
  -FilePath "node" `
  -ArgumentList "src/server.js" `
  -WorkingDirectory $Root `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -WindowStyle Hidden

Start-Sleep -Seconds 2
$active = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $active) {
  Write-Error "SamBah server did not start on port $Port. Check server-err.log."
}

Write-Output "SamBah server running on http://127.0.0.1:$Port"
Write-Output "Logs: $OutLog / $ErrLog"
