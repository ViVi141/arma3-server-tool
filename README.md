# 武装突袭3 DESTINY开服工具源码

#### 介绍
新的使用C#开发ARMA3开服工具，集成基本的开服必备功能，BE RCON，服务器管理，统计等。

#### 有兴趣的大佬可以基于本项目进行二次开发，但要求你保留原作者信息。

#### 项目主页
1.  本项目有一段时间了(学习C#时做的学习项目)
2.  https://destiny.cool/s/arma3-tool

#### 开发者
1.  Blue
2.  七龙


#### 构建（新架构）

需要 **[.NET 10 SDK](https://dotnet.microsoft.com/download)** 与 **Windows Desktop Runtime 10**（框架依赖发布时）。

```text
dotnet build Arma3ServerTools.sln -c Release
dotnet test Arma3ServerTools.sln -c Release
```

新解决方案 `Arma3ServerTools.sln` 含：

- `src/Arma3ServerTools.Core` — 领域层（net10.0-windows，无需 DevExpress）
- `src/Arma3ServerTools.Application` — 应用服务层
- `src/Arma3ServerTools.App.WinForms` — 主程序（输出 `Arma3ServerTools.exe`）
- `src/Arma3ServerTools.MonitoringHost` — 监控 WM_COPYDATA 宿主

Release 输出目录示例：`src/Arma3ServerTools.App.WinForms/bin/Release/net10.0-windows/`（含 `Arma3ServerTools.exe`、`monitoring/Arma3ServerTools.MonitoringHost.exe`、`sql/destiny_statistics.sql`）。

打包到 `artifacts/`（Release v1.0.0）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release -Version 1.0.0
```

产物为 `artifacts/Arma3ServerTools-v1.0.0-Release/` 及同名 `.zip`；详见 **[docs/release-v1.0.0.md](docs/release-v1.0.0.md)**。

**注意**：

- 安装路径不能包含中文（启动时会检测并退出）
- 开发时请先关闭主程序再编译，避免 `monitoring/` 下 DLL 被占用
- 主程序退出时会自动关闭监控宿主
- 本地 `packages/`、`.vs/`、`bin/`、`obj/` 为构建缓存，不必提交 Git；克隆后执行 `dotnet restore` 即可

#### 首次开服

逐步说明见 **[docs/first-server-guide.md](docs/first-server-guide.md)**（SteamCMD、写 cfg、RCon、监控、封禁）。

#### 使用说明

使用 Visual Studio 2022 或更高版本，或任意编辑器 + `dotnet` CLI 即可构建。

#### 许可

本项目采用 **[Apache License 2.0](LICENSE)**，与原作者许可一致。二次开发请保留 `NOTICE` 中的原作者信息（Blue、七龙）及原项目链接。

#### 改造方案（开源 / 去 DevExpress）

纯 C# 分层改造说明见：**[docs/refactoring-plan.md](docs/refactoring-plan.md)**  
完整实施计划与 backlog：**[docs/product-roadmap.md](docs/product-roadmap.md)**  
首次开服步骤：**[docs/first-server-guide.md](docs/first-server-guide.md)**  
v1.0 发布清单：**[docs/release-v1.0.0.md](docs/release-v1.0.0.md)**  
冒烟验收：**[docs/smoke-checklist.md](docs/smoke-checklist.md)**

#### 描述
1.  **Arma3ServerTools** — 主程序（`src/Arma3ServerTools.App.WinForms`）
2.  **DestinyServerMonitoring** — Arma 3 服务器 DLL 扩展，用于与开服工具通讯


#### 特色和优点:
1.	可以扫描本地/Workshop 模组目录，从 Arma3 启动器 HTML 导入并启用模组，手动添加本地模组。
2.	可以下载DLC服务端，更新指定服务端
3.	自动配置BE反作弊的基本规则，配置基本的关于创建，杀死，传送等基本的BE规则。
4.	自动配置rcon密码和端口
5.	提供基于BattlEye RCon V2协议的集成管理，T人B人等全系列功能。
6.	支持同时管理多个服务端，复制配置、列表搜索、快速配置向导。
7.	SteamCMD：配置账号、下载 steamcmd、安装/更新专用服务器。
8.	统计：SQLite 入库、趋势图表、CSV/HTML 导出；可选 Monitoring DLL 采集。
9.	自动重启（硬重启）+（脚本重启）+定点重启（Quartz）。
10.	基本/网络/安全/性能/日志/难度/模组/任务/定时/统计/RCon/封禁/概览等设置页。
11.	启动前检查、RPT 日志、进程意外退出桌面通知。
12.	工具菜单：关于页（v1.0.0）、SteamCMD 设置、快速配置向导。



