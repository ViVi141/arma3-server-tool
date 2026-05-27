# Agent 自动化能力详解

> 分支：`agent`  
> 执行核心：`Arma3ServerTools.Application.Automation.ServerAutomationService`  
> 网络入口：`Arma3ServerTools.Agent.Host`（HTTP + 可选 Inbox 文件）  
> IM（QQ 等）：由 **OpenClaw 部署在 B 机** 接入，见 [deployment-ab-openclaw.md](deployment-ab-openclaw.md)

本文说明 **当前版本实际具备的能力**、**每个动作在磁盘与进程上的效果**、**前置条件与限制**。

---

## 一、能力分层（谁负责什么）

| 层级 | 能力范围 |
|------|----------|
| **OpenClaw（B 机）** | QQ/微信等通道、自然语言理解、多轮确认、按用户/群做权限、把意图交给 Skill |
| **Skill + `a3st-invoke.ps1`（B 机）** | 把对话转成任务 JSON、带 Bearer Token 调 A 机 HTTP |
| **Agent.Host（A 机）** | 监听 HTTP（及可选 Inbox）、串行执行任务、写日志 |
| **Application 层（A 机）** | 与 WinForms 共用：`ServerConfigService`、`ServerProcessService`、`IGameConfigWriter`、`ISteamCmdService`、`ModEnablerService`、`ModScannerService`、`BikeyService`、`IRconService` 等 |

**不包含**：在 A 机上直接收 QQ 协议、在 B 机上启动 `arma3server.exe`、远程桌面代点 WinForms。

---

## 二、HTTP API 能力一览

| 方法 | 路径 | 鉴权 | 能力说明 |
|------|------|------|----------|
| GET | `/api/v1/health` | 无 | 探活；返回服务名、`remoteAccessEnabled`、`publicBaseUrl` 等元信息 |
| GET | `/api/v1/servers` | Bearer | 列出工具内已保存的**所有服务器配置**（名称、UUID、文件等摘要） |
| GET | `/api/v1/servers/{uuid}/status` | Bearer | 单服**运行态**：是否在跑、PID、当前任务模板名（配置首项）、已勾选为服模的模组数量 |
| POST | `/api/v1/task` | Bearer | 按 JSON **顺序执行**多条命令（见下文 `action`）；全局互斥锁，同一时刻只跑一个任务 |

远程部署时 A 机需 `remoteAccessEnabled` + 防火墙 + 可选 `allowedCallerIps`，见 [deployment-ab-openclaw.md](deployment-ab-openclaw.md)。

---

## 三、任务文档模型

### 3.1 根字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskId` | string | 可选；Inbox 从文件名推断时可不填 |
| `serverUuid` | string | 优先；指定要操作哪一套服务器配置 |
| `serverName` | string | 与 `serverUuid` 二选一或互补；按**配置显示名**或 UUID 字符串匹配（忽略大小写） |
| `commands` | 数组 | **按顺序**执行；任一步失败则终止，后续不执行 |

**多服解析规则**：

- 若提供 `serverUuid` 且能加载到配置 → 使用该服。  
- 否则若提供 `serverName` → 在列表里按 `configName` 或 `serverUuid` 匹配。  
- 若两者都空 → **仅当全局只有 1 台服**时自动选中；否则任务失败并提示需指定服。

### 3.2 单条命令公共字段（`AutomationCommand`）

部分 `action` 会用到下列字段（未列出的 action 可忽略）：

| 字段 | 适用 action | 说明 |
|------|-------------|------|
| `missionTemplate` | `switch_mission` | Arma 任务模板名，如 `coop_01.Altis` |
| `missionDifficulty` | `switch_mission` | 默认 `3` |
| `restartAfterMission` | `switch_mission` | `true`：写 cfg 后若服在跑则先停再启；`false`：只改配置并写盘，不自动启服 |
| `modIds` | `download_mods` | Workshop 物品 ID 列表（ulong） |
| `enableModsOnServer` | `download_mods` | 默认 `true`：下载后把模组挂到**当前服配置**并保存 |
| `scanModsAfterDownload` | `download_mods` | 默认 `true`：成功后跑一次 `ModScannerService.Scan` 刷新扫描缓存 |
| `rconMissionName` | `rcon_mission` | BattlEye RCon `#mission` 使用的名称 |

