#Requires -Version 5.1
# Mirrors .github/workflows/ci.yml for local pre-commit verification (v2 TypeScript monorepo).

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

Write-Host "Arma3 Server Tools v2 — local CI" -ForegroundColor Green

Invoke-Step "Install dependencies" { npm ci }
Invoke-Step "TypeScript check" { npm run typecheck }
Invoke-Step "Run tests" { npm test }
Invoke-Step "Build service" { npm run build:service }
Invoke-Step "Build web" { npm run build:web }

Write-Host ""
Write-Host "Local CI passed." -ForegroundColor Green
