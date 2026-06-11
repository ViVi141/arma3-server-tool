---
name: arma3-server-tools
description: Control Arma 3 dedicated server via local Arma3ServerTools Agent API (stop/start, upload mission PBO, switch mission, mods, SteamCMD). Use when the user manages A3 server through QQ/WeChat/chat or asks to upload/send a .pbo mission file, switch mission, download workshop mods, or restart the server.
metadata:
  openclaw:
    requires:
      bins: ["powershell"]
    primaryEnv: A3ST_AGENT_TOKEN
---

# Arma3 Server Tools（经 OpenClaw 复用 IM 通道）

你已具备 **QQ / 微信 / Telegram 等通道**（由 OpenClaw Gateway 接入）。本 Skill 只负责调用 **本机** 上的 Arma3 Server Tools Agent API，不要在 Skill 里再实现 OneBot/QQ 协议。

**每次操作前先执行**（避免猜错 action 名）：

```powershell
powershell -ExecutionPolicy Bypass -File $script -Command actions
```

或 `GET /api/v1/actions`（Bearer Token）。**不存在** `get_config`、`rename`、`list_details` 等 task action；改配置用 `GET/PUT/PATCH /api/v1/servers/{uuid}/config`（部分字段优先 PATCH；`?writeCfg=true` 应用到服务器）。

**PBO 任务文件** 走 **文件上传** `POST .../files/mission-pbo`（或 `-UploadMissionPbo`），**不是** task `commands` 里的 action。HTML 模组列表同理走 `.../files/mod-list-html`。

**读→改→应用** 推荐 task 模板：

```json
{
  "serverUuid": "...",
  "writeCfgAfter": true,
  "restartAfter": true,
  "commands": [
    { "action": "enable_mods", "modIds": [450814997] }
  ]
}
```

## 安装包内路径（官方 Setup 已自带）

与 `Arma3ServerTools.exe` 同次安装（默认 `{app}` = `C:\Program Files\Arma3 Server Tools`）：

| 内容 | 路径 |
|------|------|
| Agent | `{app}\agent\Arma3ServerTools.Agent.Host.exe` |
| 本 Skill | `{app}\skills\arma3-server-tools\SKILL.md` |
| 调用脚本 | `{app}\scripts\openclaw\a3st-invoke.ps1` |
| Agent 配置示例 | `{app}\agent\agent-settings.example*.json` |

B 机 OpenClaw 的 `skills.load.extraDirs` 可指向 **A 安装目录下的 `skills`**（SMB 共享）或把 `skills\arma3-server-tools` 复制到 B 的 `~/.openclaw/skills/`。

## 前置条件

1. 在 **A 开服机**常驻运行 Agent（与 GUI 不要同时抢同一服）：

   ```powershell
   & "C:\Program Files\Arma3 Server Tools\agent\Arma3ServerTools.Agent.Host.exe"
   ```

   开发机：`dotnet run --project <repo>/src/Arma3ServerTools.Agent.Host/Arma3ServerTools.Agent.Host.csproj -c Release`

2. 配置 OpenClaw 环境变量（在 **运行 OpenClaw 的那台机器 B** 上设置）：

   ```json
   {
     "skills": {
       "entries": {
         "arma3-server-tools": {
           "env": {
             "A3ST_AGENT_URL": "http://<A开服机IP>:19580",
             "A3ST_AGENT_TOKEN": "<与 A 机 config/agent/settings.json 中 apiToken 一致>"
           }
         }
       }
     }
   }
   ```

   - **同机**：`A3ST_AGENT_URL` = `http://127.0.0.1:19580`（OpenClaw 与开服在同一台）
   - **双机 A+B（同一局域网）**：URL = `http://<A内网IP>:19580`；`allowedCallerIps` 填 B 内网 IP。
   - **双机 A+B（常不在同一局域网，走公网）**：优先 **Tailscale/ZeroTier** 虚拟内网 URL（如 `http://100.x.x.x:19580`）；或 A 的 **HTTPS 公网地址**（反向代理 + 强 Token）。A/B 往往**不能**用固定 `allowedCallerIps`（B 出口 IP 会变）。详见 `docs/deployment-ab-openclaw.md` §3。

3. 确保 OpenClaw 的 `exec` 在 **B 机** 可用，且 B 能访问 A 的 TCP 19580。

## 推荐调用方式（Windows）

**已安装（A 或 B 上若有完整安装目录）**：