说明：`AutomationCommand` 上的 `CopyBikeys` 等字段当前**未**在任务执行分支单独读取；是否复制 bikey 由**服务器配置**里的 `AutoCopyBikey` 决定（与 GUI 行为一致）。

---

## 四、各 `action` 行为详解

### 4.1 `status`（查询状态）

- **读盘/进程**：同步进程状态，读取当前配置中的**任务列表首项**、**标记为服模（`ServerMod`）的模组数量**。  
- **不写盘**、不启停进程。  
- **典型用途**：QQ 里问「服在不在」「现在什么图」。

### 4.2 `stop`（停服）

- 调用 `IServerProcessService.Stop`：结束本工具记录的 **arma3server** 进程（与 GUI「停止」同源）。  
- **不**自动保存 JSON；**不**改 `server.cfg`。  
- 若服未在跑，行为与 GUI 一致（以 `OperationResult` 为准）。

### 4.3 `start`（启服）

1. `config.SetTime()` + `configService.Save`：把**当前内存中的配置**写回 `{uuid}.json`。  
2. `processService.Start`：内部会 **写全量 cfg**（与 GUI 启动路径一致），再拉起进程。  

**注意**：自动化不会替你点 WinForms 各 Tab；若你只改过磁盘上的 JSON 而内存未刷新，应先通过 GUI 保存或在任务里组合 `save` / 其他写配置步骤（见 `write_cfg`）。

### 4.4 `restart`（重启）

顺序等价：`stop` → `write_cfg`（保存 JSON + 写 cfg）→ `start`。  
适合「改完配置后要整套生效」的场景。

### 4.5 `write_cfg` / `apply`（仅写服务端文件）

- 保存当前配置 JSON + `GameConfigWriter.WriteAll`（`server.cfg`、`basic.cfg`、profile、BattlEye 等，与工具「应用到服务器」一致）。  
- **不**启停进程（除非后续步骤另有 `start`/`stop`）。

### 4.6 `switch_mission`（切换任务）

1. 在 `ServerConfig.missions` 里把指定模板放到**列表首位**（不存在则插入；存在则提升并更新难度）。  
2. 保存 JSON + `WriteAll`。  
3. 若 `restartAfterMission == true`：若当前为运行中则 **Stop**，再 **Start**（会再次写 cfg 并启进程）。  
4. 若 `restartAfterMission == false`：**只改配置与文件**，不自动启服。

适用于「冷切换」与「只改下次启动图」两种策略。

### 4.7 `rcon_mission`（热换图，不关进程）

- 使用配置中的 **RConHost（空则 127.0.0.1）**、**RConPort**、**RConPassword** 连接 BattlEye RCon，发送 `LoadMission`（与 GUI RCon 页「加载任务」同类）。  
- **要求**：服在跑、RCon 可用、密码正确；且从 **A 机** 网络能连上 RCon 地址（本机服通常无问题）。  
- **注意**：与 `switch_mission` 不同，**不**改 `server.cfg` 里的任务列表；适合「同一进程内换图」。

### 4.8 `download_mods`（Workshop 下载 + 可选挂服）

1. `EnsureSteamCmdAvailable(true)`：必要时尝试拉取捆绑 SteamCMD。  
2. `DownloadWorkshopItems`：拼 SteamCMD 命令行，**在 A 机弹出/运行 SteamCMD 进程**；可能需 **Steam Guard** 人工确认。  
3. 若 `enableModsOnServer`：在 Workshop 根下解析路径，用 `ModEnablerService.ApplyHtmlMods` 把指定 ID 写入**当前服**的 `modsEntities` 并标为服模；若 `AutoCopyBikey` 为真则对服模跑 `BikeyService.CopyBikeysForMod`。  
4. 保存配置。  
5. 若 `scanModsAfterDownload`：执行 `ModScannerService.Scan`。  

