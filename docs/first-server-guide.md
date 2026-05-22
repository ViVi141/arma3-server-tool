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
3. **保存配置** → **写入配置文件**

## 5. 监控与统计（可选）

在 **定时** 页勾选：

- **启用监控模组 (@destiny_server)** — 启动参数会加入 `@destiny_server` 服务器模组
- **启用统计入库** — 运行时将性能/击杀等数据写入 `destiny_statistics.db`

需自行编译并部署 `DestinyServerMonitoring` C++ RVExtension 及 `@destiny_server` 模组到服务器目录。主程序启动时会拉起 `monitoring/Arma3ServerTools.MonitoringHost.exe` 接收游戏进程数据。

## 6. 启动服务器

1. 确认已 **写入配置文件**
2. 点击 **启动**
3. 在 **远程控制** 页连接 RCon，管理在线玩家（踢人、封禁、切换任务等）

## 7. 封禁管理

- **封禁** 页：读写本地 `bans.txt`（可手动添加 GUID）
- **远程控制 → BattlEye 封禁**：查看/移除 BE 内存中的封禁

## 8. 多服与复制

- **服务器 → 复制为新建...** 可基于现有 json 快速创建第二套配置（新 UUID，可改目录）
- 修改端口、RCon 密码等后保存并写 cfg

## 9. 常见问题

| 问题 | 处理 |
|------|------|
| 提示中文路径 | 将工具与服务器目录移到纯英文路径 |
| RCon 连接失败 | 检查 BE 是否启用、端口/密码、防火墙；远程管理时在安全页修改 RCon 地址 |
| 模组未出现 | 确认 Workshop 扫描路径与 SteamCMD 下载目录一致 |
| 统计无数据 | 勾选「启用统计入库」并确认 MonitoringHost 在运行 |

更多架构说明见 [architecture.md](architecture.md)，完整 backlog 见 [product-roadmap.md](product-roadmap.md)。
