#Requires -Version 5.1
# Zip win-unpacked for transfer to a clean Windows machine.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root "artifacts\desktop\win-unpacked"
$OutDir = Join-Path $Root "artifacts\desktop"
$Stamp = Get-Date -Format "yyyyMMdd-HHmm"
$ZipPath = Join-Path $OutDir "Arma3ServerTools-win-unpacked-$Stamp.zip"

if (-not (Test-Path (Join-Path $Source "Arma3 Server Tools.exe"))) {
    throw "Missing unpacked build. Run: npm run pack:desktop:dir"
}

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}

Write-Host "Creating $ZipPath ..."
Compress-Archive -Path (Join-Path $Source "*") -DestinationPath $ZipPath -CompressionLevel Optimal
$sizeMb = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "Done ($sizeMb MB). Copy to clean machine, unzip to English path, run 'Arma3 Server Tools.exe'." -ForegroundColor Green
