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

产物目录：`artifacts/Arma3ServerTools-Release/`

## 3. 安装专用服务器（SteamCMD）

1. 打开主程序 → **工具 → SteamCMD 设置**，填写账号与 Workshop 根目录
2. **服务器 → 安装/更新专用服务器...**，选择安装目录（即后续「服务器目录」）
3. 若本机无 `steamcmd.exe`，程序可尝试下载到 `extension/steamcmd.exe`；也可 [手动下载 SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD) 并放到程序目录下的 `extension/` 文件夹

## 4. 新建服务器配置

1. **服务器 → 新建...**，填写配置名称与服务器安装目录
2. 在右侧设置页完成：
   - **基本**：主机名、端口、最大玩家等
   - **安全**：BattlEye、RCon 密码与端口、**RCon 地址**（默认 127.0.0.1）
   - **任务**：选择 `.pbo` 任务
   - **模组**：扫描 Workshop 目录并勾选模组（需事先用 SteamCMD 自行下载模组）
3. **保存到工具** → 可选 **应用到服务器目录**（写入 `server.cfg` 等；也可在点击 **启动** 时自动写入）

> **说明：** 「保存到工具」只更新工具内的 JSON 配置；Arma 3 实际读取的是服务器目录下的 cfg 文件。通过本工具 **启动** 时会自动写入 cfg，因此日常改完设置后直接点启动即可；若需在不启动的情况下检查磁盘上的 cfg，请使用 **应用到服务器目录**。

## 5. 监控与统计（可选）

在 **统计** 页勾选：

- **启用监控模组 (@a3st_monitor)** — 启动参数会加入 `@a3st_monitor` 服务器模组
- **启用统计入库** — 运行时将性能/击杀等数据写入 `a3st_statistics.db`

需自行编译 Monitoring RVExtension（`DestinyServerMonitoring/` 目录，见 [monitoring-cpp-dll-build.md](monitoring-cpp-dll-build.md)），或通过 **应用到服务器目录** 自动部署 DLL 与 `@a3st_monitor`。主程序启动时会拉起 `monitoring/Arma3ServerTools.MonitoringHost.exe` 接收游戏进程数据。

## 6. 启动服务器

1. 确认状态栏显示 **已同步**，或接受「启动时将自动写入」提示
2. 点击 **启动**（会先写入 `server.cfg` 再启动进程）
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
| 模组未出现 | 确认 Workshop 扫描路径与 SteamCMD 下载目录一致 |
| 统计无数据 | 勾选「启用统计入库」并确认 MonitoringHost 在运行 |

更多架构说明见 [architecture.md](architecture.md)，完整 backlog 见 [product-roadmap.md](product-roadmap.md)，用户体验优化清单见 [ux-optimization-backlog.md](ux-optimization-backlog.md)。