**返回信息**会提示已启用数量及仍缺失的 ID（未下载完时目录不存在）。

### 4.9 `update_server`（更新专用服务器文件）

- 使用 SteamCMD 对**当前配置中的 `ServerDir`** 执行 `app_update 233780`（与 GUI「安装/更新专用服务器」同源逻辑）。  
- 需已在工具内配置 **Steam 账号** 与可用 **steamcmd.exe**。

### 4.10 `save`（仅保存工具 JSON）

- 仅 `SetTime` + `configService.Save`，**不写** `server.cfg` 等游戏文件。  
- 用于编排任务中「先持久化内存改动」的步骤（若未来扩展了改配置的 API）。

### 4.11 `help`（帮助文本）

- 返回内置简短说明字符串，供脚本或 OpenClaw 展示。

---

## 五、`ServerAutomationStatus` 字段含义（`status` / API）

| 字段 | 含义 |
|------|------|
| `configName` | 工具里显示的服务器配置名 |
| `serverDir` | 当前配置绑定的服务器安装目录 |
| `runState` | `Stopped` / `Running` / `Unknown`（与 `ServerRunState` 映射） |
| `processId` | 工具记录的进程 PID（可能为 0） |
| `activeMissionTemplate` | **配置中任务列表第一项**的模板名（非 RCon 实时查询） |
| `enabledModCount` | 当前配置里 **`ServerMod == true`** 的模组条目数 |

---

## 六、并发、安全与运维边界

| 项 | 说明 |
|----|------|
| **任务串行** | `ExecuteTaskAsync` 内全局锁；多路 QQ/脚本同时下命令会排队，避免双写。 |
| **与 WinForms** | 不建议同一台机同时用 GUI 与 Agent 抢同一服；易状态不一致。 |
| **鉴权** | HTTP 使用 Bearer `apiToken`；远程时务必 **TLS 或专线/VPN** + **IP 白名单**（仅 B）。 |
| **QQ 权限** | 谁能在群里「重启服」应在 **OpenClaw** 侧配置；Agent 不识别 QQ 号。 |
| **敏感信息** | 不要把 `apiToken`、Steam 密码、RCon 明文打进公网 LLM 或群公告。 |

---

## 七、当前未覆盖但可扩展的能力

以下能力在 **WinForms / Application** 里已有，但 **尚未** 暴露为独立 `action`（需要可再加 JSON 命令或专用 API）：

| 方向 | 说明 |
|------|------|
| 改端口、难度、模组勾选等**细粒度 JSON 字段** | 需扩展任务 schema 或直接 PATCH 配置 API |
| **Quartz 定时任务** 增删改 | 有 `ISchedulerService`，未接 Agent |
| **RCon 踢人、封禁、广播** | 有 `IRconService`，未接 Agent |
| **SteamCMD 仅下载 steamcmd 本体** | UI 有封装，Agent 未单独暴露 |
| **监控数据查询 / 导出** | 有 `MonitoringQueryService` 等，未接 Agent |

---

## 八、相关文档索引

| 文档 | 内容 |
|------|------|
| [agent-channels.md](agent-channels.md) | HTTP 路径、鉴权、JSON 示例、Inbox |
| [openclaw-integration.md](openclaw-integration.md) | OpenClaw + Skill 总览 |
| [deployment-ab-openclaw.md](deployment-ab-openclaw.md) | A 开服 + B OpenClaw + QQ 接 B |
| [skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md) | 给模型的操作说明 |

---

*若行为与代码不一致，以 `src/Arma3ServerTools.Application/Automation/ServerAutomationService.cs` 为准。*
