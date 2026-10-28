---
kind: error_handling
name: 错误处理：基于 try/catch + Fastify 钩子的轻量级模式
category: error_handling
scope:
    - '**'
source_files:
    - apps/desktop/src/main/index.ts
    - packages/service/src/app.ts
    - packages/service/src/api/sse.ts
    - packages/service/src/bans/bans-service.ts
    - packages/api-client/src/client.ts
    - packages/service/src/config/snapshot.ts
    - packages/service/src/config/game-config-writer.ts
---

## 1. 总体方案

仓库没有统一的错误类型库、全局异常处理器或中间件框架。各端采用各自惯用的轻量方式：

- **Electron 桌面端** (`apps/desktop/src/main/index.ts`)：大量 `try/catch` 包裹 I/O 与子进程操作，失败时通过 `dialog.showErrorBox` 弹出中文对话框；对子进程使用 `child.on('error')` / `child.on('exit')` 监听。
- **Fastify 后端** (`packages/service/src/app.ts`)：使用 Fastify 内置 logger (`app.log.error/info`)，在 `onRequest` 钩子里做认证校验并返回 `{ success: false, message: "Unauthorized" }`（401）；启动阶段用 `listenWithRetry` 重试 `EADDRINUSE`/`EACCES`/`EADDRNOTAVAIL`。
- **API 客户端** (`packages/api-client/src/client.ts`)：仅一处显式 `throw new Error("任务等待超时")`，其余调用走通用 fetch 封装。
- **Web 前端** (`packages/web/src/...`)：少量 `throw new Error("未连接")` 等直接抛错，由上层组件捕获。
- **.NET 监控扩展** (`DestinyServerMonitoring/`)：C# 代码中未见自定义 Error 类，主要依赖 .NET 原生异常。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `apps/desktop/src/main/index.ts` | Electron main 进程：IPC handler、子进程管理、UI 加载失败回退、`dialog.showErrorBox` 用户提示 |
| `packages/service/src/app.ts` | Fastify 服务装配：认证 `onRequest` 钩子、`listenWithRetry`、静态资源缺失日志 |
| `packages/service/src/api/sse.ts` | SSE 广播：对每个 client 的 `reply.raw.write` 单独 try/catch，断开后从 Map/Set 清理 |
| `packages/service/src/bans/bans-service.ts` | 封禁文件读写：catch 后返回 `{ success: boolean; message: string }` 结果对象 |
| `packages/api-client/src/client.ts` | API 客户端：`pollTask` 超时抛 `Error` |
| `packages/service/src/config/game-config-writer.ts` | 配置写入：多处 try/catch 包裹 fs 操作 |
| `packages/service/src/config/snapshot.ts` | 快照：不存在目录时 `throw new Error("配置不存在")` |

## 3. 架构与约定

### 3.1 无统一 Error 类型
仓库中没有 `errors/` 目录，也没有自定义 `class XxxError extends Error` 的类型定义。业务错误以以下形式表达：
- 直接 `throw new Error("...")`（如 `snapshot.ts`、`client.ts`）。
- 返回结构化结果对象，例如 `bans-service.ts` 的 `{ success: boolean; message: string }`。
- HTTP 层通过 Fastify reply 设置状态码并返回 JSON（如 401 + `{ success: false, message: "Unauthorized" }`）。

### 3.2 Fastify 认证钩子作为“前置校验”
`app.ts` 的 `addHook('onRequest', ...)` 是所有 `/api/v1/*` 请求的统一入口：
- 非 `/api/` 路径跳过鉴权（允许浏览器直接打开静态 UI）。
- `/api/v1/health` 和 `/api/v1/actions` 白名单放行。
- 支持三种 token 来源：`Authorization: Bearer <token>`、`X-Api-Key`、URL query `?token=`。
- 鉴权失败统一 `reply.status(401).send({ success: false, message: "Unauthorized" })`。

### 3.3 启动期容错
`listenWithRetry` 最多重试 15 次，每次间隔 1s，仅对 `EADDRINUSE`/`EACCES`/`EADDRNOTAVAIL` 可重试；超过次数后记录 `app.log.error(error)` 并重新抛出。

### 3.4 Electron 端错误呈现
桌面端不向上抛出异常，而是将错误转化为面向用户的中文对话框：
- 安装路径含中文 → `dialog.showErrorBox("安装路径错误", ...)`。
- Service 未找到 → `dialog.showErrorBox("服务未找到", ...)`。
- UI 加载失败 → `dialog.showErrorBox("界面加载失败", ...)`。
- Service 未就绪 → `dialog.showErrorBox("服务未就绪", ...)`。
- 渲染进程崩溃 → `dialog.showErrorBox("界面进程已退出", ...)`。

### 3.5 SSE 写失败的局部隔离
`sse.ts` 的 `broadcastSteamCmdOutput` 对每个 client 单独 try/catch，失败即从 `clients` Map 和 `steamCmdClients` Set 删除，不影响其他客户端；keepalive 定时器也独立 try/catch 并在 catch 中 `clearInterval`。

### 3.6 日志输出
后端统一使用 Fastify logger：`app.log.info` / `app.log.error`；部分底层模块（如 `monitoring/db.ts`）直接使用 `console.error` 输出 SQLite PRAGMA 失败信息。

## 4. 观察到的约定与约束

- **I/O 操作普遍用 try/catch 包裹**：`fs.readFileSync`、`fs.writeFileSync`、`execFileSync`、`process.kill` 等均在各自函数内捕获，通常返回默认值（空字符串、空数组）或 `{ success: false, message }`，而不是向上传播。
- **HTTP 层不抛业务异常**：Fastify 路由通过 `reply.status(...).send({...})` 返回结构化响应体，而非 throw。
- **SSE 写失败不中断广播**：单个 client 写失败只移除该 client，不会终止整个广播循环。
- **Electron 主进程不抛给用户**：所有 UI 相关错误都通过 `dialog.showErrorBox` 展示，避免未捕获异常导致窗口白屏。
- **认证失败统一 401 + JSON**：`onRequest` 钩子是唯一的鉴权出口，返回值固定为 `{ success: false, message: "Unauthorized" }`。
- **端口绑定失败自动重试**：`LISTEN_RETRY_CODES = new Set(["EADDRINUSE", "EACCES", "EADDRNOTAVAIL"])` 限定可重试的错误码，最多 15 次。
- **未发现 panic/recover 或全局 uncaughtException 处理器**：Electron 侧通过事件监听（`did-fail-load`、`render-process-gone`、`preload-error`）处理渲染进程异常，而非 try/catch 顶层兜底。
- **未定义统一的错误码枚举或错误分类体系**：错误信息以中文硬编码字符串形式散落在各处（如 `"任务等待超时"`、`"配置不存在"`、`"未连接"`）。