# v1.2.1 发布清单

> 维护者在打 tag / GitHub Release 前按此核对。用户安装见 [first-server-guide.md](first-server-guide.md)。

## 本版要点

- **难度设置 UI 文案对齐官方 Wiki**：三态选项按 [Bohemia Difficulty Settings](https://community.bistudio.com/wiki/Arma_3:_Difficulty_Settings) 分为距离型（从不 / 有限距离 / 始终）、渐隐型（从不 / 渐隐 / 始终）、第三人称（禁用 / 启用 / 仅载具）
- **字段标签与说明**：如「已发现地雷」「降低受伤」「阵亡提示」「第三人称视角」等；顶部增加 CustomDifficulty 说明 hint
- **任务难度预设**：「正常」改为「常规」（Regular）；旧配置仍兼容「正常」
- **Profile 导出**：CustomDifficulty `description` 更新为 `Arma3 Server Tools 自定义难度（CustomDifficulty）`

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

未指定 `-Version` 时从 `Directory.Build.props` 读取（当前 **1.2.1**）。

产物：

| 路径 | 说明 |
|------|------|
| `artifacts/Arma3ServerTools-Setup.exe` | **默认发布物**：Inno Setup 安装程序 |
| `artifacts/_publish/` | staging 目录 |
| `artifacts/Arma3ServerTools-v1.2.1-Release-win-x64.zip` | 仅在使用 `-Zip` 时生成 |

## 自动化

- [x] `dotnet test Arma3ServerTools.sln -c Release` 全绿（129 项）
- [ ] GitHub Actions CI 绿

## 手动冒烟

见 [smoke-checklist.md](smoke-checklist.md)。**v1.2.1 建议抽查**：

1. **服务器设置 → 难度**：确认三态下拉文案与顶部说明
2. **任务设置 → 任务难度预设**：显示「常规」；旧档「正常」仍可加载
3. **应用到服务器目录** 后检查 Profile 中 CustomDifficulty `description`

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.2.1: align difficulty UI labels with official wiki."
git tag -a v1.2.1 -m "Arma3 Server Tools v1.2.1"
git push origin HEAD
git push origin v1.2.1
```

在 GitHub **Releases** 新建 `v1.2.1`，上传 `artifacts/Arma3ServerTools-Setup.exe`。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.2.1` |
| `scripts/Arma3ServerTools.iss` | 安装包 VersionInfo（构建时读取 props） |
| 关于对话框 | `AppVersion.GetDisplayVersion()` |
