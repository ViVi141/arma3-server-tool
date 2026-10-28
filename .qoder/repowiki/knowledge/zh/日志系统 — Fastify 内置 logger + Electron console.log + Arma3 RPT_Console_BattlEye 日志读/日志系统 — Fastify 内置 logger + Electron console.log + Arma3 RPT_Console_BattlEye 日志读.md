---
kind: logging_system
name: 日志系统 — Fastify 内置 logger + Electron console.log + Arma3 RPT/Console/BattlEye 日志读取
category: logging_system
scope:
    - '**'
source_files:
    - packages/service/src/app.ts
    - packages/service/src/index.ts
    - packages/service/src/logs/reader.ts
    - packages/service/src/logs/index.ts
    - apps/desktop/src/main/index.ts
    - packages/service/src/monitoring/db.ts
---

## 1. 使用的框架与方式

仓库包含三类不同的“日志”关注点，分别对应三个运行端：

- **后端服务（packages/service）**：使用 Fastify 的内置 logger（Pino），通过 `Fastify({ logger: true })` 启用，并通过 `app.log.info / app.log.error` 输出结构化日志。
- **桌面主进程（apps/desktop/src/main/index.ts）**：未引入第三方日志库，直接使用 Node.js 原生 `console.log / console.warn / console.error`；并将子进程（Node service）的 stdout/stderr 重定向到文件 `dataDir()/service.log`。
- **Arma3 服务器侧**：不产生本项目的应用日志，而是由 Arma3 引擎写入 `server_console.log`、`.rpt` 诊断文件和 BattlEye 日志，由本项目通过 `RptLogReader` 扫描和读取。

依赖清单中未发现 pino/winston/bunyan/debug 等第三方日志包——后端仅依赖 fastify、@fastify/cors、@fastify/multipart、croner、sql.js、undici。因此 Pino 是作为 Fastify 默认 logger 被隐式引入的。

## 2. 关键文件

- `packages/service/src/app.ts`：创建 Fastify 实例并开启 `logger: true`，所有业务日志通过 `app.log.info / app.log.error` 输出。
- `packages/service/src/index.ts`：服务入口，在 SIGINT/SIGTERM 中调用 `service.log.info("Shutting down...")`。
- `packages/service/src/logs/reader.ts`：`RptLogReader` 类，负责扫描和读取 Arma3 服务端产生的 `.rpt`、`server_console*.log`、BattlEye 日志。
- `packages/service/src/logs/index.ts`：导出 `RptLogReader` 及 `RptLogEntry` 类型。
- `apps/desktop/src/main/index.ts`：Electron 主进程日志（console.*）+ 将 Node service 子进程 stdio 重定向到 `service.log`。
- `packages/service/src/monitoring/db.ts`：直接 `console.error` 输出 SQLite WAL 初始化错误（绕过 Fastify logger，因为该模块可能早于 Fastify 启动）。 

## 3. 架构与约定

### 3.1 后端服务日志（Fastify/Pino）

- 在 `createService` 中通过 `Fastify({ logger: true })` 启用默认 Pino logger。
- 所有业务代码通过注入的 `app.log` 访问 logger，例如：
  - `app.log.error(error)`：监听失败重试时记录错误。
  - `app.log.error(...)`：Web UI root 缺失时记录错误。
  - `app.log.info(...)`：服务监听地址、Cron job 数量等生命周期事件。
- 没有自定义 logger 配置（如 transport、level、format），全部走 Pino 默认 JSON 行格式。
- 日志级别使用上以 `info`（正常流程）和 `error`（异常/不可恢复）为主，未见 `debug`/`warn` 的业务调用。

### 3.2 Electron 主进程日志

- 使用 `console.log / console.warn / console.error` 直接输出到终端或 Electron 开发者工具。
- 对子进程（Node service）采用“文件 sink”模式：打开 `dataDir()/service.log` 并以 append 模式写入，同时把 childProcess 的 stdout/stderr 都 fd 重定向到该文件（`stdio: ["ignore", serviceLogFd, serviceLogFd]`）。
- 提供 `readServiceLogTail()` 函数，从 `service.log` 末尾读取最多 25 行，用于向用户展示服务启动失败的摘要。
- Electron 自身错误（preload 失败、UI did-fail-load、render-process-gone）统一用 `console.error` 输出，并通过 `dialog.showErrorBox` 弹窗提示用户，同时附带 `service.log` 路径。

### 3.3 Arma3 服务端日志读取（RptLogReader）

`RptLogReader` 不是“写日志”，而是“读 Arma3 产生的日志”。它定义了三种 `LogKind`：

- `rpt`：扩展名为 `.rpt` 的诊断文件。
- `console`：文件名匹配 `server_console*.log` 或 `server_*.log`（非 `.rpt`）。
- `battleye`：位于 `BattlEye/` 目录下的 `.log`/`.txt` 文件，排除 `beserver*` 和 `bans.txt`、`beserver_x64.cfg`、`beserver.cfg`。

搜索目录策略：

- 无 `serverUuid` 时只扫描 `serverDir`。
- 有 `serverUuid` 时额外扫描 `<serverDir>/config/<uuid>` 和 `<serverDir>/config/<uuid>/Users/<uuid>`。
- BattlEye 额外扫描 `<serverDir>/BattlEye` 以及 profile 下的 `BattlEye` 子目录。
- `listLogs` 返回按 `lastModified` 倒序排序的文件列表，去重基于 `fs.realpathSync` 后的真实路径。
- `resolveAllowedLogPath` 通过已发现的日志白名单校验外部传入的 `fileName`，防止任意路径读取。

## 4. 约定与约束

- **后端服务必须通过 `app.log` 输出日志**：所有业务日志集中在 `packages/service/src/app.ts` 中通过 Fastify 装饰器提供的 `app.log` 访问，未见其他 logger 实例化点。
- **Electron 主进程不使用结构化日志库**：主进程日志全部为 `console.*` 字符串拼接，无上下文字段（如 pid、timestamp、component）。
- **Node service 标准输出统一落盘**：Electron 通过 `fs.openSync(logPath, "a")` 打开 `service.log`，并把 childProcess 的 stdout/stderr 都 fd 重定向到该文件；关闭服务时显式 `fs.closeSync(serviceLogFd)`。
- **Arma3 日志分类由 `LogKind` 枚举强制**：`rpt | battleye | console`，新增日志类型需要修改该联合类型及 `collectFiles` 分支。
- **日志文件命名约定**：控制台日志期望形如 `server_console.log` 或 `server_<uuid>.log`（见 `isConsoleLogFileName` 与 `findActiveConsoleLog` 中的偏好逻辑）；RPT 日志以 `.rpt` 后缀识别；BattlEye 日志排除 `beserver*` 前缀。
- **日志读取存在安全白名单**：`resolveAllowedLogPath` 要求目标文件必须先出现在 `listLogs` 的结果集中，再允许读取，避免任意文件读取。
- **SQLite 监控数据库初始化错误绕过 Fastify logger**：`monitoring/db.ts` 在 Fastify 实例化之前执行，因此直接使用 `console.error` 输出错误（见第 61、66、75 行）。
- **无全局日志级别开关**：项目没有通过环境变量控制 Pino level 或 console 过滤；日志输出行为由运行环境（终端 vs Electron devtools vs 文件）决定。