$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
$version = [string]$package.version
$distDir = Join-Path $projectRoot "dist"
$zipPath = Join-Path $distDir ("sambah-" + $version + ".zip")

if (-not (Test-Path -LiteralPath $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

git -C $projectRoot archive --format=zip --output=$zipPath HEAD
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $zipPath)) { throw "Falha ao gerar pacote Git da release." }
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = [ordered]@{
  version = $version
  channel = "stable"
  package = (Split-Path -Leaf $zipPath)
  sha256 = $hash
  publishedAt = (Get-Date).ToUniversalTime().ToString("o")
  updateMode = "web-reload"
  notes = @(
    "Fila operacional separada do historico",
    "Ciclo completo de atendimento",
    "Formulario de evento compartilhado",
    "Atualizacao centralizada dos atendimentos"
  )
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $distDir "release-manifest.json") -Encoding utf8
Write-Output ("PACKAGE=" + $zipPath)
Write-Output ("SHA256=" + $hash)
