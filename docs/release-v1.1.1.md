# v1.1.1 发布清单

> 维护者在打 tag / GitHub Release 前按此核对。用户安装见 [first-server-guide.md](first-server-guide.md)。

## 本版要点

- **SteamCMD 路径修复**：禁止写入 `Program Files`；只读安装时统一使用 `%LocalAppData%\Arma3ServerTools\extension\`
- **SteamCMD 下载/初始化**：校验完整安装（含 `public/steambootstrapper_english.txt`）；下载后自动 `+quit` 初始化；502 / HTML 代理错误友好提示
- **向导修复**：首次开服向导与快速配置向导路径校验统一；装服时必填 Steam 账号；预填 Steam 设置并显示实际 SteamCMD 目录
- **配置归一化**：加载/保存 SteamCMD 设置时自动修正 `settings.d` 为可写 extension 目录

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

未指定 `-Version` 时从 `Directory.Build.props` 读取（当前 **1.1.1**）。

产物：

| 路径 | 说明 |
|------|------|
| `artifacts/Arma3ServerTools-Setup.exe` | **默认发布物**：Inno Setup 安装程序 |
| `artifacts/_publish/` | staging 目录 |
| `artifacts/Arma3ServerTools-v1.1.1-Release-win-x64.zip` | 仅在使用 `-Zip` 时生成 |

## 用户数据路径

| 安装方式 | SteamCMD / extension |
|----------|---------------------|
| 安装到 `Program Files` | `%LocalAppData%\Arma3ServerTools\extension\` |
| 便携 / 可写目录 | 程序目录旁 `extension/` |

## 自动化

- [x] `dotnet test Arma3ServerTools.sln -c Release` 全绿（124 项）
- [ ] GitHub Actions CI 绿

## 手动冒烟

见 [smoke-checklist.md](smoke-checklist.md)。**v1.1.1 必测**：

1. 从 Setup 安装到 Program Files 后，**工具 → SteamCMD 设置** 显示的目录为 LocalAppData
2. **服务器 → 首次开服向导**：勾选装服时未填 Steam 账号应被拦截；路径含中文应提示
3. SteamCMD 下载失败时（502）应显示可读错误而非 KeyValues 解析异常

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.1.1: SteamCMD path fix, wizard validation, CDN error handling"
git tag -a v1.1.1 -m "Arma3 Server Tools v1.1.1"
git push origin HEAD
git push origin v1.1.1
```

在 GitHub **Releases** 新建 `v1.1.1`，上传 `artifacts/Arma3ServerTools-Setup.exe`。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.1.1` |
| `scripts/Arma3ServerTools.iss` | 安装包 VersionInfo（构建时读取 props） |
| 关于对话框 | `AppVersion.GetDisplayVersion()` |

## 后续（v1.2+）

- P2-05 列表排序、P2-06 托盘最小化
- P1-09 / P1-10 RCon 进阶
- AppUpdate 自动更新
- DestinyServerMonitoring DLL 纳入 CI 构建
