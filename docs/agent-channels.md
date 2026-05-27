# Agent 本地 API 与任务格式

> 分支：`agent` · 宿主：`Arma3ServerTools.Agent.Host`  
> **IM 通道（QQ / 微信等）请走 [OpenClaw 集成](openclaw-integration.md)**，本页只描述本地 API。  
> **各命令在进程/磁盘上的具体行为、前置条件与未覆盖能力** 见 **[agent-capabilities.md](agent-capabilities.md)**。

---

## 角色划分

| 组件 | 职责 |
|------|------|
| **OpenClaw（或同类）** | 已部署的 Gateway：接入 QQ/微信/Telegram、对话、权限 |
| **Skill `arma3-server-tools`** | 将用户意图转为任务 JSON，调用 `scripts/openclaw/a3st-invoke.ps1` |
| **Agent.Host** | 本机 HTTP + inbox，执行开服操作 |

---

## 启动 Agent

```powershell
dotnet run --project src/Arma3ServerTools.Agent.Host/Arma3ServerTools.Agent.Host.csproj -c Release
```

配置：`{UserData}/config/agent/settings.json`（仅 `http` + `inbox`）。

---

## HTTP API

| 方法 | 路径 | 鉴权 |
|------|------|------|
| GET | `/api/v1/health` | 无 |
| GET | `/api/v1/servers` | Bearer |
| GET | `/api/v1/servers/{uuid}/status` | Bearer |
| POST | `/api/v1/task` | Bearer |

```http
Authorization: Bearer <apiToken>
```

---

## 任务 JSON

### 切换任务并重启

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

### 下载并启用模组

```json
{
  "serverUuid": "你的UUID",
  "commands": [
    {
      "action": "download_mods",
      "modIds": [450814997, 463939057],
      "enableModsOnServer": true
    },
    { "action": "restart" }
  ]
}
```

### `action` 列表

| action | 说明 |
|--------|------|
| `status` | 查询状态 |
| `stop` | 停止进程 |
| `start` | 保存并启动 |
| `restart` | 停服 → 写 cfg → 启服 |
| `write_cfg` / `apply` | 写入 server.cfg 等 |
| `switch_mission` | 改任务列表首项；`restartAfterMission` 控制是否重启 |
| `rcon_mission` | 在线 `#mission`（`rconMissionName`） |
| `download_mods` | SteamCMD 下载 Workshop（`modIds`） |
| `update_server` | 更新专用服务器文件 |
| `save` | 仅保存工具 JSON |
| `help` | 帮助文本 |

---

## 任务文件 Inbox

将 `.json` 放入 `{UserData}/config/agent/inbox/`，Agent 轮询执行后移至 `processed/` 或 `failed/`。

OpenClaw 可通过 `exec` 写入该目录，或由 `a3st-invoke.ps1 -TaskFile` 经 HTTP 提交。

---

## OpenClaw 快速链接

- 集成步骤：[openclaw-integration.md](openclaw-integration.md)
- Skill：[skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md)
- 脚本：`scripts/openclaw/a3st-invoke.ps1`
