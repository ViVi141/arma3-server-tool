# v1.0.0 发布清单

> 维护者在打 tag / GitHub Release 前按此核对。用户安装见 [first-server-guide.md](first-server-guide.md)。

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release -Version 1.0.0
```

自包含包（无需预装 Desktop Runtime）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release -Version 1.0.0 -SelfContained
```

产物：

| 路径 | 说明 |
|------|------|
| `artifacts/Arma3ServerTools-v1.0.0-Release/` | 框架依赖发布目录 |
| `artifacts/Arma3ServerTools-v1.0.0-Release.zip` | 同上，zip 附件 |

目录内应含：`Arma3ServerTools.exe`、`monitoring/`、`sql/`、`LICENSE`、`NOTICE`、`THIRD-PARTY-NOTICES.txt`。

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

在 GitHub **Releases** 新建 `v1.0.0`，上传 `artifacts/Arma3ServerTools-v1.0.0-Release.zip`，说明需安装 **.NET 10 Desktop Runtime**（框架依赖包）或使用 `-SelfContained` 构建。

## 版本号位置

- 统一：`Directory.Build.props` → `Version` / `InformationalVersion` = `1.0.0`
- 关于对话框：`AppVersion.GetDisplayVersion()`
- 下次发版：改 `Directory.Build.props` 与 `build-release.ps1 -Version` 参数

## 已知非阻塞项（v1.1+）

- P2-05 列表排序、P2-06 托盘最小化
- P1-09 / P1-10 RCon 进阶
- AppUpdate 自动更新（阶段 8）
- DestinyServerMonitoring DLL 未纳入 CI 构建
