# v2 架构说明

v2 采用 **控制端 UI + 被控端 Service** 的分层模型。本文说明「前后端分离」指什么、是否必要、推荐部署方式，以及 **web 壳层（ConsoleShell / ark 视觉）** 的结构。

## 三层，不是两套无关项目

| 包 | 角色 | 运行位置 |
|---|---|---|
| `@a3st/web` | Vue 控制台 UI | 浏览器 / Electron 窗口 |
| `@a3st/service` | Node 被控端（启停、配置、SteamCMD、日志） | 开服机或本机 |
| `@a3st/api-client` | 共享 HTTP 契约与类型 | 编译进 web；脚本/OpenClaw 也可直接用 |

Electron（`apps/desktop`）**不是第三套后端**：它 spawn 本机 service，并把 web 当作静态页加载。

## 「分离」到底分离了什么

1. **代码边界**：UI 不直接读写磁盘、不 spawn 进程 — 全部走 REST。
2. **进程边界**：开发时常见 `service :19580` + `web :5173` 两个进程。
3. **部署边界**：Linux 开服机（如 n100）往往 **只装 service**；控制端用任意 PC 浏览器连接。

这三层分离 **不等价于**「用户必须开两个终端、记两个端口」。部署上可以合并（见下）。

## 分离是否必要？

### 应该保留的

- **HTTP API 作为唯一业务边界** — 远程 n100、OpenClaw、未来多机管理都依赖它。
- **Monorepo + api-client** — 类型共享，避免 web 手写 fetch。
- **Service 可独立运行于 Linux/Windows** — 与 Electron 是否安装无关。

### 可以弱化的（不必为了「纯前后端分离」而坚持）

| 痛点 | 更务实的做法 |
|---|---|
| n100 上要单独起 Vite/静态站 | Service 可选托管 web 静态资源（同端口访问 UI + API） |
| Electron 本机仍走 HTTP 回环 | 可接受；换 IPC 收益小、破坏远程同一套客户端 |
| 连接页填 `127.0.0.1:19580` | Electron 默认可预填；合并部署后可用相对路径 `/` |

### 不建议做的

- **把 Vue 组件写进 service 或把 Node 逻辑塞进 web** — 远程场景与测试边界会立刻混乱。
- **为省 HTTP 而砍掉 api-client** — OpenClaw 与 E2E 仍需要稳定 REST 面。

## 推荐结论

> **保留逻辑分离（API + 分包），合并物理部署（可选）。**

- **开发**：继续 `service` + `dev:web` 双进程，调试清晰。
- **Linux 开服机**：仅 `@a3st/service` + 浏览器；或将 `web/dist` 交给 service 静态托管，用户只访问 `:19580`。
- **Electron**：壳 + 内嵌 web + 本机 service，对用户是一个应用。
- **远程控制**：控制端 web 指向 `http://<LAN-IP>:19580`，与是否 Electron 无关。

---

## Web 壳层 v2（ConsoleShell）

v2 控制台已从 VS Code 式三栏改为 **rail 模式导航 + 顶栏实例/操作条**。

### 布局

```
┌─ Topbar：品牌 · 实例下拉 · RELAY · 壳层/主题 · 连接 ─────────┐
├─ Rail ─┬─ 子导航 Tab（同模式多页时）────────────────────────────┤
│ 01 概览 │─ Actions：PROC / CFG / SYS（按模式与主题显隐）──────────┤
│ 02 部署 │─ 页面内容（ConsolePageLayout）─────────────────────────┤
│ …      │─ Status bar：目录 · 同步状态 ────────────────────────────┤
└────────┴──────────────────────────────────────────────────────────┘
```

### 模式 → 路由 tab

| 模式 | 子页 |
|---|---|
| 01 概览 | dashboard |
| 02 部署 | preflight, snapshots, scheduler |
| 03 工坊 | mods, steamcmd, missions |
| 04 日志 | logs, rcon, statistics |
| 05 配置 | basic, performance, network, security, difficulty, log, config |
| 06 系统 | bans, about |

配置见 `packages/web/src/config/console-modes.ts`。

### 关键组件

| 组件 | 作用 |
|---|---|
| `ConsoleShell.vue` | 顶栏 + rail + 子导航 + actions 插槽 + 底栏 |
| `ConsolePageLayout.vue` | 页内 toolbar / hint / 滚动区 |
| `DashboardHero.vue` | 概览 Hero（启停、读数） |
| `DeployOpsBar.vue` | 部署模式页顶栏集中启停 |
| `ArkTechPanel.vue` | 设置页面板（替代 fieldset） |
| `consoleActions` inject | 子页调用壳层启停/保存/向导 |

进入 `/console/*` 时隐藏全局 `App.vue` 顶栏，由 shell 接管。

---

## 视觉主题（classic / ark）

- **存储**：`localStorage` 键 `a3st-visual-theme`，默认 **`ark`**。
- **切换**：连接页顶栏或控制台 shell 顶栏「壳层」下拉。
- **实现**：`document.documentElement.dataset.visual = "classic" | "ark"`；样式见 `ark-visual.css`、`shell-v2.css`。
- **classic**：保留工具风密度，顶栏保留 PROC/CFG 按钮组。
- **ark**：对齐 [ark-ui-skill](https://github.com/Brandon030722/ark-ui-skill) moderate — 中性面 + 青色信号色；概览 Hero、部署条、Mods archive 表头、设置 `ArkTechPanel`。

**演示页**（mock，不接真实数据）：`#/demo`、`#/demo/ark` 等。

ark 改版 **不改变** Service API；仅 web 视图与 CSS。

---

## 相关文档

- [v2-quickstart.md](./v2-quickstart.md) — 本地双进程开发
- [linux-server.md](./linux-server.md) — 仅 service 部署
- [agent-capabilities.md](./agent-capabilities.md) — HTTP API 能力面
- [config-workflow.md](./config-workflow.md) — 保存 / 写入 / 启停语义
