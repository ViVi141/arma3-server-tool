#Requires -Version 5.1
# Build Electron desktop app with bundled Node service (v2).

param(
    [switch] $SkipInstaller,

    [switch] $DirOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Invoke-Step {
    param(
        [string] $Name,
        [scriptblock] $Action
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Name (exit $LASTEXITCODE)"
    }
}

Write-Host "Arma3 Server Tools v2 — Electron desktop build" -ForegroundColor Green

Invoke-Step "TypeScript check" { npm run typecheck }
Invoke-Step "Run tests" { npm test }
Invoke-Step "Build service" { npm run build:service }
Invoke-Step "Build web (desktop base)" { npm -w @a3st/web run build -- --base ./ }
Invoke-Step "Build Electron main/preload" { npm -w @a3st/desktop run build }
Invoke-Step "Stage extraResources" { powershell -ExecutionPolicy Bypass -File scripts/stage-desktop.ps1 }

$BuilderArgs = @("--config", "electron-builder.yml")
if ($DirOnly) {
    $BuilderArgs += "--dir"
}
if ($SkipInstaller) {
    $BuilderArgs += "--dir"
}

Invoke-Step "electron-builder" {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    Push-Location (Join-Path $Root "apps\desktop")
    try {
        npx electron-builder @BuilderArgs
    }
    finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "Desktop build finished." -ForegroundColor Green
Write-Host "Output: $(Join-Path $Root 'artifacts\desktop')"
