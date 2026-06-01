# Agent 问题诊断脚本
# 用于排查配置写入和 SteamCMD 调用问题

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Arma3 Server Tools - Agent 诊断工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Agent 配置
Write-Host "1. 检查 Agent 配置文件" -ForegroundColor Yellow
$agentConfigPath = "$env:USERPROFILE\.cursor-arma3servertools\config\agent\settings.json"
if (Test-Path $agentConfigPath) {
    Write-Host "  [OK] 配置文件存在: $agentConfigPath" -ForegroundColor Green
    try {
        $config = Get-Content $agentConfigPath -Raw | ConvertFrom-Json
        Write-Host "  - HTTP 启用: $($config.http.enabled)" -ForegroundColor Gray
        Write-Host "  - 远程访问: $($config.http.remoteAccessEnabled)" -ForegroundColor Gray
        Write-Host "  - 监听地址: $($config.http.listenHost):$($config.http.listenPort)" -ForegroundColor Gray
        if ($config.steamCmd -and $config.steamCmd.mirrorOutputToConsole -ne $null) {
            Write-Host "  - SteamCMD 输出镜像: $($config.steamCmd.mirrorOutputToConsole)" -ForegroundColor Gray
        } else {
            Write-Host "  - SteamCMD 输出镜像: (未配置，默认 true)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  [WARN] 配置文件解析失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [INFO] 配置文件不存在" -ForegroundColor Yellow
    Write-Host "    Agent 首次启动时会自动创建" -ForegroundColor Gray
}

# 2. 检查服务器配置目录
Write-Host ""
Write-Host "2. 检查服务器配置目录" -ForegroundColor Yellow
$serverConfigDir = "$env:USERPROFILE\.cursor-arma3servertools\config"
if (Test-Path $serverConfigDir) {
    $configFiles = Get-ChildItem "$serverConfigDir\*.json" -ErrorAction SilentlyContinue
    Write-Host "  [OK] 配置目录存在，共 $($configFiles.Count) 个服务器配置文件" -ForegroundColor Green
    if ($configFiles.Count -gt 0) {
        foreach ($file in $configFiles | Select-Object -First 5) {
            Write-Host "    - $($file.Name)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  [ERROR] 配置目录不存在" -ForegroundColor Red
}

# 3. 检查 Agent 进程
Write-Host ""
Write-Host "3. 检查 Agent 进程" -ForegroundColor Yellow
$agentProcess = Get-Process | Where-Object { $_.ProcessName -like "*Arma3ServerTools.Agent*" }
if ($agentProcess) {
    Write-Host "  [OK] Agent 进程正在运行 (PID: $($agentProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  [INFO] Agent 进程未运行" -ForegroundColor Yellow
}

# 4. 检查 HTTP API 可用性
Write-Host ""
Write-Host "4. 检查 HTTP API" -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "http://127.0.0.1:19580/api/v1/health" -Method Get -TimeoutSec 3
    Write-Host "  [OK] API 可访问" -ForegroundColor Green
    Write-Host "    - 服务: $($healthResponse.service)" -ForegroundColor Gray
    Write-Host "    - 远程访问: $($healthResponse.remoteAccessEnabled)" -ForegroundColor Gray
} catch {
    Write-Host "  [ERROR] API 无法访问" -ForegroundColor Red
    Write-Host "    错误: $($_.Exception.Message)" -ForegroundColor Gray
    Write-Host "    请确认 Agent 已启动" -ForegroundColor Yellow
}

# 5. 检查常见问题
Write-Host ""
Write-Host "5. 常见问题检查" -ForegroundColor Yellow

## 5.1 检查 .NET 运行时
$dotnetVersion = dotnet --version 2>$null
if ($dotnetVersion) {
    Write-Host "  [OK] .NET SDK 已安装: $dotnetVersion" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] .NET SDK 未安装或不在 PATH 中" -ForegroundColor Red
}

## 5.2 检查防火墙（仅远程访问时）
if ((Test-Path $agentConfigPath)) {
    try {
        $config = Get-Content $agentConfigPath -Raw | ConvertFrom-Json
        if ($config.http.remoteAccessEnabled) {
            Write-Host "  [WARN] 远程访问已启用，请确认：" -ForegroundColor Yellow
            Write-Host "    1. 防火墙允许端口 $($config.http.listenPort)" -ForegroundColor Gray
            Write-Host "    2. IP 白名单已配置（allowedCallerIps）" -ForegroundColor Gray
            Write-Host "    3. 使用 HTTPS 或专线/VPN" -ForegroundColor Gray
        }
    } catch {}
}

# 6. 生成测试任务
Write-Host ""
Write-Host "6. 生成测试任务文件" -ForegroundColor Yellow
$testTaskPath = "test-write-cfg.json"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$testTask = @{
    taskId = "test-write-cfg-$timestamp"
    commands = @(
        @{ action = "status" }
        @{ action = "save" }
        @{ action = "write_cfg" }
    )
} | ConvertTo-Json -Depth 10

Set-Content -Path $testTaskPath -Value $testTask -Encoding UTF8
Write-Host "  [OK] 测试任务已生成: $testTaskPath" -ForegroundColor Green

# 7. SteamCMD 诊断
Write-Host ""
Write-Host "7. SteamCMD 配置检查" -ForegroundColor Yellow
$steamcmdPath = "$env:USERPROFILE\.cursor-arma3servertools\steamcmd\steamcmd.exe"
if (Test-Path $steamcmdPath) {
    Write-Host "  [OK] SteamCMD 已安装: $steamcmdPath" -ForegroundColor Green
} else {
    Write-Host "  [INFO] SteamCMD 未找到" -ForegroundColor Yellow
    Write-Host "    首次使用时工具会自动下载" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "诊断完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "更多信息请查看：docs/agent-troubleshooting.md" -ForegroundColor Cyan
