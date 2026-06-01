# Arma3 Server Tools

面向 Windows 的 **Arma 3 专用服务器** 图形化管理工具（**Arma3 Server Tools**）。使用 C# / .NET 10 开发，集成 BattlEye RCon、多服配置、SteamCMD、监控统计与定时任务等开服常用能力。

**当前版本：v1.5.0** · **当前维护仓库：** [ViVi141/arma3-server-tool](https://github.com/ViVi141/arma3-server-tool)

---

## 目录

- [项目来源](#项目来源)
- [命名约定](#命名约定)
- [主要功能](#主要功能)
- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [发布打包](#发布打包)
- [使用注意](#使用注意)
- [文档](#文档)
- [许可与致谢](#许可与致谢)

---

## 项目来源

| 角色 | 说明 |
|------|------|
| **本仓库（当前维护）** | [github.com/ViVi141/arma3-server-tool](https://github.com/ViVi141/arma3-server-tool) |
| **维护者** | [ViVi141](https://github.com/ViVi141) |
| **上游 Fork** | [airmoer/arma3-server-tool](https://github.com/airmoer/arma3-server-tool) — DevExpress 源码参考 |

### 原作者与历史

- **Blue**、**七龙** — destiny studio
- 原作者 GitHub 组织：[SkyCityStudio](https://github.com/SkyCityStudio)
- 历史项目页：[destiny.cool — ARMA3 开服工具](https://destiny.cool/s/arma3-tool)
- 博文（2024-03）：[ARMA3 DESTINY开服工具](https://destiny.cool/archives/1709790542346)

本仓库为 **去 DevExpress、.NET 10 分层重构** 的独立演进分支。二次开发请保留 [NOTICE](NOTICE) 中的原作者信息及上述出处链接。

---

## 命名约定

运行时标识集中在 `src/Arma3ServerTools.Core/ToolConstants.cs`：

| 用途 | 名称 |
|------|------|
| 工具配置包（每服） | `config/{uuid}/`（`manifest.json`、`mods.json` 等；旧版 `config/{uuid}.json` 自动迁移） |
| 服务器 cfg 目录 | `a3st_serverconfig/{uuid}/` |
| 统计库 | `a3st_statistics.db` |
| 玩家库 | `a3st_players.db` |
| 监控模组 | `@a3st_monitor` |
| 监控宿主窗口标题 | `A3-Arma3ServerTools-ProcessCommunicationModule` |

---

## 主要功能

- **服务器管理** — 多配置并存；A3ST 分片配置包；**保存到工具** 与 **应用到服务器目录** 分离；复制、搜索、快速配置向导；启动前检查；RPT 日志；进程异常退出桌面通知
- **BattlEye** — 自动写入基础 BE 规则；集成 BattlEye RCon V2（踢人、封禁、任务控制等）
- **网络与安全** — RCon 密码/端口；基本 / 网络 / 安全 / 性能 / 日志 / 难度等设置页
- **模组** — 扫描、勾选、更新/下载（选中模组、剪贴板 ID、HTML 批量下载）；Steam API 确认对话框；HTML 导入启用；Bikey 自动复制
- **SteamCMD** — 账号与路径配置；下载 `steamcmd`；安装 / 更新专用服务器（AppID 233780）
- **监控与统计** — SQLite 入库；趋势图表；CSV / HTML 导出；可选服务端 Monitoring DLL（源码目录 `DestinyServerMonitoring/`，输出文件名未改）
- **定时任务** — Quartz 调度：硬重启、脚本重启、定点重启等
- **封禁** — 本地封禁列表与 RCon 封禁管理

---

## 项目结构

解决方案 `Arma3ServerTools.sln` 包含：

| 项目 | 说明 |
|------|------|
| `src/Arma3ServerTools.Core` | 领域层（`net10.0-windows`） |
| `src/Arma3ServerTools.Application` | 应用服务层 |
| `src/Arma3ServerTools.App.WinForms` | 主程序，输出 `Arma3ServerTools.exe` |
| `src/Arma3ServerTools.MonitoringHost` | 监控 WM_COPYDATA 宿主进程 |
| `src/Arma3ServerTools.Agent.Host` | 本地自动化 API（随安装包部署到 `agent/`，见 [docs/openclaw-integration.md](docs/openclaw-integration.md)） |
| `DestinyServerMonitoring/` | 服务端 RVExtension 源码（构建产物见 `ToolConstants.MonitoringExtensionDllFileName`） |
| `tests/` | 单元测试（Core / Application） |

Release 输出示例：

```text
src/Arma3ServerTools.App.WinForms/bin/Release/net10.0-windows/
├── Arma3ServerTools.exe
├── monitoring/Arma3ServerTools.MonitoringHost.exe
├── agent/Arma3ServerTools.Agent.Host.exe
├── skills/arma3-server-tools/
├── scripts/openclaw/a3st-invoke.ps1
├── a3st_statistics.db          （运行时生成）
└── sql/a3st_statistics.sql
```

---

## 环境要求

- **操作系统：** Windows x64
- **开发 / 构建：** [.NET 10 SDK](https://dotnet.microsoft.com/download)
- **运行（框架依赖发布）：** .NET 10 Desktop Runtime
- **IDE（可选）：** Visual Studio 2022+，或任意编辑器 + `dotnet` CLI

---

## 快速开始

```powershell
git clone https://github.com/ViVi141/arma3-server-tool.git
cd arma3-server-tool
dotnet restore Arma3ServerTools.sln
dotnet build Arma3ServerTools.sln -c Release
dotnet test Arma3ServerTools.sln -c Release
```

首次开服步骤见 **[docs/first-server-guide.md](docs/first-server-guide.md)**。

---

## 发布打包

默认产出 **`artifacts/Arma3ServerTools-Setup-*.exe`**（Inno Setup 安装包，自包含 .NET 运行时）。**同一安装包**内包含：

| 组件 | 安装路径 | 说明 |
|------|----------|------|
| 主程序（本地 GUI） | `{app}\Arma3ServerTools.exe` | 开服管理界面 |
| Agent | `{app}\agent\Arma3ServerTools.Agent.Host.exe` | OpenClaw / HTTP 自动化 |
| MonitoringHost | `{app}\monitoring\` | 监控 WM_COPYDATA 宿主 |
| OpenClaw 辅助 | `{app}\skills\`、`{app}\scripts\openclaw\` | B 机可引用或复制 |

由 `scripts/build-release.ps1` 分别 `publish` 主程序与两个宿主后再打 Inno 包；安装程序开始菜单含 **主程序 + Agent** 快捷方式，可选「登录时自动启动 Agent」。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

未指定 `-Version` 时，版本号自动读取 `Directory.Build.props`。也可显式指定：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release -Version 1.5.0
```

首次构建若本机未安装 Inno Setup 6，可加 `-InstallInnoSetup` 自动下载到 `tools/innosetup-6/`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release -InstallInnoSetup
```

可选参数：

| 参数 | 说明 |
|------|------|
| `-SelfContained:$false` | 框架依赖发布（需用户安装 .NET 10 Desktop Runtime） |
| `-SkipInstaller` | 仅生成 `artifacts/_publish/` 目录，不编译安装包 |
| `-Zip` | 额外生成便携 zip（与旧版行为相同） |

详见 **[docs/CHANGELOG.md](docs/CHANGELOG.md)**（各版详细清单见 [docs/archive/releases/](docs/archive/releases/)）。

---

## 配置与启动（v1.5+）

**保存到工具** → **应用到服务器目录** → **启动**（启动不写 cfg）。详见 **[docs/config-workflow.md](docs/config-workflow.md)**。

## 使用注意

- 安装路径**不能包含中文**（启动时会检测并退出）
- 安装到 `Program Files` 等只读目录时，配置/日志/数据库/SteamCMD 会写入 **`%LocalAppData%\Arma3ServerTools\`**（便携版仍写在程序目录旁）
- **SteamCMD** 首次下载后需联机初始化；若日志出现 `502.3` / `IIS` / `<!DOCTYPE`，说明网络或代理拦截了 Steam CDN，请关闭代理或手动解压完整 SteamCMD 到 `%LocalAppData%\Arma3ServerTools\extension\`
- 编译前请**关闭正在运行的主程序**，避免 `monitoring/` 下 DLL 被占用
- 主程序退出时会自动关闭监控宿主进程
- **OpenClaw / 远程自动化**：安装目录下 `agent\Arma3ServerTools.Agent.Host.exe` 与主程序共用配置；详见 [docs/deployment-ab-openclaw.md](docs/deployment-ab-openclaw.md)
- 本地 `.vs/`、`bin/`、`obj/` 为构建缓存，无需提交；克隆后执行 `dotnet restore` 即可

---

## 文档

完整索引见 **[docs/README.md](docs/README.md)**。常用：

| 文档 | 内容 |
|------|------|
| [docs/config-workflow.md](docs/config-workflow.md) | 配置包、保存/应用/启动（v1.5+） |
| [docs/first-server-guide.md](docs/first-server-guide.md) | 首次开服指南 |
| [docs/openclaw-integration.md](docs/openclaw-integration.md) | OpenClaw + Agent（QQ 等 IM） |
| [docs/deployment-ab-openclaw.md](docs/deployment-ab-openclaw.md) | 双机部署（A 开服 / B OpenClaw） |
| [docs/agent-capabilities.md](docs/agent-capabilities.md) | Agent 能力与各 action 说明 |
| [docs/agent-channels.md](docs/agent-channels.md) | Agent HTTP / 任务 JSON |
| [docs/architecture.md](docs/architecture.md) | 项目架构 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 版本变更 |
| [docs/known-issues.md](docs/known-issues.md) | 已知问题 |
| [docs/smoke-checklist.md](docs/smoke-checklist.md) | 发版冒烟清单 |
| [docs/monitoring-cpp-dll-build.md](docs/monitoring-cpp-dll-build.md) | Monitoring DLL 构建 |

历史发布说明、改造计划与代码审查见 [docs/archive/](docs/archive/)。

---

## 许可与致谢

- 本项目采用 **[Apache License 2.0](LICENSE)**，第三方组件见 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)
- 维护：**ViVi141**（[GitHub](https://github.com/ViVi141)）
- 原作者：**Blue**、**七龙**（destiny studio）；出处见 [NOTICE](NOTICE)、[SkyCityStudio](https://github.com/SkyCityStudio)、[destiny.cool](https://destiny.cool/s/arma3-tool)

Arma 3 与 BattlEye 分别为 Bohemia Interactive 与 BattlEye Innovations 的商标；本项目与上述公司无隶属关系。
