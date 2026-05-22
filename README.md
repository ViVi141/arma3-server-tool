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

**注意**：安装路径不能包含中文（启动时会检测并退出）。开发时请先关闭主程序再编译，避免 `monitoring/` 下 DLL 被占用；主程序退出时会自动关闭监控宿主。

#### 使用说明

使用 Visual Studio 2022 或更高版本，或任意编辑器 + `dotnet` CLI 即可构建。

#### 许可

本项目采用 **[Apache License 2.0](LICENSE)**，与原作者许可一致。二次开发请保留 `NOTICE` 中的原作者信息（Blue、七龙）及原项目链接。

#### 改造方案（开源 / 去 DevExpress）

纯 C# 分层改造说明见：**[docs/refactoring-plan.md](docs/refactoring-plan.md)**

#### 描述
1.  **Arma3ServerTools** — 主程序（`src/Arma3ServerTools.App.WinForms`）
2.  **DestinyServerMonitoring** — Arma 3 服务器 DLL 扩展，用于与开服工具通讯
3.  **Steamcmdtools** — SteamCMD 辅助下载器（构建时复制到输出目录）


#### 特色和优点:
1.	可以添加创意工坊的MODID/URL，启动器导出来自HTML，从剪辑版复制的ID，本地的模组等识别并下载（使用steamcmd）。
2.	可以下载DLC服务端，更新指定服务端
3.	自动配置BE反作弊的基本规则，配置基本的关于创建，杀死，传送等基本的BE规则。
4.	自动配置rcon密码和端口
5.	提供基于BattlEye RCon V2协议的集成管理，T人B人等全系列功能。
6.	支持同时管理多个服务端，单独复制到其他服务端目录开服，上手直接开服。
7.	支持服务器，自动查询所有服务器并更新列表查询
8.	拥有的订阅者，可以为您订阅其他插件，例如服务端丰富的插件（开发中的实用插件）。
9.	统计，提供记录服务器的各项数据，服务器性能，内存，CPU监控，以及数据监控报告统计等（开发中）。
10.	自动重启（硬重启）+（脚本重启）+定点重启。
11.	收录了RAM3服务器的基本设置，安全设置，网络，任务设置，模组设置，设置，性能设置，日志设置。
12.	UI布局自动适应，适合手机连接服务器时画面小进行管理。
13.	显示参数详细信息功能。
14.	可以运行配置向导进行配置。



