# v1.2.3 发布清单

> 维护者在打 tag / GitHub Release 前按此核对。用户安装见 [first-server-guide.md](first-server-guide.md)。

## 本版要点

### 模组启动参数

- 新增 `ModCommandLineBuilder`：统一构建 `-mod` / `-serverMod` 列表
- 服务器目录内模组路径自动转为 `@文件夹名`（相对工作目录）
- 去重、跳过磁盘上不存在的绝对路径
- 仅勾选 Headless 的模组也会进入主服 `-mod=`（玩家需同步）
- 启动主服 / HC 时设置 `WorkingDirectory = ServerDir`，`@a3st_monitor` 等相对路径可正确解析
- 手动添加本地模组默认启用 LocalMod + ServerMod
- 创意工坊「仅服务器」导入时，Workshop 模组同时写入 `-mod=`

### 定时任务

- 修复保存定时任务时 `Action` 被固定为「重启」的问题
- 新增 `CronTaskTool`；对话框支持重启 / 启动 / 停止 / 检测并重启

### 任务难度

- 修复「强制任务难度」下拉索引与 `forcedDifficulty` 映射错位

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

未指定 `-Version` 时从 `Directory.Build.props` 读取（当前 **1.2.3**）。

产物：

| 路径 | 说明 |
|------|------|
| `artifacts/Arma3ServerTools-Setup.exe` | **默认发布物**：Inno Setup 安装程序 |
| `artifacts/_publish/` | staging 目录 |
| `artifacts/Arma3ServerTools-v1.2.3-Release-win-x64.zip` | 仅在使用 `-Zip` 时生成 |

## 自动化

- [x] `dotnet test Arma3ServerTools.sln -c Release` 全绿（161 项）
- [ ] GitHub Actions CI 绿

## 手动冒烟

见 [smoke-checklist.md](smoke-checklist.md)。**v1.2.3 建议抽查**：

1. **模组** 页：勾选模组后启动参数含正确 `@ModName` 或绝对路径
2. **监控模组**：启用监控后 `-serverMod=` 含 `@a3st_monitor`
3. **定时任务**：保存后操作类型不被重置为「重启」
4. **任务设置**：强制任务难度选择与写入 `server.cfg` 一致

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.2.3: fix mod launch parameters, cron actions, and forced difficulty mapping."
git tag -a v1.2.3 -m "Arma3 Server Tools v1.2.3"
git push origin HEAD
git push origin v1.2.3
```

在 GitHub **Releases** 新建 `v1.2.3`，上传 `artifacts/Arma3ServerTools-Setup.exe`。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.2.3` |
| `scripts/Arma3ServerTools.iss` | 安装包 VersionInfo（构建时读取 props） |
| 关于对话框 | `AppVersion.GetDisplayVersion()` |
