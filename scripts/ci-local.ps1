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

$forceInstall = $env:A3ST_FORCE_NPM_CI -eq "1"
$hasNodeModules = Test-Path (Join-Path $Root "node_modules\typescript\package.json")
if ($forceInstall -or -not $hasNodeModules) {
    Invoke-Step "Install dependencies" { npm ci }
} else {
    Write-Host ""
    Write-Host "==> Install dependencies (skipped, node_modules present; set A3ST_FORCE_NPM_CI=1 to reinstall)" -ForegroundColor DarkGray
}
Invoke-Step "TypeScript check" { npm run typecheck }
Invoke-Step "Run tests" { npm test }
Invoke-Step "Build service" { npm run build:service }
Invoke-Step "Build web" { npm run build:web }

if ($env:A3ST_SKIP_E2E -ne "1") {
    Invoke-Step "E2E web (Playwright)" { powershell -ExecutionPolicy Bypass -File scripts/ci-e2e.ps1 }
} else {
    Write-Host ""
    Write-Host "==> E2E web (skipped, A3ST_SKIP_E2E=1)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Local CI passed." -ForegroundColor Green
