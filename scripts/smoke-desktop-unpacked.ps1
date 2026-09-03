#Requires -Version 5.1
# Smoke-test unpacked Electron desktop build (simulates post-install on a clean machine).
# Prerequisite: npm run pack:desktop:dir

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ArtifactsRoot = Join-Path $Root "artifacts\desktop"
$WinUnpacked = Join-Path $ArtifactsRoot "win-unpacked"
$ExeName = "Arma3 Server Tools.exe"
$ExePath = Join-Path $WinUnpacked $ExeName
$ServiceEntryInResources = Join-Path $WinUnpacked "resources\service\dist\index.js"
$WebIndexInResources = Join-Path $WinUnpacked "resources\web\index.html"
$HealthUrl = "http://127.0.0.1:19580/api/v1/health"
$TimeoutSec = 45

function Assert-PathExists {
    param(
        [string] $Path,
        [string] $Label
    )
    if (-not (Test-Path $Path)) {
        throw "Missing $Label`: $Path"
    }
    Write-Host "  OK  $Label" -ForegroundColor DarkGreen
}

Write-Host "Arma3 Server Tools — Electron unpacked smoke" -ForegroundColor Green
Write-Host ""

Write-Host "==> Artifact layout" -ForegroundColor Cyan
Assert-PathExists -Path $WinUnpacked -Label "win-unpacked directory"
Assert-PathExists -Path $ExePath -Label "main executable"
Assert-PathExists -Path $ServiceEntryInResources -Label "bundled service entry"
Assert-PathExists -Path $WebIndexInResources -Label "bundled web index"

$preloadBuilt = Join-Path $Root "apps\desktop\dist-electron\preload.cjs"
if (Test-Path $preloadBuilt) {
    $preloadHead = Get-Content -Path $preloadBuilt -TotalCount 3 -Raw
    if ($preloadHead -match "^\s*import\s") {
        throw "preload.cjs still looks like ESM (starts with import). Electron will not inject electronAPI."
    }
    Write-Host "  OK  built preload.cjs is CJS" -ForegroundColor DarkGray
} else {
    Write-Host "  WARN apps/desktop/dist-electron/preload.cjs missing (run desktop build before pack)" -ForegroundColor Yellow
}

$serviceNodeModules = Join-Path $WinUnpacked "resources\service\node_modules\fastify"
Assert-PathExists -Path $serviceNodeModules -Label "service production node_modules (fastify)"

Write-Host ""
Write-Host "==> Launch packaged app" -ForegroundColor Cyan

$existing = Get-Process -Name "Arma3 Server Tools" -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping existing Arma3 Server Tools process(es) ..."
    $existing | Stop-Process -Force
    Start-Sleep -Seconds 2
}

$appProcess = Start-Process -FilePath $ExePath -WorkingDirectory $WinUnpacked -PassThru
Write-Host "Started PID $($appProcess.Id): $ExePath"

function Wait-ForHealth {
    param([int] $MaxSeconds)
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($appProcess.HasExited) {
            throw "App exited early with code $($appProcess.ExitCode)"
        }
        try {
            $resp = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 3
            if ($resp.success -eq $true) {
                return $resp
            }
        } catch {
            Start-Sleep -Milliseconds 800
        }
    }
    throw "Service did not respond at $HealthUrl within ${MaxSeconds}s"
}

try {
    Write-Host ""
    Write-Host "==> Wait for embedded @a3st/service" -ForegroundColor Cyan
    $health = Wait-ForHealth -MaxSeconds $TimeoutSec
    Write-Host "  OK  health: $($health.service) v$($health.version)" -ForegroundColor DarkGreen

    Write-Host ""
    Write-Host "==> API probe" -ForegroundColor Cyan
    $servers = Invoke-RestMethod -Uri "http://127.0.0.1:19580/api/v1/servers" -TimeoutSec 5
    Write-Host "  OK  GET /servers returned (count=$($servers.Count))" -ForegroundColor DarkGreen

    $actions = Invoke-RestMethod -Uri "http://127.0.0.1:19580/api/v1/actions" -TimeoutSec 5
    if (-not $actions.success) {
        throw "GET /actions failed"
    }
    Write-Host "  OK  GET /actions taskActions=$($actions.data.taskActions.Count)" -ForegroundColor DarkGreen

    Write-Host ""
    Write-Host "Smoke passed. App is running (PID $($appProcess.Id))." -ForegroundColor Green
    Write-Host "Manual UI check: connect 本机 -> 首服向导 -> 被控设置" -ForegroundColor Yellow
    Write-Host "Stop app from system tray -> Exit, or: Stop-Process -Id $($appProcess.Id)" -ForegroundColor DarkGray
} catch {
    if (-not $appProcess.HasExited) {
        Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
    }
    throw
}
