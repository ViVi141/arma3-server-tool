# 配置保存、应用与同步（v1.5+）

> 工具配置（A3ST）与游戏目录 cfg **分离**。本文为主说明；架构见 [architecture.md](architecture.md)，开服步骤见 [first-server-guide.md](first-server-guide.md)。

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
| `save` | 是 | 否 |
| `write_cfg` / `apply` | 否 | 是 |
| `start` | 否 | 否（要求已存在 cfg） |
| `restart` | 否 | 是（`stop` → `write_cfg` → `start`） |
| `switch_mission` | 是 | 是 |

改配置后启服推荐：`save` → `write_cfg` → `start`，或 GUI 一次 **应用到服务器目录** 再 **启动**。详见 [agent-capabilities.md](agent-capabilities.md)。

## 升级自 v1.4.x

1. 安装新版本后正常打开工具。  
2. 每台服执行一次 **保存到工具**（触发迁移）。  
3. 若尚未有游戏 cfg，执行 **应用到服务器目录** 后再 **启动**。