```powershell
$script = "C:\Program Files\Arma3 Server Tools\scripts\openclaw\a3st-invoke.ps1"
powershell -ExecutionPolicy Bypass -File $script -Command status
powershell -ExecutionPolicy Bypass -File $script -Command restart -ServerName "我的服务器"
powershell -ExecutionPolicy Bypass -File $script -TaskFile "C:\path\to\task.json"
```

**Git 仓库开发**（路径替换为 clone 目录）：

```powershell
powershell -ExecutionPolicy Bypass -File "<repo>\scripts\openclaw\a3st-invoke.ps1" -Command status
```

探活（无需 Token）：`-Command health`。多服前先 `-Command list`。

### 异步长任务（SteamCMD / 重启链）

同步 `POST /api/v1/task` 会阻塞到结束，B 机 HTTP 可能超时。长耗时请：

```powershell
powershell -ExecutionPolicy Bypass -File $script -TaskFile task.json -Async
# 返回 data.taskId 后：
powershell -ExecutionPolicy Bypass -File $script -WaitTaskId <id> -ShowSteamCmdProgress
```

任务 JSON 根字段 `"async": true` 等效。轮询 `GET /api/v1/tasks/{taskId}` 直至 `status` 为 `Succeeded` / `Failed`；进度看 **`data.steps[].steamCmdLog`**。

Steam Guard 需 A 机弹窗时：任务 JSON 设 `"captureSteamCmdOutput": false`，或脚本 `-SteamCmdWindow`（仅 A 机桌面有效）。

**注意**：Agent **全局串行**执行 task，多路 IM 同时下命令会排队；不要用 GUI 与 Agent 同时改同一服。

### Inbox（A 机落盘，免 HTTP）

根目录：`%AppData%\Arma3ServerTools\config\agent\inbox\`

| 路径 | 内容 |
|------|------|
| `inbox\*.json` | 与 `POST /api/v1/task` 相同的任务 JSON |
| `inbox\missions\{serverUuid}\*.pbo` | 自动部署任务（等同 `addToMissionList=true`，**不**自动 `writeCfg`） |
| `inbox\mod-lists\{serverUuid}\*.html` | 自动导入模组（等同 `download_and_enable`） |

处理后移至 `processed\` 或 `failed\`。

### 配置读写（REST，不是 task action）

```powershell
powershell -ExecutionPolicy Bypass -File $script -Command get-config -ServerUuid "<uuid>"
powershell -ExecutionPolicy Bypass -File $script -Command put-config -ServerUuid "<uuid>" -ConfigFile "C:\path\server.json"
```

部分字段优先 `PATCH /api/v1/servers/{uuid}/config`（嵌套合并）。`PUT`/`PATCH`/文件上传可加 `?writeCfg=true` 一次写入游戏目录；脚本 `-UploadMissionPbo` 用 `-WriteCfg`。`put-config` **不会**自动 `writeCfg`，改完常需 task `write_cfg` 或 `restart`。

## 任务 PBO 上传（必读，不是 task action）

用户说「发任务」「传 PBO」「上传地图」「把这个任务文件发给服务器」时，指把 **`.pbo` 二进制文件** 部署到 A 开服机的 `{ServerDir}\MPMissions\`。**绝不是**把 PBO 内容或路径写进 task JSON 的 `commands`。

### OpenClaw / IM 收到用户 PBO 时（按此执行）

用户在 QQ / 微信 / Telegram 里 **发了 `.pbo` 附件**，或口头要求部署任务图时：

1. **先 `list`**（多服必填 `serverUuid`；单服可省略）。
2. **确认 PBO 本地路径**：OpenClaw 下载附件后，路径须在 **运行 `exec` 的 B 机** 上可读。手机/网页上的文件必须先落到 B 本地；若文件只在 A 机，可改放 A 的 Inbox（见下）而不是在 B 上 `-UploadMissionPbo`。
3. **上传 + 写配置**（推荐始终带 `-WriteCfg`）：

   ```powershell
   $script = "C:\Program Files\Arma3 Server Tools\scripts\openclaw\a3st-invoke.ps1"
   powershell -ExecutionPolicy Bypass -File $script `
     -UploadMissionPbo "<B机上的绝对路径\coop_01.Altis.pbo>" `
     -ServerUuid "<uuid>" `
     -WriteCfg
   ```

4. **按需重启**：
   - 用户要「立刻开这张图 / 换图开服」→ 再执行 `-Command restart -ServerUuid "<uuid>"`。
   - 仅「先传上去」→ 不上 `restart`，并告知：**服若在跑，当前仍是旧图**，需重启后才生效。
5. **回复用户**：看返回 JSON 的 `success`；成功时说明 `data.deploy.template`（任务名）、已写入 `MPMissions`；失败时转述 `message`，勿泄露 Token。

