# Arma3 Server Tools v2

跨平台 **Arma 3 专用服务器** 管理工具。全栈 **TypeScript**。

**当前版本：`v2.0.0-beta.1`（Beta）** — 阶段 2 能力已齐（换图、模组、远程主控）；接口与安装包仍可能随反馈微调。

| 角色 | 说明 |
|------|------|
| **开服机** | Windows 或 Linux（Dedicated + SteamCMD） |
| **控制端** | 浏览器 / Electron 桌面版 / Android 主控壳 |
| **后端** | Node.js + Fastify + SQLite（sql.js） |
| **前端** | Vue 3 + Element Plus + Pinia |

Linux 开服机可用 Release 中的便携包（内置 Web UI）：解压后配置 `a3st.env`，`bash start.sh` 即可用浏览器管理。

---

## 目录

- [主要功能](#主要功能)
- [获取与运行](#获取与运行)
- [项目结构](#项目结构)
- [文档](#文档)
- [项目来源](#项目来源)
- [许可](#许可)

---

## 主要功能

- **多实例管理** — 创建 / 克隆 / 启停 / 重启；配置包与游戏 cfg 两级保存
- **首服向导与开服检查** — 从零建服、启动前阻塞项提示
- **模组** — Workshop 扫描（浅扫加速）、下载、启用角色、Bikey 部署
- **任务与地图** — 换图、`mission` PBO 上传、任务列表
- **SteamCMD** — 下载 steamcmd、安装 / 更新 `arma3server`、Guard 提示
- **BattlEye RCon** — 玩家列表、踢人 / 封禁 / 广播（Windows / Linux）
- **运维** — 定时任务、维护计划、快照、RPT / 控制台日志
- **远程主控** — Bearer Token API；局域网或 Tailscale；OpenClaw 可对接
- **发布形态** — Windows Setup / win-unpacked；Linux `.tar.gz` 便携包；Android APK（主控壳）

---

## 获取与运行

### 使用发布包（推荐）

1. 打开 [Releases](https://github.com/ViVi141/arma3-server-tool/releases)
2. Windows：安装 `Arma3ServerTools-Setup-*.exe`，或解压 `*-win-unpacked-*.zip`
3. Linux：解压 `Arma3ServerTools-linux-*.tar.gz`，参见 [docs/linux-server.md](docs/linux-server.md)

### 开发模式

```powershell
npm install
npm run build:service
npm run start:service   # http://127.0.0.1:19580
```

另开终端：

```powershell
npm run dev:web         # http://localhost:5173
```

- `npm run dev:service` 只监视 TypeScript 编译，**不会**起 HTTP。
- 桌面版：`npm run build:service` 后 `npm run dev:desktop`。
- 提交前本地 CI：`powershell -ExecutionPolicy Bypass -File scripts/ci-local.ps1`
- 完整说明：[docs/v2-quickstart.md](docs/v2-quickstart.md)

---

## 项目结构

```
arma3-server-tool/
├── packages/
│   ├── api-client/    # 共享 API 客户端与类型
│   ├── service/       # Fastify 后端
│   └── web/           # Vue 控制台（Web / Electron / 手机共用）
├── apps/
│   ├── desktop/       # Electron 壳
│   └── mobile/        # Capacitor Android 壳
├── docs/              # 文档
├── scripts/           # 构建 / CI / Linux 打包
├── skills/            # OpenClaw Agent 技能
└── package.json       # npm workspaces
```

---

## 文档

| 文档 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | 文档索引 |
| [docs/v2-quickstart.md](docs/v2-quickstart.md) | 安装与开发 |
| [docs/linux-server.md](docs/linux-server.md) | Linux 开服与 systemd |
| [docs/config-workflow.md](docs/config-workflow.md) | 保存 / 写入 / 启停语义 |
| [docs/smoke-checklist.md](docs/smoke-checklist.md) | 冒烟验收清单 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 版本变更 |
| [docs/known-issues.md](docs/known-issues.md) | 已知问题 |

v1 WinForms 历史见 [docs/archive/](docs/archive/)。

---

## 项目来源

| 角色 | 说明 |
|------|------|
| **维护者** | [ViVi141](https://github.com/ViVi141) |
| **上游** | [airmoer/arma3-server-tool](https://github.com/airmoer/arma3-server-tool) |
| **原作者** | destiny studio（Blue、七龙） |

v2 从 C# / WinForms 重构为 TypeScript 全栈。

---

## 许可

Copyright (C) 2026 ViVi141. Based on original work copyright 2022 destiny studio (Blue, 七龙).

详见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
