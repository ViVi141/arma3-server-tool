# v1.2.2 发布清单

> 维护者在打 tag / GitHub Release 前按此核对。用户安装见 [first-server-guide.md](first-server-guide.md)。

## 本版要点

- **难度 UI 文案二次校正**（对照 [Bohemia Difficulty Settings](https://community.bistudio.com/wiki/Arma_3:_Difficulty_Settings)）：
  - 顶部说明：小队指示器 / 名称标签 / 已发现地雷分类更准确
  - 「命令」→「命令图标」；视觉辅助、计分表、地图内容等说明对齐 Wiki
  - AI 滑条标注 `skillAI` / `precisionAI`
- **基本设置**：「难度档案附加行」→ **Arma3Profile 附加行**（实为 Profile 通用参数，非 CustomDifficulty）
- **任务设置**：「强制难度」→ **强制任务难度**（对应 `forcedDifficulty`）
- **应用/启动提示与文档**：成功提示、未保存对话框、[first-server-guide.md](first-server-guide.md) 补充 `*.Arma3Profile` 写入说明

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

未指定 `-Version` 时从 `Directory.Build.props` 读取（当前 **1.2.2**）。

产物：

| 路径 | 说明 |
|------|------|
| `artifacts/Arma3ServerTools-Setup.exe` | **默认发布物**：Inno Setup 安装程序 |
| `artifacts/_publish/` | staging 目录 |
| `artifacts/Arma3ServerTools-v1.2.2-Release-win-x64.zip` | 仅在使用 `-Zip` 时生成 |

## 自动化

- [x] `dotnet test Arma3ServerTools.sln -c Release` 全绿（129 项）
- [ ] GitHub Actions CI 绿

## 手动冒烟

见 [smoke-checklist.md](smoke-checklist.md)。**v1.2.2 建议抽查**：

1. **难度** 页：命令图标、地图内容、AI 字段标签
2. **基本 → 附加参数**：Arma3Profile 附加行
3. **应用到服务器目录** 成功提示含 `*.Arma3Profile`

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.2.2: refine difficulty labels and apply-to-server messaging."
git tag -a v1.2.2 -m "Arma3 Server Tools v1.2.2"
git push origin HEAD
git push origin v1.2.2
```

在 GitHub **Releases** 新建 `v1.2.2`，上传 `artifacts/Arma3ServerTools-Setup.exe`。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.2.2` |
| `scripts/Arma3ServerTools.iss` | 安装包 VersionInfo（构建时读取 props） |
| 关于对话框 | `AppVersion.GetDisplayVersion()` |
