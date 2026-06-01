Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Agent Diagnostics" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Agent config
Write-Host "1. Agent Config" -ForegroundColor Yellow
$agentConfigPath = "$env:USERPROFILE\.cursor-arma3servertools\config\agent\settings.json"
if (Test-Path $agentConfigPath) {
    Write-Host "  [OK] Config exists: $agentConfigPath" -ForegroundColor Green
    $config = Get-Content $agentConfigPath -Raw | ConvertFrom-Json
    Write-Host "  - HTTP enabled: $($config.http.enabled)" -ForegroundColor Gray
    Write-Host "  - Listen: $($config.http.listenHost):$($config.http.listenPort)" -ForegroundColor Gray
} else {
    Write-Host "  [INFO] Config file not found" -ForegroundColor Yellow
}

# Check server configs
Write-Host ""
Write-Host "2. Server Configs" -ForegroundColor Yellow
$serverConfigDir = "$env:USERPROFILE\.cursor-arma3servertools\config"
if (Test-Path $serverConfigDir) {
    $configFiles = Get-ChildItem "$serverConfigDir\*.json" -ErrorAction SilentlyContinue
    Write-Host "  [OK] Found $($configFiles.Count) server configs" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Config directory not found" -ForegroundColor Red
}

# Check Agent process
Write-Host ""
Write-Host "3. Agent Process" -ForegroundColor Yellow
$agentProcess = Get-Process | Where-Object { $_.ProcessName -like "*Arma3ServerTools.Agent*" }
if ($agentProcess) {
    Write-Host "  [OK] Agent running (PID: $($agentProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  [INFO] Agent not running" -ForegroundColor Yellow
}

# Check HTTP API
Write-Host ""
Write-Host "4. HTTP API" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:19580/api/v1/health" -Method Get -TimeoutSec 3
    Write-Host "  [OK] API accessible" -ForegroundColor Green
    Write-Host "    Service: $($health.service)" -ForegroundColor Gray
} catch {
    Write-Host "  [ERROR] API not accessible" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# Check .NET
Write-Host ""
Write-Host "5. .NET Runtime" -ForegroundColor Yellow
$dotnetVersion = dotnet --version 2>$null
if ($dotnetVersion) {
    Write-Host "  [OK] .NET SDK: $dotnetVersion" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] .NET SDK not found" -ForegroundColor Red
}

# Generate test task
Write-Host ""
Write-Host "6. Generate Test Task" -ForegroundColor Yellow
$testTaskPath = "test-agent-task.json"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$testTask = @{
    taskId = "test-$timestamp"
    commands = @(
        @{ action = "status" }
        @{ action = "save" }
        @{ action = "write_cfg" }
    )
} | ConvertTo-Json -Depth 10

Set-Content -Path $testTaskPath -Value $testTask -Encoding UTF8
Write-Host "  [OK] Test task created: $testTaskPath" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Diagnostics Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
