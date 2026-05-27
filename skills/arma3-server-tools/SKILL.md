---
name: arma3-server-tools
description: Control Arma 3 dedicated server via local Arma3ServerTools Agent API (stop/start, missions, mods, SteamCMD). Use when the user manages A3 server through QQ/WeChat/chat or asks to switch mission, download workshop mods, or restart the server.
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

或 `GET /api/v1/actions`（Bearer Token）。**不存在** `get_config`、`rename`、`list_details` 等 task action；改配置用 `GET/PUT /api/v1/servers/{uuid}/config`。

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

## 模组 / SteamCMD（必读，避免拆命令）

### 禁止

- **禁止**把多个模组 ID 拆成多条 `download_mods`（例如每个 ID 一条 command）。主机端会多次启动 SteamCMD，极易卡在 Steam Guard。
- **禁止**在 `import_mods_html` 或上传 HTML 之后再对同一批 ID 发 `download_mods`。
- **禁止**把 HTML 拆成多次 `import_mods_html`（应一次传完整 HTML）。

### 正确做法

| 场景 | 做法 |
|------|------|
| 用户发 HTML 模组页 | **一次** `POST .../files/mod-list-html` 或 task 里 **一条** `import_mods_html`（`htmlContent` 放完整 HTML） |
| 用户给多个 Workshop ID | **一条** `download_mods`，`modIds` 数组包含全部 ID |
| 长耗时下载 | `"async": true`，轮询 `GET /api/v1/tasks/{taskId}`，看步骤里的 `steamCmdLog` |

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
| 查看状态 | `[{ "action": "status" }]` |
| 停服 | `[{ "action": "stop" }]` |
| 启服 | `[{ "action": "start" }]` |
| 重启 | `[{ "action": "restart" }]` |
| 换任务并重启 | `stop` → `switch_mission`（`missionTemplate`）→ `start` |
| 下载模组 ID | **一条** `download_mods`，`modIds` 为**全部** ID |
| HTML 模组列表 | **一条** `import_mods_html` 或 `-UploadModHtml`，不要跟 `download_mods` |
| 更新专用服务器 | `[{ "action": "update_server" }]` |
| 只写 cfg | `[{ "action": "write_cfg" }]` |
| 长耗时操作 | `"async": true` + 轮询 task |
| 看 RPT / 日志 | `-Command rpt` / `read_logs` |

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

- 执行后阅读 **`data.steps[].steamCmdLog`**（`POST /api/v1/task` 同步/异步、`GET /tasks/{id}` 相同结构）、上传 HTML 时的 `data.steamCmdLog`；以 **`data.success`** 判断成败。
- 失败时说明原因，不要泄露 `apiToken`。
- 模组下载务必说明是**一次 SteamCMD 处理 N 个模组**，不要让用户以为要逐个点确认。

## 排查清单（AI 自检）

| 症状 | 优先检查 |
|------|----------|
| 下载无输出/不知进度 | 是否 `async:true` 且轮询 task；是否看 `steps[].steamCmdLog` |
| Steam Guard | `captureSteamCmdOutput: false` 或 A 机手动验证；勿重复发 download_mods |
| 忙碌/卡住 | `GET /api/v1/steamcmd/status` → `stop_steamcmd` 或 `-Command steamcmd-stop` |
| HTML 只上一半 | **勿**在对话 JSON 里贴整页 HTML；用文件上传 `-UploadModHtml` |
| 多服失败 | 先 `list` / `GET /servers`，补 `serverUuid` |
| 在线人数 | 用 `rcon_players`，不是 `status` |
| 改配置不生效 | `PUT .../config` 后要有 `write_cfg` 或 `restart` |

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
