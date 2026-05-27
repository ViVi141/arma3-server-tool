# v1.4.0 发布清单（Changelog）

> 本版范围：从 `v1.3.0` tag 到当前最新提交。

## 本版要点

### UI 与布局

- 设置页全面迁移至 AntdUI 控件，统一表单布局与视觉风格。
- 重构主窗体顶栏：标题栏与操作栏分层布局，修复窗口缩小后右上角按钮不可见、顶栏错位等问题。
- 优化 Tab 导航与响应式布局；服务器设置页顶栏支持换行与宽度限制。
- 修复密码字段输入框宽度为 0 导致无法输入的问题（含基础设置、安全、SteamCMD、RCon 等页）。

### 配置编辑体验

- 设置 dirty 跟踪改为与 baseline 比较：字段改回原值后自动清除「未保存」标记（Tab ●、标签高亮、状态栏）。
- 配置快照序列化重构，提升保存/同步状态判断准确性。
- 任务参数、性能设置等页控件与绑定逻辑改进。

### 模组扫描

- 扫描受保护系统目录（如 `Program Files`、Windows Defender 路径）时不再崩溃，跳过无权限路径并提示用户。
- 密钥（Bikey）检测增加异常保护；扫描结果返回 `ModScanResult`，可汇总不可访问路径。

### 构建与发布

- 安装包文件名增加构建时间戳，便于区分同版本多次构建。
- 构建脚本从 `Directory.Build.props` 自动读取版本与版权信息。

### 其他

- `GameConfigWriter` 写入逻辑增强；部分编码与实体字段调整。
- 新增 `Base64Helper` 等 UI 辅助工具。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.4.0` |
| `Directory.Build.props` | `AssemblyVersion` / `FileVersion` = `1.4.0.0` |
| `Directory.Build.props` | `InformationalVersion` = `1.4.0` |

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.4.0: UI refactor, settings dirty tracking, mod scan hardening and layout fixes."
git tag -a v1.4.0 -m "Arma3 Server Tools v1.4.0"
git push origin HEAD
git push origin v1.4.0
```

在 GitHub **Releases** 新建 `v1.4.0`，上传 `artifacts/Arma3ServerTools-Setup.exe`。
