#Requires -Version 5.1
# Start @a3st/service, run Playwright E2E against packages/web, then stop Service.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$dataDir = Join-Path $Root ".a3st-e2e-data"
$serviceEntry = Join-Path $Root "packages\service\dist\index.js"

if (-not (Test-Path $serviceEntry)) {
    throw "Service not built. Run: npm run build:service"
}

if (Test-Path $dataDir) {
    Remove-Item -Recurse -Force $dataDir
}
New-Item -ItemType Directory -Path $dataDir | Out-Null

Write-Host ""
Write-Host "==> Start Service for E2E" -ForegroundColor Cyan

$env:DATA_DIR = $dataDir
$env:PORT = "19580"
$env:HOST = "127.0.0.1"

$serviceJob = Start-Job -ScriptBlock {
    param($Entry, $DataDir, $Port, $HostAddr)
    $env:DATA_DIR = $DataDir
    $env:PORT = $Port
    $env:HOST = $HostAddr
    & node $Entry 2>&1
} -ArgumentList $serviceEntry, $dataDir, "19580", "127.0.0.1"

function Wait-ForHealth {
    param([int] $MaxSeconds = 30)
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:19580/api/v1/health" -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -eq 200) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

if (-not (Wait-ForHealth)) {
    Receive-Job $serviceJob -ErrorAction SilentlyContinue | Write-Host
    Stop-Job $serviceJob -ErrorAction SilentlyContinue
    Remove-Job $serviceJob -Force -ErrorAction SilentlyContinue
    throw "Service did not become healthy on http://127.0.0.1:19580"
}

Write-Host "Service ready (DATA_DIR=$dataDir)" -ForegroundColor DarkGray

try {
    Write-Host ""
    Write-Host "==> Install Playwright browser (chromium)" -ForegroundColor Cyan
    Push-Location (Join-Path $Root "packages\web")
    npx playwright install chromium
    if ($LASTEXITCODE -ne 0) {
        throw "playwright install failed (exit $LASTEXITCODE)"
    }

    Write-Host ""
    Write-Host "==> Run Playwright E2E" -ForegroundColor Cyan
    npx playwright test
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright tests failed (exit $LASTEXITCODE)"
    }
} finally {
    Write-Host ""
    Write-Host "==> Stop Service" -ForegroundColor Cyan
    Stop-Job $serviceJob -ErrorAction SilentlyContinue
    Remove-Job $serviceJob -Force -ErrorAction SilentlyContinue
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and ($_.CommandLine -like "*packages*service*dist*index.js*")
    } | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "E2E passed." -ForegroundColor Green
