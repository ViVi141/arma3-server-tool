# Arma3 Server Tools — 架构说明

> 当前主线：**.NET 10** · WinForms + Application 服务层 · 可选 **Agent.Host**（Kestrel）

## 解决方案

| 项目 | 路径 | 说明 |
|------|------|------|
| **Arma3ServerTools.Core** | `src/Arma3ServerTools.Core/` | 领域层（`net10.0-windows`），无 UI |
| **Arma3ServerTools.Application** | `src/Arma3ServerTools.Application/` | 应用服务（进程、配置、SteamCMD、RCon、自动化等） |
| **Arma3ServerTools.App.WinForms** | `src/Arma3ServerTools.App.WinForms/` | 主程序 → `Arma3ServerTools.exe` |
| **Arma3ServerTools.MonitoringHost** | `src/Arma3ServerTools.MonitoringHost/` | WM_COPYDATA 监控宿主 |
| **Arma3ServerTools.Agent.Host** | `src/Arma3ServerTools.Agent.Host/` | HTTP 自动化 API（`agent/` 随安装包部署） |
| **\*.Tests** | `tests/` | Core / Application 单元测试 |

旧 DevExpress 工程已移除；历史改造说明见 [archive/refactoring-plan.md](archive/refactoring-plan.md)。

## Core

```
Arma3ServerTools.Core/
├── BattlEye/          # RCon V2 协议与命令
├── Models/            # ArmaServerConfig 等
├── Config/            # GameConfigWriter（写 server.cfg 等）
├── Repositories/      # JSON / SQLite 持久化
└── ToolConstants.cs   # a3st_* 命名约定
```

## Application

```
Arma3ServerTools.Application/
├── Services/          # ServerConfig、Process、SteamCMD、RCon、模组、封禁…
├── Automation/        # ServerAutomationService、Agent API 目录
├── Monitoring/        # SQLite 统计入库
├── ProcessManagement/ # IProcessRunner
└── DependencyInjection/
```

WinForms 与 Agent **共用**同一套 Application 服务（通过 `AddArma3ServerToolsApplication` 注册）。

## 运行时进程

| 进程 | 说明 |
|------|------|
| `Arma3ServerTools.exe` | 主 GUI；启动时拉起 MonitoringHost |
| `Arma3ServerTools.MonitoringHost.exe` | 固定窗口标题，供 Monitoring DLL 通信 |
| `Arma3ServerTools.Agent.Host.exe` | 可选；HTTP :19580，与 GUI 勿同时抢同一服启停 |
| `arma3server_x64.exe` | 由工具配置与启动参数拉起 |

## 依赖规则

- **Core**：不引用 WinForms / ASP.NET。
- **Application**：只引用 Core。
- **WinForms / Agent / MonitoringHost**：引用 Application + Core。

用户数据路径由 `IAppPaths` 解析（安装目录可写则用安装目录，否则 `%LocalAppData%\Arma3ServerTools\`）。

## 测试

```powershell
dotnet test Arma3ServerTools.sln -c Release
```

## 相关文档

- [README.md](README.md) — 文档索引  
- [agent-capabilities.md](agent-capabilities.md) — Agent 能力  
- [openclaw-integration.md](openclaw-integration.md) — OpenClaw 集成  
