# Arma3 Server Tools v2

跨平台 **Arma 3 专用服务器** 管理工具。全栈 **TypeScript** 实现。

- **前端**：Vue 3 + Element Plus（Web + Electron 桌面壳）
- **后端**：Node.js + Fastify + SQLite
- **当前版本**：v2.0.0-alpha.7
- **开服机**：Windows 或 Linux（Arma 3 专用服务器 + SteamCMD）；**Electron 桌面壳** 目前仅 Windows 打包
- **控制端**：任意系统浏览器；Linux 开服机可直接 `npm run start:service` + 浏览器

---

## 目录

- [项目来源](#项目来源)
- [主要功能](#主要功能)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [文档](#文档)
- [许可](#许可)

---

## 项目来源

| 角色 | 说明 |
|------|------|
| **维护者** | [ViVi141](https://github.com/ViVi141) |
| **上游** | [airmoer/arma3-server-tool](https://github.com/airmoer/arma3-server-tool) |
| **原作者** | destiny studio（Blue、七龙） |

v2 从 C# / WinForms 重构为 TypeScript 全栈。v1 历史说明见 [docs/archive/](docs/archive/)。

---

## 主要功能

- **服务器管理** — 多服并存、启停/重启、RPT 日志
- **BattlEye** — RCon V2 远程控制（踢人、封禁、广播）
- **模组管理** — Workshop 下载、扫描、Bikey 复制
- **SteamCMD** — 下载 steamcmd、安装/更新 Arma 3 服务器
- **HTTP API** — Fastify REST API，支持 Bearer 鉴权、远程控制
- **任务自动化** — 按序执行命令、异步轮询进度
- **监控统计** — SQLite 入库、趋势数据
- **定时任务** — cron 调度重启、统计采集

---

## 项目结构

```
arma3-server-tool/
├── packages/
│   ├── api-client/    # TypeScript API 客户端
│   ├── service/       # 后端服务（Fastify + SQLite + RCon）
│   └── web/           # Vue 3 控制面板
├── apps/
│   └── desktop/       # Electron 桌面壳
├── docs/              # 文档
├── mod/               # 监控模组资源
├── DestinyServerMonitoring/  # 监控 RVExtension 源码
├── scripts/           # 构建 / 部署脚本
├── skills/            # OpenClaw Agent 技能
└── package.json       # npm workspaces
```

---

## 快速开始

```powershell
npm install
npm run build:service
npm run start:service   # 后端 http://127.0.0.1:19580
```

另开终端：

```powershell
npm run dev:web         # 前端 http://localhost:5173
```

- `npm run dev:service` 仅为 TypeScript 编译监视，**不会**启动 HTTP 服务。
- 完整说明见 [docs/v2-quickstart.md](docs/v2-quickstart.md)。
- 桌面版：`npm run dev:desktop`（需先 `build:service`）。

---

## 文档

- [docs/README.md](docs/README.md) — 文档索引（**请先读 v2 章节**）
- [docs/v2-quickstart.md](docs/v2-quickstart.md) — v2 安装与开发
- [docs/architecture-v2.md](docs/architecture-v2.md) — v2 分层与前后端边界
- [docs/config-workflow.md](docs/config-workflow.md) — 配置保存/写入/启停语义
- [docs/agent-capabilities.md](docs/agent-capabilities.md) — API 能力说明
- [docs/agent-channels.md](docs/agent-channels.md) — 任务格式与端点

v1 WinForms 文档与发版清单见 [docs/archive/](docs/archive/)。

---

## 许可

Copyright (C) 2026 ViVi141. Based on original work copyright 2022 destiny studio (Blue, 七龙).

详见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
