# v1.5.0 发布清单（Changelog）

> 本版范围：自 `v1.4.2` 起的工具配置架构（A3ST 配置包）、保存/应用分离、同步状态与性能优化。

## 本版要点

### 工具配置（A3ST 配置包）

- 每服配置目录：`config/{uuid}/`（`manifest.json`、`server.json`、`startup.json`、`mods.json` 等分片）。
- 旧版 `config/{uuid}.json` 在读取或保存时**自动迁移**到配置包并删除 legacy 单文件。
- 模组列表独立为 `mods.json`，减轻单文件 JSON 体积与序列化开销。

### 保存 / 应用 / 启动（行为变更）

| 操作 | 写入工具配置包 | 写入游戏目录 cfg |
|------|----------------|------------------|
| **保存到工具** | 是 | 否 |
| **应用到服务器目录** | 是（先保存） | 是 |
| **启动** | 是（GUI 启动前保存当前编辑） | 否（使用目录中已有 cfg） |

- 同步状态仅 **已保存到工具** / **未保存**；不再显示「cfg 未同步」或跟踪手改 `server.cfg`。
- 启动前预检：缺少 `a3st_serverconfig/{uuid}/server.cfg` 时报错，提示先 **应用到服务器目录**。

### 性能

- 配置对比快照单次序列化；Reload 并行预热快照。
- 模组扫描默认跳过 bikey 全目录遍历；写启动参数可跳过逐模组路径存在性检查。
- 大量模组（200+）时保存/应用明显加速（视环境而定）。

### Agent / 自动化

- `save`：仅保存 A3ST 配置包。
- `write_cfg` / `apply`：仅写游戏目录 cfg（不保存工具包）。
- `start`：不自动保存/写 cfg（需游戏目录已有 cfg；改配置后请先 `save` + `write_cfg` 或 GUI「应用」）。
- `restart`：仍为 `stop` → `write_cfg` → `start`。

## 版本号

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.5.0` |

## 发版前检查

```powershell
dotnet restore Arma3ServerTools.sln
dotnet build Arma3ServerTools.sln -c Release --no-restore
dotnet build src/Arma3ServerTools.Agent.Host/ -c Release --no-restore
dotnet test tests/Arma3ServerTools.Core.Tests/ -c Release --no-build
dotnet test tests/Arma3ServerTools.Application.Tests/ -c Release --no-build --filter "FullyQualifiedName!~SteamCmdService&FullyQualifiedName!~SteamCmdExecutionGate"
dotnet format Arma3ServerTools.sln --verify-no-changes --no-restore
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

冒烟见 [smoke-checklist.md](../../smoke-checklist.md)。

## Git tag 与 Release（维护者）

```powershell
git tag -a v1.5.0 -m "Arma3 Server Tools v1.5.0"
git push origin v1.5.0
```

在 GitHub **Releases** 新建 `v1.5.0`，上传 `artifacts/Arma3ServerTools-Setup-*.exe`，正文可摘录 [CHANGELOG.md](../../CHANGELOG.md) 中 `[1.5.0]` 一节。
