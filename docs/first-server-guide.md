# 首次开服指南

本文档说明使用 **Arma3ServerTools** 从零配置并启动 Arma 3 专用服务器的推荐步骤。

## 1. 环境要求

- Windows 10/11，**安装路径与服务器目录均不能包含中文**
- [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0)（框架依赖发布时）
- Visual Studio 2022 或 [.NET 10 SDK](https://dotnet.microsoft.com/download)（自行编译时）

## 2. 获取程序

### 从源码构建

```powershell
dotnet build Arma3ServerTools.sln -c Release
dotnet test Arma3ServerTools.sln -c Release
```

主程序路径：

`src/Arma3ServerTools.App.WinForms/bin/Release/net10.0-windows/Arma3ServerTools.exe`

### 打包发布（可选）

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

产物：`artifacts/Arma3ServerTools-Setup.exe`（Inno Setup 安装包，自包含 .NET 运行时）。

## 3. 安装专用服务器（SteamCMD）

### 3.1 三种路径（不要混用）

| 名称（界面） | 是什么 | 典型路径 |
|--------------|--------|----------|
| **工具内置 SteamCMD** | 点「下载 SteamCMD」解压到这里；**留空「程序目录」时用** | `%LocalAppData%\Arma3ServerTools\extension\`（装到 Program Files 时）或 `{程序目录}\extension\` |
| **SteamCMD 程序目录** | 含 `steamcmd.exe` 的文件夹；可填内置路径或自解压路径 | 同上，或你自选的 `D:\SteamCMD\` |
| **模组下载目录**（只读） | Workshop 模组 `.pbo` 实际位置，程序自动显示 | `{程序目录}\steamapps\workshop\content\107410\<模组ID>\` |
| **专用服务器游戏目录** | `arma3server`、任务、`server.cfg` 等 | 如 `D:\Games\Arma3Server\`（**不是**模组目录） |

### 3.2 推荐步骤

1. 打开 **工具 → SteamCMD 设置**，填写 Steam 账号；**SteamCMD 程序目录**可留空（用内置）或指向含 `steamcmd.exe` 的文件夹
2. 点 **下载 SteamCMD**（装到工具内置 `extension\`）或自行 [手动下载](https://developer.valvesoftware.com/wiki/SteamCMD) 解压
3. **安装/更新专用服务器** 时选择 **专用服务器游戏目录**（与当前服务器配置的「服务器目录」一致）
4. 在 **模组** 页下载 Workshop 模组后，到 **模组下载目录** 下会出现对应 ID 文件夹；保存 Steam 设置后会加入扫描路径

> **网络提示：** 若日志出现 `502.3` / `IIS` / `<!DOCTYPE`，说明代理或防火墙拦截了 Steam CDN（`steamcdn-a.akamaihd.net`），请关闭代理或手动解压完整 SteamCMD。

## 4. 新建服务器配置

1. **服务器 → 新建...**，填写配置名称与服务器安装目录
2. 在右侧设置页完成：
   - **基本**：主机名、端口、最大玩家等
   - **安全**：BattlEye、RCon 密码与端口、**RCon 地址**（默认 127.0.0.1）
   - **任务**：选择 `.pbo` 任务
   - **模组**：勾选「更新」列后点 **下载选中模组**；或 **从剪贴板导入 ID** / **从 HTML 下载**（会弹出 Steam API 确认框）；下载完成后 **扫描刷新** 再勾选启用
3. **保存到工具** → 可选 **应用到服务器目录**（写入 `server.cfg`、`basic.cfg`、`*.Arma3Profile` 等；也可在点击 **启动** 时自动写入）

> **说明：** 「保存到工具」只更新工具内的 JSON 配置；Arma 3 实际读取的是服务器目录下的 cfg 与 Profile 文件（含 **CustomDifficulty**）。通过本工具 **启动** 时会自动写入这些文件，因此日常改完设置后直接点启动即可；若需在不启动的情况下检查磁盘上的配置，请使用 **应用到服务器目录**。

## 5. 监控与统计（可选）

在 **统计** 页勾选：

- **启用监控模组 (@a3st_monitor)** — 启动参数会加入 `@a3st_monitor` 服务器模组
- **启用统计入库** — 运行时将性能/击杀等数据写入 `a3st_statistics.db`

需自行编译 Monitoring RVExtension（`DestinyServerMonitoring/` 目录，见 [monitoring-cpp-dll-build.md](monitoring-cpp-dll-build.md)），或通过 **应用到服务器目录** 自动部署 DLL 与 `@a3st_monitor`。主程序启动时会拉起 `monitoring/Arma3ServerTools.MonitoringHost.exe` 接收游戏进程数据。

## 6. 启动服务器

1. 确认状态栏显示 **已同步**，或接受「启动时将自动写入」提示
2. 点击 **启动**（会先写入 `server.cfg`、`basic.cfg`、`*.Arma3Profile` 再启动进程）
3. 在 **远程控制** 页连接 RCon，管理在线玩家（踢人、封禁、切换任务等）

## 7. 封禁管理

- **封禁** 页：读写本地 `bans.txt`（可手动添加 GUID）
- **远程控制 → BattlEye 封禁**：查看/移除 BE 内存中的封禁

## 8. 多服与复制

- **服务器 → 复制为新建...** 可基于现有 json 快速创建第二套配置（新 UUID，可改目录）
- 修改端口、RCon 密码等后 **保存到工具**，再 **应用到服务器目录** 或直接 **启动**

## 9. 常见问题

| 问题 | 处理 |
|------|------|
| 提示中文路径 | 将工具与服务器目录移到纯英文路径 |
| RCon 连接失败 | 检查 BE 是否启用、端口/密码、防火墙；远程管理时在安全页修改 RCon 地址 |
| 模组未出现 | 确认「模组」页扫描路径包含 `steamapps\workshop\content\107410`；与 SteamCMD **程序目录** 一致 |
| 统计无数据 | 勾选「启用统计入库」并确认 MonitoringHost 在运行 |

更多说明见 [architecture.md](architecture.md)、[README.md](README.md)（文档索引）。通过 QQ 等远程管服见 [openclaw-integration.md](openclaw-integration.md)。
