# AI / OpenClaw 自动化常见问题审查

> 面向维护者与 Skill 编写者。能力清单以 `GET /api/v1/actions` 为准。

---

## 一、已缓解（v1.4.1+ 代码侧）

| 问题 | 对策 |
|------|------|
| 多条 `download_mods` 多次 SteamCMD | 合并 `download_mods`（中间仅 `status`/`read_logs` 等只读步骤可跨过）；`import_mods_html` 已下载后自动去掉后续 `download_mods` |
| 无 SteamCMD 文本 | 默认**捕获输出**，步骤含 `steamCmdLog` |
| HTML 后又 `download_mods` | Skill 禁止；应只用 `import_mods_html` 或上传 HTML |
| 并发多个 SteamCMD | **全局互斥锁** + `stop_steamcmd` 强制终止 |
| 猜错 action 名 | `GET /api/v1/actions`、Skill 明确禁止 `get_config` 等 |

---

## 二、仍高发：模型行为与通道限制

### 2.1 模组 / HTML

| 现象 | 原因 | AI 应怎么做 |
|------|------|-------------|
| HTML 不完整、只下到部分模组 | 对话里粘贴 HTML 被**截断**；或拆成多次 `import_mods_html` | **不要**把大段 HTML 塞进 task JSON；用 `POST .../files/mod-list-html`、`-UploadModHtml` 或 Inbox 丢文件 |
| 仍发起多次下载 | 模型习惯「一个 ID 一条命令」 | 一条 `download_mods` + 全量 `modIds`；见 Skill「禁止」节 |
| `import_mods_html` 后又 `enable_mods` | 模型分步推理 | `htmlImportMode: download_and_enable` 一次完成 |
| 下载完但服里没模组 | 只下载未启用，或磁盘路径未扫到 | 确认 `enableModsOnServer: true`；必要时 `scan_mods` |

### 2.2 Steam Guard / SteamCMD

| 现象 | 原因 | AI 应怎么做 |
|------|------|-------------|
| 捕获模式立刻失败，输出含 Steam Guard | 无头模式**无法点手机验证码** | 告知用户；任务设 `"captureSteamCmdOutput": false` 弹窗；或 A 机先手动登录一次 SteamCMD |
| 一直「忙碌」 | 前一个 SteamCMD 未结束或锁未释放 | `steamcmd_status` → `stop_steamcmd` → 再下载 |
| 用户已关窗口仍忙碌 | 锁未随进程释放（异常退出） | `POST /api/v1/steamcmd/stop` |
| 捕获超时 | 模组多、`steamCmdTimeoutSeconds` 不够 | 增大任务级超时（默认 3600）；`async: true` 后轮询 task |

### 2.3 任务与 API 形态

| 现象 | 原因 | AI 应怎么做 |
|------|------|-------------|
| 读不到 `steamCmdLog` | 未读 `data.steps` | 同步/异步 task 均看 **`data.steps[].steamCmdLog`** |
| 误判任务失败 | 只看 HTTP 状态码 | 同步 `POST /task` 返回 200 + `data.success`；失败时仍可能有 `data.steps` |
| 长任务 HTTP 超时 | 同步执行阻塞到 SteamCMD 结束 | 任务加 **`"async": true`**，脚本 `-Async` + `-WaitTaskId` |
| 多服报「未选择服务器」 | 未传 `serverUuid`/`serverName` 且配置多于 1 个 | 先 `GET /api/v1/servers` 或 `list`，再指定 |

### 2.4 状态误解

| 现象 | 原因 | AI 应怎么做 |
|------|------|-------------|
| 「多少人在线」不准 | `status` 是配置与进程 PID，**不是**实时人数 | 服在跑时用 `rcon_players` |
| 「当前什么图」不准 | `activeMissionTemplate` 是 **cfg 任务列表第一项**，非 RCon 实时任务 | 运行中用 RCon；或说明「配置里写的是 xxx」 |
| 重启后仍旧配置 | 只 `start` 未 `write_cfg`，或改 cfg 未保存 | 改配置用 `PUT .../config` 后 `write_cfg` / `restart` |

---

## 三、环境与部署

| 现象 | 原因 | AI 应怎么做 |
|------|------|-------------|
| 连接被拒绝 | Agent 未启、防火墙、Token 错 | 检查 A 机 Agent、`remoteAccessEnabled`、B 机 `A3ST_AGENT_*` |
| 401 / 403 | Token 或 IP 白名单 | 对齐 `settings.json` 的 `apiToken`、`allowedCallerIps` |
| Agent 与 GUI 同时操作 | 共用配置与进程表，**无文件锁** | 约定：远程只用 Agent，或停 GUI 写操作 |
| 路径含中文 | 工具拒绝 | 换英文路径（见 README） |
| Steam 未配置 | 无账号/目录 | `ensure_steamcmd` + 提醒用户在 GUI 配 Steam |

---

## 四、安全与合规（AI 必须遵守）

- 不要把 `apiToken`、Steam 密码、RCon 密码写入群聊或发给云端。
- `restart`、`update_server`、删服前**向用户确认**（除非用户已明确下令）。
- `steamCmdLog` / RPT 可能含路径与账号片段，回复用户时**摘要**即可。

---

## 五、推荐编排（给模型）

```text
1. GET /api/v1/actions（或 actions 命令）
2. 多服 → GET /api/v1/servers
3. 模组 HTML → POST mod-list-html 或 单条 import_mods_html（async）
4. 模组 ID 列表 → 单条 download_mods（async）
5. 轮询 GET /api/v1/tasks/{taskId}，读 steps[].steamCmdLog
6. 卡住 → GET steamcmd/status → POST steamcmd/stop → 重试或改 captureSteamCmdOutput:false
7. 需要启服/换图 → stop → switch_mission → write_cfg → start
```

---

## 六、后续可增强（尚未做）

| 项 | 说明 |
|----|------|
| 合并中间有 `stop`/`enable_mods` 等多条 `download_mods` | 有意保留多次 SteamCMD |
| 合并多条 `import_mods_html` | HTML 拼接易错，仍靠上传文件 |
| `PATCH` 单字段改配置 | 仍需 GET 整份再 PUT |
| 流式推送 SteamCMD 日志 | 仅轮询 log / task |
| OpenAPI 给模型 | 仅有 `GET /api/v1/actions` 能力表 |

---

## 相关文档

- [agent-capabilities.md](agent-capabilities.md) — 各 action 行为
- [agent-channels.md](agent-channels.md) — HTTP 与 JSON
- [skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md) — OpenClaw 必读
