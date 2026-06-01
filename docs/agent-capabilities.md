# Agent 自动化能力详解

> 执行核心：`Arma3ServerTools.Application.Automation.ServerAutomationService`  
> 网络入口：`Arma3ServerTools.Agent.Host`（Kestrel HTTP + 可选 Inbox 文件）  
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

- `processService.Start`：要求游戏目录已存在 `a3st_serverconfig/{uuid}/server.cfg`，**不再**自动 `WriteAll`。  
- **不**自动 `save` 工具配置包（v1.5+）。

**注意**：改配置后须先 `save`（工具包）+ `write_cfg`（游戏 cfg），或 GUI「应用到服务器目录」，再 `start`。自动化不会替你点 WinForms 各 Tab。

### 4.4 `restart`（重启）

顺序等价：`stop` → `write_cfg`（仅写游戏 cfg）→ `start`。  
若刚通过 `PUT /config` 或 GUI 改了设置，应先 `save` 再 `restart`，否则 `write_cfg` 使用的是磁盘上已保存的配置包。

### 4.5 `write_cfg` / `apply`（仅写游戏目录）

- `GameConfigWriter.WriteAll`（`server.cfg`、`basic.cfg`、profile、BattlEye 等；与 GUI「应用到服务器目录」写盘部分一致）。  
- **不**保存 A3ST 配置包、**不**启停进程（除非后续另有 `start`/`stop`）。

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
2. **默认**使用捕获模式：一次 SteamCMD 命令行包含**全部** `modIds`（`+workshop_download_item` 重复），同步捕获 stdout/stderr 到 `steamCmdLog`；可识别 **Steam Guard** 提示。  
3. 任务里**相邻多条** `download_mods` 会在执行前**自动合并**为一条（避免 AI 拆命令导致多次登录）。  
4. **全局互斥**：任意时刻仅允许 **一个** SteamCMD 进程（GUI / Agent / 初始化共用）；第二个请求会失败或等待当前任务结束。  
5. **强制终止**：`stop_steamcmd` / `kill_steamcmd` 或 `POST /api/v1/steamcmd/stop` — 结束所有 `steamcmd.exe` 并释放工具锁（无需指定服务器）。`steamcmd_status` / `GET /api/v1/steamcmd/status` 查询是否仍在跑。  
6. 若 `captureSteamCmdOutput: false`：弹出 SteamCMD 窗口，便于人工 Steam Guard；窗口关闭前其他 SteamCMD 请求会被拒绝。  
7. 若 `enableModsOnServer`：在 Workshop 根下解析路径，用 `ModEnablerService.ApplyHtmlMods` 把指定 ID 写入**当前服**的 `modsEntities` 并标为服模；若 `AutoCopyBikey` 为真则对服模跑 `BikeyService.CopyBikeysForMod`。  
8. 保存配置。  
9. 若 `scanModsAfterDownload`：执行 `ModScannerService.Scan`。  

**返回信息**会提示已启用数量及仍缺失的 ID（未下载完时目录不存在）。

**读取 SteamCMD 文本（v1.5+）**

| 方式 | 说明 |
|------|------|
| 默认（Agent 任务） | **默认捕获** stdout/stderr；步骤含 `steamCmdLog`、`steamCmdLogFile`；输出含 Steam Guard 时会标记失败并提示。 |
| `captureSteamCmdOutput: false` | 弹出 SteamCMD 窗口，便于人工 Steam Guard。 |
| `GET /api/v1/steamcmd/log?tail=300` | 轮询最近一次会话日志 + 安装目录 `logs/`。 |

无头捕获若卡在 Steam Guard：重试并设 `captureSteamCmdOutput: false`，或先在 A 机 GUI/SteamCMD 窗口完成一次登录。

### 4.9 `update_server`（更新专用服务器文件）

- 使用 SteamCMD 对**当前配置中的 `ServerDir`** 执行 `app_update 233780`（与 GUI「安装/更新专用服务器」同源逻辑）。  
- 需已在工具内配置 **Steam 账号** 与可用 **steamcmd.exe**。  
- 可与 `captureSteamCmdOutput: true` 配合，行为同 `download_mods` 的捕获模式。

### 4.10 `save`（仅保存 A3ST 配置包）

