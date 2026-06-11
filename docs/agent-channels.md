# Agent 本地 API 与任务格式

> 宿主：`Arma3ServerTools.Agent.Host`（**Kestrel**）  
> **IM 通道（QQ / 微信等）请走 [OpenClaw 集成](openclaw-integration.md)**  
> **行为详解**：[agent-capabilities.md](agent-capabilities.md)

---

## AI 集成第一步

```http
GET /api/v1/actions
Authorization: Bearer <apiToken>
```

返回 `success/data/error/requestId` 包裹，其中 `data.taskActions`、`data.restEndpoints`、`data.fileUploads` 为权威能力清单。**不要猜测**不存在的 action 名（如 `get_config`、`rename`）。

---

## 启动 Agent

```powershell
dotnet run --project src/Arma3ServerTools.Agent.Host/Arma3ServerTools.Agent.Host.csproj -c Release
```

配置：`{UserData}/config/agent/settings.json`（WinForms **工具 → Agent / OpenClaw 设置** 可图形化编辑，并一键注册登录自动启动计划任务）。

---

## HTTP API 摘要

### 旧格式（兼容 `a3st-invoke.ps1`）

| 方法 | 路径 | 响应形状 |
|------|------|----------|
| GET | `/api/v1/health` | `{ success, service, ... }` |
| GET | `/api/v1/servers` | 裸数组 |
| GET | `/api/v1/servers/{uuid}/status` | 状态对象 |
| POST | `/api/v1/task` | 同步：`{ success, data: { success, message, steps } }`；异步：202 + `taskId` |

### 新格式（统一包裹）

```json
{ "success": true, "data": { }, "error": null, "requestId": "..." }
```

适用于：`/api/v1/actions`、config CRUD、文件上传、`/api/v1/tasks/{id}`、settings 等。

| 方法 | 路径 |
|------|------|
| GET | `/api/v1/actions` |
| GET/PUT/PATCH | `/api/v1/servers/{uuid}/config` |
| POST | `/api/v1/servers` · `.../clone` |
| DELETE | `/api/v1/servers/{uuid}` |
| PUT | `/api/v1/servers/{uuid}/rename` |
| GET/PUT | `/api/v1/settings/steamcmd`（密码脱敏） |
| POST | `/api/v1/servers/{uuid}/files/mod-list-html` |
| POST | `/api/v1/servers/{uuid}/files/mission-pbo` |
| GET | `/api/v1/servers/{uuid}/preflight` |
| GET | `/api/v1/servers/{uuid}/logs` · `.../logs/read` · `.../rpt` |
| GET | `/api/v1/servers/{uuid}/monitoring/summary` |
| GET | `/api/v1/steamcmd/log` |
| GET | `/api/v1/steamcmd/status` |
| POST | `/api/v1/steamcmd/stop` |
| POST | `/api/v1/task` + `"async": true` → 202 + `taskId` |
| GET | `/api/v1/tasks/{taskId}` |

```http
Authorization: Bearer <apiToken>
```

---

## 异步任务

```json
{
  "async": true,
  "serverUuid": "...",
  "commands": [ { "action": "restart" } ]
}
```

立即返回 `data.taskId`，轮询 `GET /api/v1/tasks/{taskId}` 直至 `status` 为 `Succeeded` 或 `Failed`。

PowerShell：`a3st-invoke.ps1 -TaskFile task.json -Async` 然后 `-WaitTaskId <id>`。

---

## 文件上传

| 类型 | 端点 | 说明 |
|------|------|------|
| HTML 模组列表 | `POST .../files/mod-list-html` | `multipart` 字段 `file` 或 raw body；`?mode=download\|enable\|download_and_enable`；`?writeCfg=true` |
| PBO 任务 | `POST .../files/mission-pbo` | `multipart` 字段 `file`；写入 `{ServerDir}/MPMissions/`；`?addToMissionList=true`；`?writeCfg=true` 写入游戏 cfg |

脚本：`-UploadModHtml`、`-UploadMissionPbo`（见 `scripts/openclaw/a3st-invoke.ps1`）。

---

## Inbox

| 路径 | 内容 |
|------|------|
| `inbox/*.json` | 任务 JSON（与 POST task 相同） |
| `inbox/missions/{serverUuid}/*.pbo` | 自动部署任务 |
| `inbox/mod-lists/{serverUuid}/*.html` | 自动导入模组 |

处理后移至 `processed/` 或 `failed/`。

---

## 配置读写

改任意工具配置字段（整份 JSON 用 PUT；部分字段用 PATCH 合并）：

```http
GET   /api/v1/servers/{uuid}/config
PUT   /api/v1/servers/{uuid}/config
PATCH /api/v1/servers/{uuid}/config
```

PATCH 示例（只改服名与人数，无需发送整份配置）：

```json
{
  "ServerConfig": {
    "HostName": "新服名",
    "MaxPlayers": 32
  }
}
```

保存后写入游戏目录：在 PUT/PATCH/文件上传请求加 query **`?writeCfg=true`**（`SaveAndWrite`，等同 GUI「写入服务器」）。

保存后若需写入 `server.cfg` 或重启，在 task 中追加 `write_cfg` / `restart`。详见 [agent-capabilities.md](agent-capabilities.md) §4.12 与配置相关 REST。

## 任务 JSON 示例

见 [agent-capabilities.md](agent-capabilities.md)。常用 `action`：`status`、`stop`、`start`、`restart`、`write_cfg`、`switch_mission`、`download_mods`、`read_logs`、`import_mods_html`、`ensure_steamcmd` 等；**完整列表以 `GET /api/v1/actions` 为准**。

---

## OpenClaw 快速链接

- [openclaw-integration.md](openclaw-integration.md)
- [skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md)
- `scripts/openclaw/a3st-invoke.ps1`