**不要**把「发 PBO」理解成 `POST /api/v1/task` 里的一条 command。

### 禁止

- **禁止**在 `commands` 里伪造「上传 PBO」的 action（没有 `upload_mission` / `upload_pbo`）。
- **禁止**只 `switch_mission` 而不先上传——`switch_mission` 只能切换**已在 MPMissions 里存在**的模板名。
- **禁止**上传后假定已换图：默认只落盘 + 写入工具任务列表；**未** `writeCfg` / **未** `restart` 时，运行中的服不会自动换图。

### 机制

| 步骤 | 说明 |
|------|------|
| 上传 | `multipart/form-data`，字段名 **`file`**；文件名须为**纯文件名**（如 `coop_01.Altis.pbo`），勿含 `..\` 或盘符路径 |
| 落盘 | `{ServerDir}\MPMissions\<文件名>.pbo`（同名会覆盖） |
| 列表 | `addToMissionList=true`（脚本默认）→ 写入工具配置并**置顶**为首选任务 |
| 配置名 | 列表里 `Template` 为**带 `.pbo` 的文件名**（如 `coop_01.Altis.pbo`）；写 `server.cfg` 时会去掉后缀 |
| 写 cfg | 查询参数 `writeCfg=true` → 等同 GUI「应用到服务器」（写 `server.cfg` 等） |
| 启服换图 | 上传并 `writeCfg` 后，再发 task：`restart`；或 `stop` → `start` |

上传并 `-WriteCfg` 后**通常不必**再 `switch_mission`，直接 `restart` 即可。若仍要 `switch_mission`，`missionTemplate` 须与配置列表中 **Template 完全一致**（上传后的项含 `.pbo` 后缀）。

单文件大小上限见 A 机 Agent 配置（默认约 500MB）。

### 推荐：脚本上传（OpenClaw `exec`）

先 `list` 拿到 `serverUuid`（多服必填）：

```powershell
$script = "C:\Program Files\Arma3 Server Tools\scripts\openclaw\a3st-invoke.ps1"
powershell -ExecutionPolicy Bypass -File $script -Command list
```

**只上传并写入配置 + server.cfg**（下次启动或重启后用新图）：

```powershell
powershell -ExecutionPolicy Bypass -File $script `
  -UploadMissionPbo "D:\missions\coop_01.Altis.pbo" `
  -ServerUuid "<uuid>" `
  -WriteCfg
```

**上传后立即换图开服**（两步，先上传再重启）：

```powershell
powershell -ExecutionPolicy Bypass -File $script `
  -UploadMissionPbo "D:\missions\coop_01.Altis.pbo" `
  -ServerUuid "<uuid>" `
  -WriteCfg
powershell -ExecutionPolicy Bypass -File $script -Command restart -ServerUuid "<uuid>"
```

或用单份 task JSON（上传已完成、模板已置顶时）：

```json
{
  "serverUuid": "<uuid>",
  "commands": [{ "action": "restart" }]
}
```

**热换图（不关进程）**：PBO 已在 `MPMissions` 后，用 task `rcon_mission`（需 RCon 可用），不是上传 API。

### HTTP（Bearer Token）

```http
POST /api/v1/servers/{uuid}/files/mission-pbo?addToMissionList=true&writeCfg=true&missionDifficulty=3
Authorization: Bearer <apiToken>
Content-Type: multipart/form-data

