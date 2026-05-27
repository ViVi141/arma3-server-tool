# v1.2.0 发布清单

> 维护者在打 tag / GitHub Release 前按此核对。用户安装见 [first-server-guide.md](first-server-guide.md)。

## 本版要点

- **Workshop 模组下载回归**：通过 SteamCMD 批量下载（`workshop_download_item 107410`）
- **v1.0 模组 UI 恢复**：表格「更新」列、下载选中模组、剪贴板导入 ID、从 HTML 下载（与「从 HTML 启用」分离）
- **Steam API 确认对话框**：下载前展示模组名称、大小、描述，可勾选确认
- **HTML 启用增强**：「下载未安装」走同一确认与 SteamCMD 流程

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

未指定 `-Version` 时从 `Directory.Build.props` 读取（当前 **1.2.0**）。

产物：

| 路径 | 说明 |
|------|------|
| `artifacts/Arma3ServerTools-Setup.exe` | **默认发布物**：Inno Setup 安装程序 |
| `artifacts/_publish/` | staging 目录 |
| `artifacts/Arma3ServerTools-v1.2.0-Release-win-x64.zip` | 仅在使用 `-Zip` 时生成 |

## 与旧版 steamcmdTools 的差异

| 项 | v1.2.0 | 旧 steamcmdTools 版 |
|----|--------|---------------------|
| 下载方式 | SteamCMD 控制台 | 可选图形 progress 工具 |
| 进度 UI | 控制台输出 | 内置窗口 |
| 依赖 | 无额外 exe | 需 `steamcmdTools.exe` |

## 自动化

- [x] `dotnet test Arma3ServerTools.sln -c Release` 全绿（128 项）
- [ ] GitHub Actions CI 绿

## 手动冒烟

见 [smoke-checklist.md](smoke-checklist.md)。**v1.2.0 必测**：

1. **模组 → 从剪贴板导入 ID** → Steam API 确认框 → SteamCMD 下载
2. **模组 → 从 HTML 下载** → 勾选 → 下载完成后 **扫描刷新**
3. **从 HTML 启用 → 下载未安装** → 刷新状态 → 启用模组

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.2.0: restore Workshop mod download and v1.0 mod UI"
git tag -a v1.2.0 -m "Arma3 Server Tools v1.2.0"
git push origin HEAD
git push origin v1.2.0
```

在 GitHub **Releases** 新建 `v1.2.0`，上传 `artifacts/Arma3ServerTools-Setup.exe`。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.2.0` |
| `scripts/Arma3ServerTools.iss` | 安装包 VersionInfo（构建时读取 props） |
| 关于对话框 | `AppVersion.GetDisplayVersion()` |

## 后续（v1.3+）

- steamcmdTools 图形进度下载（可选恢复）
- AppUpdate 自动更新
- DestinyServerMonitoring DLL 纳入 CI 构建
