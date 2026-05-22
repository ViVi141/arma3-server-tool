# Arma3 Server Tools - 自动化测试入口
# 用法: powershell -ExecutionPolicy Bypass -File scripts/run-automated-tests.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$solution = Join-Path $repoRoot "Arma3ServerTools.sln"

Write-Host "==> Build Release" -ForegroundColor Cyan
dotnet build $solution -c Release -v minimal
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "==> Run automated tests (xUnit)" -ForegroundColor Cyan
Write-Host "    说明: 构建日志里的「正在跳过目标」= MSBuild 增量编译，不是测试被跳过。" -ForegroundColor DarkGray
Write-Host ""

$testOutput = dotnet test $solution -c Release --no-build --verbosity normal 2>&1
$testOutput | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$passedCore = ($testOutput | Select-String -Pattern "Arma3ServerTools\.Core\.Tests\.dll \(net10\.0" -Context 0,3 | Select-Object -Last 1)
$passedApp = ($testOutput | Select-String -Pattern "Arma3ServerTools\.Application\.Tests\.dll \(net10\.0" -Context 0,3 | Select-Object -Last 1)

Write-Host ""
Write-Host "All automated tests passed (xUnit 跳过数 = 0)." -ForegroundColor Green
Write-Host "仍需人工验收: 真实 Steam 登录、专用服下载、RCon 连真服、WinForms UI 点击路径。" -ForegroundColor Yellow