file=<.pbo>
```

### A 机 Inbox（B 机拿不到文件时）

将 PBO 复制到 A 机（共享盘 / 远程桌面 / 同机）：

`%AppData%\Arma3ServerTools\config\agent\inbox\missions\{serverUuid}\coop_01.Altis.pbo`

Agent 轮询后自动部署（等同 `addToMissionList=true`），**不会**自动 `writeCfg`；需要时再发 task：`write_cfg` 和/或 `restart`。

### 与 `switch_mission` 的区别

| 场景 | 做法 |
|------|------|
| 用户给了 **新 PBO 文件** | **先** `-UploadMissionPbo`（+ `-WriteCfg`），再按需 `restart` |
| 服务器里**已有**该 `.pbo`，只换图 | task：`switch_mission` + `missionTemplate`（完整名如 `coop_01.Altis`） |
| 服在跑、要不重启换图 | 先确保 PBO 在目录，再 `rcon_mission` |

## 模组 / SteamCMD（必读，避免拆命令）

### 禁止

- **禁止**把多个模组 ID 拆成多条 `download_mods`（例如每个 ID 一条 command）。主机端会多次启动 SteamCMD，极易卡在 Steam Guard。
- **禁止**在 `import_mods_html` 或上传 HTML 之后再对同一批 ID 发 `download_mods`。
- **禁止**把 HTML 拆成多次 `import_mods_html`（应一次传完整 HTML）。

### 正确做法

| 场景 | 做法 |
|------|------|
| 用户发 HTML 模组页 | **一次** `POST .../files/mod-list-html` 或 `-UploadModHtml`；或 Inbox 丢 `.html`；或 task **一条** `import_mods_html` |
| HTML 模式 | `mode` / `-ModHtmlMode`：`download`（只下）、`enable`（只启用已有）、`download_and_enable`（默认，推荐） |
| 用户给多个 Workshop ID | **一条** `download_mods`，`modIds` 数组包含全部 ID |
| 长耗时下载 | `"async": true` + `-Async` / 轮询 task；看 `steps[].steamCmdLog` |

### 默认捕获 SteamCMD 文本

任务 JSON **默认**会捕获 SteamCMD 输出（无需每条都写）。步骤结果含：

- `steamCmdLog` — 尾部控制台文本（可判断是在下载还是卡在 Steam Guard）
- `steamCmdLogFile` — 完整日志路径

若 `requiresSteamGuard` / 输出含 `Steam Guard`：告知用户到 A 机处理，或重试并设 `"captureSteamCmdOutput": false` 弹出 SteamCMD 窗口。

也可轮询：`GET /api/v1/steamcmd/log?tail=200`

### 示例：HTML 一次导入（推荐）

```json
{
  "async": true,
  "serverUuid": "<uuid>",
  "commands": [
    {
      "action": "import_mods_html",
      "htmlContent": "<完整 HTML 粘贴于此>",
      "htmlImportMode": "download_and_enable"
    }
  ]
}
```

### 示例：多个模组 ID 一次下载

```json
{
  "async": true,
  "serverUuid": "<uuid>",
  "commands": [
    {
      "action": "download_mods",
      "modIds": [450814997, 463939057, 123456789],
      "enableModsOnServer": true
    }
  ]
}
```

主机会自动：**合并**多条 `download_mods`（中间仅有 `status`/`read_logs` 等只读步骤时也会合并）；**去掉** `import_mods_html`（含下载）之后的重复 `download_mods`。仍请尽量只发一条命令。

**全局限制**：A 机任意时刻只能跑 **一个** SteamCMD（工具内互斥）。前一个未结束时后发请求会返回忙碌说明；交互窗口模式需用户关闭 SteamCMD 窗口后才可再次下载。

**卡住时终止 SteamCMD**：

```json
{ "commands": [{ "action": "stop_steamcmd" }] }
```

或 `POST /api/v1/steamcmd/stop`（无需 serverUuid）。会结束所有 `steamcmd.exe` 并释放工具锁。查询状态：`GET /api/v1/steamcmd/status` 或 `steamcmd_status`。

## 用户意图 → 任务 JSON

| 用户说法 | commands 建议 |
|----------|----------------|
| 查看状态 / 服在不在 | `[{ "action": "status" }]` 或 `-Command status`（**不是**在线人数） |
| 多少人在线 / 谁在玩 | `[{ "action": "rcon_players" }]`（服须运行且 RCon 可用） |
| 停服 | `[{ "action": "stop" }]` |
| 启服 | 先确保已 `write_cfg`；再 `[{ "action": "start" }]` |
| 重启 | `[{ "action": "restart" }]`（`stop` → `write_cfg` → `start`） |
| 换任务并重启（图已在 MPMissions） | `stop` → `switch_mission` → `write_cfg` → `start` |
| **上传/发送 PBO 任务文件** | **`-UploadMissionPbo`**（+ `-WriteCfg`）；再按需 `-Command restart`。**不是** task action |
| 发了一个 `.pbo` 并要立即开这张图 | 上传 + `-WriteCfg` → `restart`（或 `stop` + `start`） |
| 热换图（不关进程） | `[{ "action": "rcon_mission", "rconMissionName": "coop_01.Altis" }]` |
| 全服公告 | `[{ "action": "rcon_broadcast", "broadcastMessage": "..." }]` |
| 踢人 / 封禁 | `rcon_kick` + `playerId`；`rcon_ban` + `playerGuid`（先 `rcon_players`） |
| 下载模组 ID | **一条** `download_mods`，`modIds` 为**全部** ID |
| 启用 / 停用模组 | `enable_mods` / `disable_mods` + `modIds`；应用用 `writeCfgAfter` 或 `restartAfter` |
| 刷新模组扫描 | `[{ "action": "scan_mods" }]` |
| HTML 模组列表 | **一条** `import_mods_html` 或 `-UploadModHtml`，不要跟 `download_mods` |
| 更新专用服务器 | `[{ "action": "update_server" }]` |
| 启动前检查 | `[{ "action": "preflight" }]` 或 `GET .../preflight` |
| 只保存工具配置 | `[{ "action": "save" }]` |
| 只写游戏 cfg | `[{ "action": "write_cfg" }]` |
| 长耗时操作 | `"async": true` + 轮询 task |
| 看 RPT / 日志 | `-Command rpt` / `read_logs`（`logKind`: `rpt`/`battleye`/`all`） |

多服时在 JSON 中加 `serverName` 或 `serverUuid`。

## 切换任务示例

```json
{
  "serverName": "主服",
  "commands": [
    { "action": "stop" },
    {
      "action": "switch_mission",
      "missionTemplate": "coop_01.Altis",
      "missionDifficulty": 3,
      "restartAfterMission": false
    },
    { "action": "write_cfg" },
    { "action": "start" }
  ]
}
```

## 回复用户

- **Task**：看 **`data.success`** 与 **`data.steps[]`**（含 `steamCmdLog`）；异步先轮询 `GET /tasks/{id}` 到终态。
- **PBO 上传**：看 `data.deploy`（`template`、`fullPath`）；无 `steps`。
- **HTML 上传**：看 `data` 中的 `steamCmdLog` / `requiresSteamGuard`。
- **状态**：`status` 的 `activeMissionTemplate` 是**配置任务列表首项**，非 RCon 实时在跑的任务；在线人数用 `rcon_players`。
- 失败时说明原因，不要泄露 `apiToken`；RPT/SteamCMD 日志摘要即可，勿整段转发敏感行。
- 模组下载务必说明是**一次 SteamCMD 处理 N 个模组**，不要让用户以为要逐个点确认。

## 排查清单（AI 自检）

| 症状 | 优先检查 |
|------|----------|
| 连接被拒绝 / 超时 | A 机 Agent 是否运行；`remoteAccessEnabled`；防火墙 19580；B 的 `A3ST_AGENT_URL` |
| 401 / 403 | `A3ST_AGENT_TOKEN` 与 A 机 `apiToken`；`allowedCallerIps` 是否包含 B 出口（动态 IP 可留空 + 强 Token） |
| 下载无输出/不知进度 | 是否 `async:true` 且轮询 task；是否看 `steps[].steamCmdLog` |
| HTTP 超时但任务可能仍在跑 | 改 `async:true` + `-WaitTaskId`；勿重复发相同下载 |
| Steam Guard | `captureSteamCmdOutput: false` 或 A 机手动验证；勿重复发 download_mods |
| 忙碌/卡住 | `GET /api/v1/steamcmd/status` → `stop_steamcmd` 或 `-Command steamcmd-stop` |
| HTML 只上一半 | **勿**在对话 JSON 里贴整页 HTML；用 `-UploadModHtml` 或 Inbox |
| 传了 PBO 但服没换图 | 是否 `-WriteCfg`；运行中是否发了 `restart`；勿只用 `switch_mission` 而未上传 |
| switch_mission 无效 | `missionTemplate` 是否与配置列表 **Template 完全一致**（上传项含 `.pbo`） |
| PBO 路径在 B 机、Agent 在 A 机 | B 的 `exec` 路径须可读；或拷到 A 的 Inbox |
| 多服失败 | 先 `list` / `GET /servers`，补 `serverUuid` |
| 在线人数 / 当前什么图 | `rcon_players` / RCon；`status` 仅配置与进程 |
| 启服报无 server.cfg | v1.5+ `start` 不自动写盘；先 `write_cfg` |
| 改配置不生效 | `write_cfg` / `writeCfgAfter` / REST `?writeCfg=true`；运行中还需 `restart` |
| GUI 与 Agent 冲突 | 约定远程只用 Agent，或避免同时改同一服 |
| 停用模组 | `disable_mods` + `modIds`；应用用 `writeCfgAfter` 或 `restartAfter` |

完整说明见 [docs/ai-agent-pitfalls.md](../docs/ai-agent-pitfalls.md)。

## 参考

- 双机 / 公网：`docs/deployment-ab-openclaw.md`
- `docs/openclaw-integration.md`
- `docs/agent-channels.md`
- `docs/agent-capabilities.md`
- `docs/ai-agent-pitfalls.md` — **AI 常见问题审查（维护者）**

## 安全

- 仅通过 `A3ST_AGENT_URL` 调用 Agent API。
- 危险操作前向用户确认。
- 不要把 RCon/Steam 密码写进群聊。
