# Arma3 Server Tools — 架构说明

> 随改造进度更新。详见 [refactoring-plan.md](refactoring-plan.md)。

## 解决方案

| 项目 | 路径 | 说明 |
|------|------|------|
| **Arma3ServerTools.Core** | `src/Arma3ServerTools.Core/` | 领域层（net48），无 UI 依赖 |
| **Arma3ServerTools.Application** | `src/Arma3ServerTools.Application/` | 应用服务层（net48） |
| **Arma3ServerTools.App.WinForms** | `src/Arma3ServerTools.App.WinForms/` | WinForms 主程序（输出 `Arma3ServerTools.exe`） |
| **Arma3ServerTools.MonitoringHost** | `src/Arma3ServerTools.MonitoringHost/` | WM_COPYDATA 监控宿主（独立进程） |
| **Arma3ServerTools.Core.Tests** | `tests/Arma3ServerTools.Core.Tests/` | Core 单元测试 |
| **Arma3ServerTools.Application.Tests** | `tests/Arma3ServerTools.Application.Tests/` | Application 单元测试 |

旧工程 `a3/` 仍由 `a3.sln` 构建，逐步迁移至本解决方案。

## Core 模块

```
Arma3ServerTools.Core/
├── BattlEye/              # BattlEye RCon V2（BytexDigital.BattlEye.Rcon）
├── Models/                # 服务器配置与实体
├── Config/                # GameConfigWriter
├── Repositories/          # ServerConfigRepository
├── IO/JsonSerializer
└── ...
```

## Application 模块

```
Arma3ServerTools.Application/
├── Services/
│   ├── ServerConfigService
│   ├── ServerProcessService
│   ├── RconService
│   ├── SchedulerService
│   ├── SteamCmdService
│   └── MonitoringIngestService
├── ProcessManagement/     # IProcessRunner（可注入/mock）
├── Monitoring/            # MonitoringDatabase（SQLite）
└── Scheduling/            # ServerRestartManagementJob
```

## UI 层（阶段 3）

```
Arma3ServerTools.App.WinForms/     → Arma3ServerTools.exe
├── MainForm                       # 服务器列表、基本设置、启停
├── Controls/BasicSettingsPanel
└── AppServices                    # 组装 Application 服务

Arma3ServerTools.MonitoringHost/   → Arma3ServerTools.MonitoringHost.exe
└── 窗口标题 A3-DestinyStudio-ProcessCommunicationModule（供 DestinyServerMonitoring.dll 查找）
```

主程序启动时会拉起 `MonitoringHost.exe`；构建后两者位于同一输出目录。

阶段 4 起，右侧为 **TabControl** 多页设置：基本、网络、安全、性能、日志、难度、模组、定时、RCon、封禁。

## 依赖规则

- **Core**：不得引用 WinForms / DevExpress / ASP.NET。
- **Application**：引用 Core；不得引用 WinForms / DevExpress。
- **App.WinForms / MonitoringHost**：引用 Application + Core；不得引用 DevExpress。
- 配置路径由 `IAppPaths` 注入；统计库脚本位于 `{ApplicationBase}/sql/destiny_statistics.sql`。

## 测试

```text
dotnet test Arma3ServerTools.sln -c Release
```

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-22 | 初版：Core 骨架 |
| 2026-05-22 | 增加 Application 层与 14 项单元测试 |
| 2026-05-22 | 阶段 4：多设置页 Tab、RCon/封禁/Cron UI |
