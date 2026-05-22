# v1.1.0 发布清单

> 维护者在打 tag / GitHub Release 前按此核对。用户安装见 [first-server-guide.md](first-server-guide.md)。

## 本版要点

- **Inno Setup 安装包**：默认产物 `artifacts/Arma3ServerTools-Setup.exe`（自包含 win-x64）
- **Program Files 安装修复**：只读安装目录时，配置/日志/数据库/SteamCMD 写入 `%LocalAppData%\Arma3ServerTools\`
- **工程化**：依赖注入、文件日志、DPAPI 凭据保护、CI 格式校验、统一应用图标与安装包元信息
- **启动容错**：全局异常捕获，避免无声闪退

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

未指定 `-Version` 时从 `Directory.Build.props` 读取（当前 **1.1.0**）。

未安装 Inno Setup 时：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release -InstallInnoSetup
```

产物：

| 路径 | 说明 |
|------|------|
| `artifacts/Arma3ServerTools-Setup.exe` | **默认发布物**：Inno Setup 安装程序 |
| `artifacts/_publish/` | staging 目录 |
| `artifacts/Arma3ServerTools-v1.1.0-Release-win-x64.zip` | 仅在使用 `-Zip` 时生成 |

## 用户数据路径

| 安装方式 | 可写数据位置 |
|----------|--------------|
| 安装到 `Program Files` | `%LocalAppData%\Arma3ServerTools\`（config、logs、数据库、extension） |
| 便携 / 可写目录 | 程序目录旁（与 v1.0 便携行为一致） |

## 自动化

- [x] `dotnet test Arma3ServerTools.sln -c Release` 全绿
- [ ] GitHub Actions CI 绿（需已提交 `dotnet format` 结果）

## 手动冒烟

见 [smoke-checklist.md](smoke-checklist.md)。**v1.1 必测**：从 Setup 安装到默认 Program Files 路径后首次启动不闪退。

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.1.0: installer, LocalAppData user data, DI and logging"
git tag -a v1.1.0 -m "Arma3 Server Tools v1.1.0"
git push origin HEAD
git push origin v1.1.0
```

在 GitHub **Releases** 新建 `v1.1.0`，上传 `artifacts/Arma3ServerTools-Setup.exe`。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.1.0` |
| `scripts/Arma3ServerTools.iss` | 安装包 VersionInfo、图标 |
| 关于对话框 | `AppVersion.GetDisplayVersion()` |

## 后续（v1.2+）

- P2-05 列表排序、P2-06 托盘最小化
- P1-09 / P1-10 RCon 进阶
- AppUpdate 自动更新
- DestinyServerMonitoring DLL 纳入 CI 构建
