$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
$version = [string]$package.version
$distDir = Join-Path $projectRoot "dist"
$stageDir = Join-Path $distDir ("sambah-" + $version)
$zipPath = Join-Path $distDir ("sambah-" + $version + ".zip")

if (-not (Test-Path -LiteralPath $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
if (Test-Path -LiteralPath $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Path $stageDir | Out-Null

$trackedFiles = git -C $projectRoot ls-files --cached --others --exclude-standard
foreach ($relative in $trackedFiles) {
  $source = Join-Path $projectRoot $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }
  $target = Join-Path $stageDir $relative
  $targetParent = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $targetParent)) { New-Item -ItemType Directory -Path $targetParent -Force | Out-Null }
  Copy-Item -LiteralPath $source -Destination $target -Force
}

Compress-Archive -LiteralPath $stageDir -DestinationPath $zipPath -CompressionLevel Optimal
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
