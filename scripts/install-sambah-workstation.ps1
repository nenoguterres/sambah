param(
  [switch]$Watch,
  [switch]$Uninstall,
  [string]$Url = "https://api.insanofoodtruck.com.br/conversas"
)

$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "SamBahCentral"
$installedScript = Join-Path $installRoot "SamBahWorkstation.ps1"
$profileDir = Join-Path $installRoot "BrowserProfile"
$logFile = Join-Path $installRoot "watchdog.log"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "SamBah Central.lnk"

function Find-Browser {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
  )
  return $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

function Write-WatchdogLog([string]$Message) {
  if (-not (Test-Path -LiteralPath $installRoot)) { New-Item -ItemType Directory -Path $installRoot -Force | Out-Null }
  Add-Content -LiteralPath $logFile -Value ("{0:o} {1}" -f (Get-Date), $Message) -Encoding utf8
}

if ($Uninstall) {
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$installedScript*" -and $_.CommandLine -like "*-Watch*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath -Force }
  if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
  Write-Output "SamBah removido da inicializacao automatica."
  exit 0
}

if ($Watch) {
  $mutex = [Threading.Mutex]::new($false, "Local\SamBahCentralWorkstation")
  if (-not $mutex.WaitOne(0, $false)) { exit 0 }
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SamBahPower {
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern uint SetThreadExecutionState(uint flags);
}
"@
  $browser = Find-Browser
  if (-not $browser) {
    Write-WatchdogLog "Chrome ou Edge nao encontrado."
    exit 1
  }
  New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
  $processName = [IO.Path]::GetFileName($browser)
  $profilePattern = [Regex]::Escape($profileDir)
  Write-WatchdogLog "Monitor permanente iniciado com $processName."
  try {
    while ($true) {
      [void][SamBahPower]::SetThreadExecutionState(0x80000003)
      $running = Get-CimInstance Win32_Process -Filter "Name = '$processName'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match $profilePattern } |
        Select-Object -First 1
      if (-not $running) {
        $arguments = @(
          "--app=$Url",
          "--start-maximized",
          "--no-first-run",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-background-timer-throttling",
          "--user-data-dir=`"$profileDir`""
        )
        Start-Process -FilePath $browser -ArgumentList $arguments | Out-Null
        Write-WatchdogLog "Janela do SamBah aberta ou recuperada."
      }
      Start-Sleep -Seconds 20
    }
  } finally {
    [void][SamBahPower]::SetThreadExecutionState(0x80000000)
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
}

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
if ($PSCommandPath -ne $installedScript) {
  Copy-Item -LiteralPath $PSCommandPath -Destination $installedScript -Force
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$installedScript`" -Watch -Url `"$Url`""
$shortcut.WorkingDirectory = $installRoot
$shortcut.Description = "Mantem o SamBah Central aberto no computador"
$shortcut.Save()

Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-WindowStyle", "Hidden",
  "-File", "`"$installedScript`"",
  "-Watch",
  "-Url", "`"$Url`""
) | Out-Null

Write-Output "SamBah configurado para iniciar com o Windows e reabrir automaticamente."
Write-Output "Na primeira janela, entre uma vez e permita as notificacoes."
