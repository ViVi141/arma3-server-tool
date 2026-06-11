# 配置保存、应用与同步（v1.6+）

> 工具配置（A3ST）与游戏目录 cfg **分离**。本文为主说明；架构见 [architecture.md](architecture.md)，开服步骤见 [first-server-guide.md](first-server-guide.md)。

## 数据流（v1.6）

1. 选中服务器 → `ServerConfigSessionStore.GetOrLoad(uuid)` 加载 Session  
2. 设置页编辑 → `ServerConfigSession.Patch` 更新内存模型（无需点保存才扫 Tab）  
3. **保存配置** → `ConfigPersistenceService.SavePackageAsync`（后台队列，UI 不阻塞）  
4. **写入服务器** → `SaveAndWriteAsync`（先包后 cfg + 可选监控部署）

启动时列表仅读 `manifest.json` 摘要，不再对全部服务器做 compare 序列化。

## 自动快照策略（`ui-settings.json`）

| 设置 | 默认 | 说明 |
|------|------|------|
| `AutoSnapshotMode` | `BeforeWrite` | `Off` / `BeforeSave` / `BeforeWrite` |
| `AutoSnapshotAsync` | `true` | 异步快照不阻塞保存/写入；失败写日志 |

GUI：**服务器** 菜单中可切换上述选项。概览页仍可手动创建/恢复快照。

## 两类存储

| 类型 | 路径 | 谁读写 |
|------|------|--------|
| **工具配置包** | `{UserData}/config/{uuid}/` | 仅工具（GUI / Agent `save`） |
| **游戏 cfg** | `{ServerDir}/a3st_serverconfig/{uuid}/` | Arma 3 进程；由工具 **应用** 或 Agent `write_cfg` 写入 |

### 配置包文件（`ToolConstants`）

| 文件 | 内容 |
|------|------|
| `manifest.json` | UUID、名称、目录、保存时间、格式版本等 |
| `server.json` | `ServerConfig`（主机名、密码、任务列表等） |
| `startup.json` | 启动参数（不含模组列表） |
| `mods.json` | `modsEntities` |
| `basic.json` / `profile.json` / `battleye.json` | 对应配置段 |
| `tasks.json` | 定时、PID、无头客户端等 |
| `missionparams.json` | 任务参数字典 |

旧版单文件 `config/{uuid}.json` 在**读取或保存**时自动迁移到上述目录，并删除 legacy 文件。

## 三个主操作（GUI）

| 按钮 / 操作 | 写配置包 | 写游戏 cfg | 说明 |
|-------------|----------|------------|------|
| **保存到工具** | 是 | 否 | 适合频繁改设置、大量模组时较快 |
| **应用到服务器目录** | 是（先保存） | 是 | 写入 `server.cfg`、`basic.cfg`、Profile、BattlEye、监控部署等 |
| **启动** | 是（保存当前编辑） | 否 | 使用目录中**已有** cfg；无 `server.cfg` 时预检报错 |

手改游戏目录里的 cfg，工具**不会**在状态栏提示「未同步」；以磁盘文件为准，需再次 **应用** 才会被工具覆盖。

## 同步状态（仅工具侧）

| 状态 | 含义 |
|------|------|
| **未保存到工具** | 界面有改动，或与上次「保存到工具」的快照不一致 |
| **已保存到工具** | 与上次保存的快照一致（与游戏 cfg 是否一致无关） |

Tab 旁 **●** 表示该页有本地未保存编辑。

## Agent 对应关系

| `action` | 配置包 | 游戏 cfg |
|----------|--------|----------|
| `save` | 是 | 可选（`writeCfgAfter` / 任务级 `writeCfgAfter`） |
| `write_cfg` / `apply` | 是（先） | 是（`SaveAndWrite`，等同 GUI「写入服务器」） |
| `start` | 是（先 save） | 否（使用目录中已有 cfg） |
| `restart` | 是 | 是（stop → apply → start） |
| `switch_mission` | 是 | 是 |
| `enable_mods` / `disable_mods` / `import_mods_html` / `sync_cron_jobs` | 是 | 可选（`writeCfgAfter` 或 `restartAfter`） |

改配置后启服推荐：

- **一步 apply**：`write_cfg` 或 REST `PATCH ...?writeCfg=true`
- **改并重启**：task 设 `"restartAfter": true`（或末尾 `{ "action": "restart" }`）
- **分步**：`save` → `write_cfg` → `start`

详见 [agent-capabilities.md](agent-capabilities.md)。

## 升级自 v1.4.x

1. 安装新版本后正常打开工具。  
2. 每台服执行一次 **保存到工具**（触发迁移）。  
3. 若尚未有游戏 cfg，执行 **应用到服务器目录** 后再 **启动**。
