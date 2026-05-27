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

## 用户意图 → 任务 JSON

将用户自然语言转为 `POST /api/v1/task` 的 JSON（或 `-TaskFile`）：

| 用户说法 | commands 建议 |
|----------|----------------|
| 查看状态 | `[{ "action": "status" }]` |
| 停服 | `[{ "action": "stop" }]` |
| 启服 | `[{ "action": "start" }]` |
| 重启 | `[{ "action": "restart" }]` |
| 换任务并重启 | `stop` → `switch_mission`（`missionTemplate`）→ `start` |
| 下载模组 ID | `{ "action": "download_mods", "modIds": [ ... ], "enableModsOnServer": true }` |
| 更新专用服务器 | `[{ "action": "update_server" }]` |
| 只写 cfg | `[{ "action": "write_cfg" }]` |
| 上传 HTML 模组列表 | `POST .../files/mod-list-html` 或 `-UploadModHtml` |
| 上传 PBO 任务 | `POST .../files/mission-pbo` 或 `-UploadMissionPbo` |
| 长耗时操作 | 任务 JSON 加 `"async": true`，再轮询 `/api/v1/tasks/{taskId}` |
| 看 RPT / 游戏日志 | `-Command rpt` 或 `-Command logs -LogKind battleye`；或 task `read_logs` / `read_rpt` |

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

- 执行后把脚本输出的 **最后一行 JSON** 或 `message` 字段用简短中文回复到当前 IM 会话。
- 失败时说明原因（Steam 未配置、服在运行、路径含中文等），不要泄露 `apiToken`。
- `download_mods` 可能需人工 Steam Guard，提醒用户看 SteamCMD 窗口。

## 参考

- 双机 / 公网互通：`docs/deployment-ab-openclaw.md`（安装包内见 `{app}\docs\` 若已复制，或 GitHub 仓库）
- `docs/openclaw-integration.md`
- 任务字段与 API：`docs/agent-channels.md`
- **各 action 行为、限制与未覆盖能力**：`docs/agent-capabilities.md`

## 安全

- 仅通过 `A3ST_AGENT_URL` 调用 Agent API（跨公网时优先 Tailscale 或 HTTPS，见 `deployment-ab-openclaw.md` §3）。
- 危险操作（restart、update_server）前用一句话向用户确认（除非用户已明确下令）。
- 不要把 RCon/Steam 密码写进群聊或发给云端模型。
