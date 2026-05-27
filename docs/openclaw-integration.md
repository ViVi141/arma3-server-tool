# OpenClaw 集成指南（复用已有 IM 通道）

> 分支：`agent` · 执行组件：`Arma3ServerTools.Agent.Host`（运行在 **开服机**）

若你已部署 **OpenClaw**（或同类 Gateway + 多通道 Agent），**不必**在本仓库再接 NapCat / go-cqhttp。QQ、微信、Telegram、Discord 等由 OpenClaw 统一接入；开服工具提供 **HTTP 自动化 API**。

**双机拓扑（A 开服 / B 跑 OpenClaw 且 QQ 接在 B）** 见 **[deployment-ab-openclaw.md](deployment-ab-openclaw.md)**（必读）。A/B **常不在同一局域网** 时，见该文档 **§3**（Tailscale / 反向隧道 / 公网 HTTPS + 强 Token），不要假设 `192.168.x.x` 互通。

**Agent 能做什么、每个动作含义与限制** 见 **[agent-capabilities.md](agent-capabilities.md)**。

---

## 架构

```text
你（QQ，连在 B 机机器人上）
    → B：OpenClaw Gateway（QQ 通道 + 会话）
        → LLM + Skill「arma3-server-tools」
            → exec: a3st-invoke.ps1
                → http://<A机IP>:19580/api/v1/*
                    → A：Agent → 停服 / 换任务 / 下载模组 …
```

| 层级 | 职责 |
|------|------|
| **OpenClaw** | IM 收发、权限、多轮对话、用户确认 |
| **本仓库 Skill** | 把自然语言变成任务 JSON，调用脚本 |
| **Agent.Host** | 执行与 WinForms 相同的 Application 逻辑 |

---

## 1. 部署 Agent（开服机）

```powershell
dotnet build src/Arma3ServerTools.Agent.Host/Arma3ServerTools.Agent.Host.csproj -c Release
dotnet run --project src/Arma3ServerTools.Agent.Host/Arma3ServerTools.Agent.Host.csproj -c Release
```

首次运行生成 `{UserData}/config/agent/settings.json`，记下 `http.apiToken`。

Windows URL 预留（若启动失败）：

```powershell
netsh http add urlacl url=http://127.0.0.1:19580/ user=Everyone
```

**不要**与 WinForms 主程序同时对同一服务器启停。

---

## 2. 安装 OpenClaw Skill

将本仓库 Skill 目录加入 OpenClaw 配置（`~/.openclaw/openclaw.json`）：

```json5
{
  skills: {
    load: {
      extraDirs: ["C:/Users/你/Desktop/arma3-server-tool/skills"],
    },
    entries: {
      "arma3-server-tools": {
        enabled: true,
        env: {
          A3ST_AGENT_TOKEN: "与 settings.json 中 apiToken 一致",
          A3ST_AGENT_URL: "http://127.0.0.1:19580",
        },
      },
    },
  },
}
```

也可复制 `skills/arma3-server-tools` 到 `~/.openclaw/skills/`。

Skill 说明见 [skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md)。

---

## 3. 确保 OpenClaw 能执行本机命令

Skill 通过 **`exec`** 调用：

```powershell
powershell -ExecutionPolicy Bypass -File "<repo>/scripts/openclaw/a3st-invoke.ps1" -Command status
```

在 OpenClaw 配置中允许 `exec`（及访问本机路径），并保证 Gateway 与 Agent **运行在同一台开服 Windows 机器**（或能访问 `127.0.0.1:19580` 的网络环境；生产环境建议仅本机）。

若使用 OpenClaw 的 **HTTP Tools Invoke**（`POST /tools/invoke`），也可在自定义工具里封装对上述脚本的调用，避免重复实现 IM 协议。参见 [OpenClaw Tools Invoke API](https://openclawcn.com/en/docs/gateway/tools-invoke-http-api/)。

---

## 4. 对话示例

用户在 QQ 对 OpenClaw 说：

> 把主服换成 coop_01.Altis 并重启

Agent 应（由 Skill 引导）：

1. 确认服务器名称（多服时）
2. 构造任务 JSON：`stop` → `switch_mission` → `write_cfg` → `start`
3. 执行 `a3st-invoke.ps1 -TaskJson '...'`
4. 将结果摘要回复到 QQ（OpenClaw 原有 channel 出站）

---

## 5. 可选：任务文件 + Inbox

除 HTTP 外，可将 JSON 放入：

```text
{UserData}/config/agent/inbox/*.json
```

Agent 会自动执行并移到 `processed/` / `failed/`。OpenClaw 也可用 `exec` 写入该目录，适合长任务编排。

---

## 6. 与「内置 QQ」方案对比

| 方式 | 说明 |
|------|------|
| **OpenClaw 复用通道（推荐）** | 一套 Gateway 管所有 IM；本工具只做 API |
| ~~Agent 内置 OneBot~~ | 已从 `agent` 分支移除，避免与 OpenClaw 重复维护 |

---

## 7. HTTP API 速查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 健康检查（无需 Token） |
| GET | `/api/v1/servers` | 服务器列表 |
| GET | `/api/v1/servers/{uuid}/status` | 状态 |
| POST | `/api/v1/task` | 执行 JSON 任务 |

鉴权：`Authorization: Bearer <apiToken>`

任务 JSON 字段见 [agent-channels.md](agent-channels.md)。

---

## 8. 安全建议

1. `apiToken` 只放在本机 OpenClaw 配置与环境变量，不要提交到 git。
2. Agent 只监听 `127.0.0.1`。
3. 在 OpenClaw 侧配置 channel 允许名单 / 群组策略，比在本工具重复实现 QQ 白名单更清晰。
4. 含 Steam/RCon 密码的操作勿把敏感配置贴进模型上下文。

---

## 9. 故障排查

| 现象 | 处理 |
|------|------|
| OpenClaw 无回复 | 查 Gateway 日志、channel 是否启用 |
| 脚本 401 | 核对 `A3ST_AGENT_TOKEN` 与 `settings.json` |
| 连接被拒绝 | Agent.Host 是否在跑、端口是否 19580 |
| 执行成功但服未动 | 是否 WinForms 与 Agent 同时操作；看 Agent 日志 |

---

*相关： [agent-channels.md](agent-channels.md)（API 与 action 列表）*
