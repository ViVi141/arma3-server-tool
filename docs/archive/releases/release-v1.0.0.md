# v1.0.0 发布清单

> 维护者在打 tag / GitHub Release 前按此核对。用户安装见 [first-server-guide.md](first-server-guide.md)。

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

未指定 `-Version` 时从 `Directory.Build.props` 读取。显式指定版本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release -Version 1.0.0
```

未安装 Inno Setup 时：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release -Version 1.0.0 -InstallInnoSetup
```

产物：

| 路径 | 说明 |
|------|------|
| `artifacts/Arma3ServerTools-Setup.exe` | **默认发布物**：Inno Setup 安装程序（自包含 win-x64，含 Windows 文件版本信息） |
| `artifacts/_publish/` | 安装包 staging 目录（调试/`-SkipInstaller` 时保留） |
| `artifacts/Arma3ServerTools-v1.0.0-Release-win-x64.zip` | 仅在使用 `-Zip` 时生成 |

安装后目录应含：`Arma3ServerTools.exe`、`monitoring/`、`sql/`、`LICENSE`、`NOTICE`、`THIRD-PARTY-NOTICES.txt`。

## 自动化

- [ ] `dotnet test Arma3ServerTools.sln -c Release` 全绿
- [ ] GitHub Actions CI 绿（`.github/workflows/ci.yml`）

## 手动冒烟

见 [smoke-checklist.md](smoke-checklist.md)（英文路径、向导、启停、RCon、统计导出）。

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.0.0: net10 WinForms, P1/P2/P3 features"
git tag -a v1.0.0 -m "Arma3 Server Tools v1.0.0"
git push origin HEAD
git push origin v1.0.0
```

在 GitHub **Releases** 新建 `v1.0.0`，上传 `artifacts/Arma3ServerTools-Setup.exe`。若同时提供便携版，可加 `-Zip` 并上传对应 zip。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version`、`Company`、`Product`、`Description`、`Copyright`（主程序 exe 属性） |
| `scripts/Arma3ServerTools.iss` | 安装包 `VersionInfo*`、`AppCopyright`、卸载显示名 |
| 关于对话框 | `AppVersion.GetDisplayVersion()` |
| 下次发版 | 改 `Directory.Build.props` 中的 `Version` 即可；构建脚本自动同步 |

## 已知非阻塞项（v1.1+）

- P2-05 列表排序、P2-06 托盘最小化
- P1-09 / P1-10 RCon 进阶
- AppUpdate 自动更新（阶段 8）
- DestinyServerMonitoring DLL 未纳入 CI 构建