- `SetTime` + `configService.Save` → `config/{uuid}/` 配置包（含 `mods.json` 等），**不写** `server.cfg`。  
- 改配置后若需启服，通常再接 `write_cfg` 与 `start`。

### 4.11 `help`（帮助文本）

- 返回内置简短说明字符串，供脚本或 OpenClaw 展示。

### 4.12 `read_logs` / `read_rpt`（游戏日志与 RPT）

读取 Arma 3 专用服在磁盘上的日志（与 GUI「查看 RPT」同源 `RptLogService`）。

| 字段 / 参数 | 说明 |
|-------------|------|
| `logKind` | `rpt`（默认）、`battleye` / `be`、`all` / `latest`（按修改时间取最新一份） |
| `logTailLines` | 尾部行数，默认 200 |
| `logFileName` | 可选，仅**文件名**（须为 `ListLogFiles` 中出现的项，禁止 `..`） |

**搜索目录（概要）**

- RPT：`ServerDir`、`a3st_serverconfig/{uuid}/Users/{uuid}/` 等配置档案路径下的 `*.rpt`
- BattlEye：`ServerDir/BattlEye/`、配置档案下 `BattlEye/` 中的 `*.log` / `*.txt`（排除 `bans.txt`、BEServer*.cfg）

**REST（无需走 task）**

| 端点 | 说明 |
|------|------|
| `GET /api/v1/servers/{uuid}/logs?kind=all` | 列出可用日志文件 |
| `GET /api/v1/servers/{uuid}/logs/read?kind=rpt&tail=300` | 读取尾部内容 |
| `GET /api/v1/servers/{uuid}/logs/read?file=xxx.rpt&tail=100` | 按文件名读取 |
| `GET /api/v1/servers/{uuid}/rpt?tail=200` | 兼容旧路径，等同 `kind=rpt` |

任务步骤成功时返回 `gameLogPath`、`gameLogContent`（完整尾部文本，注意勿把敏感行转发到公网 IM）。

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

## 七、Agent API 概览与待扩展

**已暴露**（见 `GET /api/v1/actions`）：

- 配置：`GET/PUT /api/v1/servers/{uuid}/config`、服务器 CRUD
- 文件：`POST .../files/mod-list-html`、`POST .../files/mission-pbo`
- 开服：`ensure_steamcmd`、`install_dedicated_server`、`create_server`、`first_server_setup`、`preflight`
- RCon：`rcon_players`、`rcon_kick`、`rcon_ban`、`rcon_broadcast`、`rcon_lock`、`rcon_unlock`
- 模组：`scan_mods`、`enable_mods`、`import_mods_html`
- 定时/封禁：`sync_cron_jobs`、`local_ban_add`、`local_ban_remove`
- 监控只读：`GET .../monitoring/summary`
- 游戏日志：`GET .../logs`（列表）、`GET .../logs/read`、`GET .../rpt`（等同读最新 RPT）；task：`read_logs`、`read_rpt`
- 异步：`POST /api/v1/task` + `"async": true`，`GET /api/v1/tasks/{taskId}`

**AI 易踩坑（完整表）**：见 [ai-agent-pitfalls.md](ai-agent-pitfalls.md)。

**仍建议后续迭代**：

| 方向 | 说明 |
|------|------|
| JSON Merge **PATCH** 配置 | 当前为 PUT 整份；AI 可 GET→改→PUT |
| 大 HTML 勿塞进 task JSON | 用 `POST .../mod-list-html` 或 Inbox，避免 IM/模型截断 |
| 监控 CSV/HTML **导出** REST | Application 有导出服务，未单独挂端点 |
| RCon 运行时改密 | GUI 有，Agent 未暴露 |

---

## 八、相关文档索引

| 文档 | 内容 |
|------|------|
| [agent-channels.md](agent-channels.md) | HTTP 路径、鉴权、配置 GET/PUT、Inbox |
| [README.md](README.md) | 文档索引 |
| [openclaw-integration.md](openclaw-integration.md) | OpenClaw + Skill 总览 |
| [deployment-ab-openclaw.md](deployment-ab-openclaw.md) | A 开服 + B OpenClaw + QQ 接 B |
| [skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md) | 给模型的操作说明 |

---

*若行为与代码不一致，以 `src/Arma3ServerTools.Application/Automation/ServerAutomationService.cs` 为准。*
