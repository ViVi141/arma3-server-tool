# Arma3 Server Tools v2 — 快速开始

> **当前主线**：`packages/service`（Node.js）+ `packages/web`（Vue 3）+ 可选 `apps/desktop`（Electron）  
> **版本**：v2.0.0-alpha  
> v1.x WinForms / C# Agent 见 [legacy/](legacy/) 与 [archive/](archive/)。

## 环境要求

- **Node.js** ≥ 20
- **开服机**：Windows（Arma 3 专用服务器）
- **控制端**：任意系统浏览器；本地文件夹选择需 Electron 桌面版

## 开发模式（Web + API）

在仓库根目录：

```powershell
npm install
npm run build:service
```

启动后端（默认 `http://127.0.0.1:19580`，数据目录 `.a3st-dev-data`）：

```powershell
$env:DATA_DIR = "c:\path\to\arma3-server-tool\.a3st-dev-data"
node packages\service\dist\index.js
```

或使用：

```powershell
npm run start:service
```

另开终端启动前端（默认 `http://localhost:5173`，API 经 Vite 代理到 19580）：

```powershell
npm run dev:web
```

说明：`npm run dev:service` 仅编译 TypeScript（`tsc --watch`），**不会**自动监听 HTTP 端口。

## Electron 桌面版

```powershell
npm run build:service
npm run dev:desktop
```

桌面版会拉起本机 `@a3st/service` 并内嵌 Web 控制台。

## 首次使用

1. 浏览器打开前端 → 默认「本机」连接 → **连接**
2. **向导** 或 **基本** 页配置服务器目录
3. **SteamCMD** 页安装/更新 `arma3server`
4. 各设置页修改后 **保存**（写入配置包）
5. 工具栏 **写入游戏配置**（生成 `server.cfg` 等）
6. **开服检查** → **启动**

配置语义详见 [config-workflow.md](config-workflow.md#v2-web-界面对照)。

## 本地 CI

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ci-local.ps1
```

## 相关文档

- [config-workflow.md](config-workflow.md) — 保存 / 写入 / 启动
- [agent-capabilities.md](agent-capabilities.md) — HTTP API 与 task action
- [openclaw-integration.md](openclaw-integration.md) — OpenClaw / IM 集成（v2 使用 Node Service）
