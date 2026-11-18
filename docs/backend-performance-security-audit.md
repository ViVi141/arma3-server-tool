# 后端（`@a3st/service`）性能热点、BUG 排查与安全稳定性审计报告

> 更新日期：2026-11-18  
> 目标工作区包：`@a3st/service`（`v0.1.0`，Fastify 5 + TypeScript + `sql.js` + `croner` + `undici`）  
> 验证基线：`npm run typecheck`（exit 0）、`npm -w @a3st/service run typecheck`（exit 0）、`npm -w @a3st/service run build`（exit 0）、`npm -w @a3st/service run test`（42 个测试文件、250 条用例全部通过）

## 目录

1. [概述与验证基线](#1-概述与验证基线)
2. [总览索引表](#2-总览索引表)
3. [性能热点详析（PERF-1 至 PERF-8）](#3-性能热点详析perf-1-至-perf-8)
4. [已发现 BUG 详析（BUG-1 至 BUG-15）](#4-已发现-bug-详析bug-1-至-bug-15)
5. [安全性与稳定性详析（SEC-1 至 SEC-7）](#5-安全性与稳定性详析sec-1-至-sec-7)
6. [后续演进路线图（Tier B Implementation Roadmap）](#6-后续演进路线图tier-b-implementation-roadmap)

---

## 1. 概述与验证基线

本次后端审计针对 `packages/service/src/**` 展开系统性静态排查与链路验证，共识别 **30** 项问题与优化点，包括：

- **性能热点（`PERF-1` 至 `PERF-8`）**：共 **8** 项
- **功能与可靠性缺陷（`BUG-1` 至 `BUG-15`）**：共 **15** 项
- **安全性与稳定性加固项（`SEC-1` 至 `SEC-7`）**：共 **7** 项

依据“直接收益 vs 架构影响/跨端兼容风险”原则，所有项目划分为两层处理策略：

- **Tier A Landed（已直接落地修复并附 Vitest 验证证据）**：
  - 性能热点：`PERF-1 (skipSize fast path)`、`PERF-2`、`PERF-5`
  - 功能 BUG：`BUG-1`、`BUG-2`、`BUG-3`、`BUG-4`、`BUG-5`、`BUG-6`、`BUG-7`、`BUG-9`、`BUG-10`、`BUG-11`、`BUG-13`、`BUG-14`
  - 安全加固：`SEC-1`、`SEC-2`、`SEC-3 (partial: ?token= 日志脱敏 + timingSafeEqual)`、`SEC-4`
- **Tier B Architectural Proposal（输出可落地的架构演进与加固设计方案）**：
  - 性能演进：`PERF-1 (full async/cache)`、`PERF-3`、`PERF-4`、`PERF-6`、`PERF-7`、`PERF-8`
  - 功能演进：`BUG-8`、`BUG-12`、`BUG-15`
  - 安全演进：`SEC-3 (Origin 白名单与回环 CSRF 防护)`、`SEC-5`、`SEC-6`、`SEC-7`

### 验证基线结果（全部修复与新增测试落地后）

| 检查项 | 命令 | 结果 |
|---|---|---|
| Monorepo 类型检查 | `npm run typecheck` | exit 0 |
| Service 类型检查 | `npm -w @a3st/service run typecheck` | exit 0 |
| Service 构建 | `npm -w @a3st/service run build` | exit 0 |
| Service 单元测试与集成测试 | `npm -w @a3st/service run test` | `42 passed (42)`、`250 passed (250)`、exit 0 |

---

## 2. 总览索引表

### 2.1 性能热点索引（`PERF-1` 至 `PERF-8`）

| ID | 严重度 / 优先级 | 主路径与符号 | 分层状态 |
|---|---|---|---|
| [PERF-1](#perf-1-modscanner-同步目录体积递归与-skipsize-快速路径) | High / P0 | `src/mods/scanner.ts` (`ModScanner.scan`, `summarizeBikeys`, `calculateSize`); `src/mods/bikey-service.ts` | **Tier A Landed** (`skipSize` 快速路径) + **Tier B Proposal** (异步 `fs.promises` + `mtimeMs` 缓存) |
| [PERF-2](#perf-2-monitoringdb-n1-全库导出落盘与事务批处理) | High / P0 | `src/monitoring/db.ts` (`batchInsertPlayers`, `recordCollectionTick`, `save`); `src/api/routes.ts`; `src/scheduling/cron-sync.ts` | **Tier A Landed** (单事务 + 单次 `save()`) + **Tier B Proposal** (30 天保留策略与节流刷盘) |
| [PERF-3](#perf-3-同步阻塞式进程与端口探测调用) | High / P1 | `src/process/identity.ts` (`isProcessRunning`, `getProcessExecutablePath`, `getProcessCommandLine`); `src/preflight/checker.ts`; `src/config/game-config-writer.ts` | **Tier B Architectural Proposal** (异步 `execFile` + 短 TTL 缓存) |
| [PERF-4](#perf-4-大体积文件上传全量内存缓冲) | Medium / P1 | `src/api/routes.ts` (`POST /servers/:uuid/files/mission-pbo`, `mod-list-html`) | **Tier B Architectural Proposal** (`stream.pipeline` 落盘临时文件 + 原子重命名) |
| [PERF-5](#perf-5-proxyagent-每次请求重复创建与连接池泄露) | Medium / P1 | `src/steamcmd/proxy-fetch.ts` (`proxyFetch`, `getProxyAgent`, `closeProxyAgents`) | **Tier A Landed** (按 `proxyUrl` 缓存复用 + `onClose` 清理) |
| [PERF-6](#perf-6-get-servers-全量加载配置与深拷贝热点) | Medium / P2 | `src/api/routes.ts` (`GET /servers`); `src/config/store.ts` (`ConfigStore.load`) | **Tier B Architectural Proposal** (manifest 摘要缓存 `serverDir`) |
| [PERF-7](#perf-7-asynctaskmanager-任务记录无限增长) | Low / P2 | `src/task/manager.ts` (`AsyncTaskManager`) | **Tier B Architectural Proposal** (基于 `completedAt` 的 TTL 与上限淘汰) |
| [PERF-8](#perf-8-steamcmd-压缩包同步阻塞解压) | Low / P2 | `src/steamcmd/manager.ts` (`extractSteamCmdWindowsArchive`, `extractSteamCmdLinuxArchive`) | **Tier B Architectural Proposal** (异步 `execFile` 替代 `execSync`) |

### 2.2 已发现 BUG 索引（`BUG-1` 至 `BUG-15`）

| ID | 严重度 / 优先级 | 主路径与符号 | 分层状态 |
|---|---|---|---|
| [BUG-1](#bug-1-waitforportready-误探-tcp-listen-导致每次开服固定挂起-45s) | Critical / P0 | `src/process/port-check.ts` (`isPortListening`, `parseProcNetUdp`, `waitForPortReady`); `src/scheduling/server-lifecycle.ts` (`startServer`) | **Tier A Landed** |
| [BUG-2](#bug-2-createservice-未等待-monitoringdb-异步初始化完成) | High / P0 | `src/app.ts` (`createService`); `src/monitoring/db.ts` (`MonitoringDb.init`) | **Tier A Landed** |
| [BUG-3](#bug-3-rcon_ban-与-rcon_mission-参数映射错位) | High / P0 | `src/api/routes.ts` (`executeCommand`); `src/types/task.ts` (`AutomationCommand`); `src/rcon/client.ts` | **Tier A Landed** |
| [BUG-4](#bug-4-rconclient-udp-分片重传重复拼接及连接错误定时器泄露) | High / P1 | `src/rcon/client.ts` (`RconClient.connect`, `handleCommandResponse`, `cleanup`) | **Tier A Landed** |
| [BUG-5](#bug-5-mod-list-html-缺少-texthtml-解析器且非字符串请求体触发-500) | High / P0 | `src/app.ts` (`createService`); `src/api/routes.ts` (`POST /servers/:uuid/files/mod-list-html`) | **Tier A Landed** |
| [BUG-6](#bug-6-put-serversuuidrename-未同步更新-configserverconfigname) | Medium / P1 | `src/api/routes.ts` (`PUT /servers/:uuid/rename`, `GET /servers`) | **Tier A Landed** |
| [BUG-7](#bug-7-post-serversuuidfilesmission-pbo-忽略-writecfgtrue) | Medium / P1 | `src/api/routes.ts` (`POST /servers/:uuid/files/mission-pbo`) | **Tier A Landed** |
| [BUG-8](#bug-8-enable_mods--disable_mods-与-roleentries-状态分叉) | Medium / P2 | `src/api/routes.ts` (`enable_mods`, `disable_mods`); `src/mods/enabler.ts`; `src/mods/mod-config-sync.ts`; `src/mods/scanner.ts` | **Tier B Architectural Proposal** |
| [BUG-9](#bug-9-steamcmd-linux-延迟子进程错误永久挂起与-windows-日志截断失效) | High / P1 | `src/steamcmd/console-capture.ts` (`spawnPipeCapture`, `spawnWindowsCaptured`, `readNewBytes`) | **Tier A Landed** |
| [BUG-10](#bug-10-无头客户端缺少-error-监听且服务关闭未回收残留进程) | High / P1 | `src/process/headless.ts` (`startHeadlessClient`, `stopAllHeadlessClients`); `src/app.ts` | **Tier A Landed** |
| [BUG-11](#bug-11-steamcmd-下载中断句柄与临时文件泄露及秒级日志文件名覆盖) | Medium / P1 | `src/steamcmd/manager.ts` (`ensureInstalledBody`, `formatSessionLogStamp`) | **Tier A Landed** |
| [BUG-12](#bug-12-workshop-api-响应使用定长切片与正则而非结构化-json-解析) | Medium / P2 | `src/steamcmd/workshop-api.ts` (`findModSegment`, `parseModDetails`) | **Tier B Architectural Proposal** |
| [BUG-13](#bug-13-fastify-缺少-onclose-资源回收与跨实例-sse-监听器累加) | High / P1 | `src/app.ts` (`createService`); `src/api/sse.ts` (`SseManager`); `src/monitoring/db.ts` (`close`) | **Tier A Landed** |
| [BUG-14](#bug-14-tailhours-参数缺少边界校验且-6-处-not_found-误返回-http-200) | Medium / P1 | `src/api/routes.ts` (`parsePositiveInt`, 6 个 `NOT_FOUND` 路由) | **Tier A Landed** |
| [BUG-15](#bug-15-restartoncrash-与-restartdelay-仅存配置字段而未实现崩溃守护) | Low / P2 | `src/types/config.ts` (`StartupConfigSection`); `src/process/manager.ts`; `src/scheduling/server-lifecycle.ts` | **Tier B Architectural Proposal** |

### 2.3 安全性与稳定性索引（`SEC-1` 至 `SEC-7`）

| ID | 严重度 / 优先级 | 主路径与符号 | 分层状态 |
|---|---|---|---|
| [SEC-1](#sec-1-pid-类型绕过与-execsync-powershell-命令注入) | Critical / P0 | `src/process/identity.ts` (`isValidPid`, `isProcessRunning`, `getProcessExecutablePath`, `getProcessCommandLine`, `verifyProcessIdentity`, `killProcessTree`); `src/process/manager.ts`; `src/api/routes.ts` (`sanitizeImportedProcessId`) | **Tier A Landed** |
| [SEC-2](#sec-2-steam-明文密码通过-sse-日志及会话文件泄露) | High / P0 | `src/steamcmd/arguments.ts` (`redactPasswordInArguments`, `redactSteamCmdConsoleChunk`); `src/steamcmd/console-capture.ts`; `src/steamcmd/manager.ts` (`runCapturedProcess`) | **Tier A Landed** |
| [SEC-3](#sec-3-pino-日志-token-泄露时序比较及-cors-策略加固) | High / P0 | `src/app.ts` (`redactQueryToken`, `safeTokenEquals`, `createService`, `@fastify/cors`); `src/api/sse.ts` | **Tier A Landed** (`?token=` 脱敏 + `timingSafeEqual`) + **Tier B Proposal** (Origin 白名单与 CSRF) |
| [SEC-4](#sec-4-uuid--snapshotid-路径穿越风险) | High / P0 | `src/util/upload-safety.ts` (`SAFE_ID_REGEX`, `isSafeId`, `assertSafeId`, `assertSafeSubdirPath`); `src/config/store.ts`; `src/config/snapshot.ts`; `src/config/game-config-writer.ts`; `src/logs/reader.ts`; `src/bans/bans-service.ts`; `src/api/routes.ts` | **Tier A Landed** |
| [SEC-5](#sec-5-自定义可执行路径与未校验启动参数风险) | High / P1 | `src/config/game-config-writer.ts` (`getServerExecutablePath`, `buildStartCommandLine`, `isSafeStartupExtraArg`) | **Tier B Architectural Proposal** |
| [SEC-6](#sec-6-服务抗滥用与进程稳定性防护限流schema配置原子写入及异常兜底) | Medium / P1 | `src/app.ts`; `src/api/sse.ts`; `src/config/store.ts`; `src/index.ts` | **Tier B Architectural Proposal** |
| [SEC-7](#sec-7-csv-导出换行注入与电子表格公式注入) | Medium / P2 | `src/monitoring/export.ts` (`csvEscape`, `buildPlayersCsv`) | **Tier B Architectural Proposal** |

---

## 3. 性能热点详析（`PERF-1` 至 `PERF-8`）

### PERF-1: ModScanner 同步目录体积递归与 `skipSize` 快速路径

- **ID**: `PERF-1`
- **严重度 / 优先级**: `High` / `P0`
- **源码路径**: `packages/service/src/mods/scanner.ts`、`packages/service/src/mods/mod-config-sync.ts`、`packages/service/src/mods/bikey-service.ts`、`packages/service/src/scheduling/server-lifecycle.ts`、`packages/service/src/process/headless.ts`、`packages/service/src/scheduling/mod-update-cron.ts`、`packages/service/src/api/routes.ts`
- **符号名称**: `ModScannerOptions`, `ModScanner.scan`, `ModScanner.summarizeBikeys`, `ModScanner.buildModMeta`, `ModScanner.calculateSize`, `buildModScanOptions`, `scanModsForConfig`
- **修复后行号**: `scanner.ts:L15-L27, L87-L98, L217, L313-L333`；`mod-config-sync.ts:L6-L31`；`server-lifecycle.ts:L148`；`headless.ts:L34`；`mod-update-cron.ts:L56`；`routes.ts:L487, L529, L604, L1076, L1567, L1627, L1673`
- **根因 / 瓶颈机制**: `ModScanner.buildModMeta` 在每次扫描模组时无条件同步调用 `calculateSize(modPath)`（通过 `fs.readdirSync(dirPath, { recursive: true })` 逐文件执行 `fs.statSync`）。当服务器加载上百个大型模组（数万个 `.pbo`/`.bisign` 文件）时，开服、无头客户端启动、定时模组检查、开服前检查（preflight）、诊断及 bikey 摘要等根本不读取 `sizeBytes` 的调用路径均会触发全盘同步递归遍历，阻塞 Node.js 事件循环达数秒。
- **分层状态**: `Tier A Landed`（`skipSize` 快速路径） + `Tier B Architectural Proposal`（异步扫描与 `mtimeMs` 缓存）
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 在 `ModScannerOptions`（`scanner.ts:L26`）新增 `skipSize?: boolean`（默认 `undefined`/`false`，保证 `GET /api/v1/servers/:uuid/mods` 仍返回完整 `sizeBytes`）。
    2. `ModScanner.buildModMeta`（`scanner.ts:L217`）改为 `sizeBytes: options.skipSize ? undefined : this.calculateSize(modPath)`。
    3. `ModScanner.summarizeBikeys`（`scanner.ts:L98`）固定透传 `skipSize: true`。
    4. `buildModScanOptions` 与 `scanModsForConfig`（`mod-config-sync.ts:L6-L31`）新增可选参数 `extra?: { skipSize?: boolean }`，并在 9 个非 UI 列表路径（`startServer`、`startHeadlessClient`、`runScheduledModUpdate`、`GET /preflight`、`GET /diagnostics`、`POST /mods/import-preview`、task `scan_mods`、`copy_bikeys`、`preflight`）传入 `{ skipSize: true }`，仅 `GET /servers/:uuid/mods`（`routes.ts:L529`）保留默认计算。
    5. **Vitest 验证**: `packages/service/src/mods/scanner.test.ts` — `"PERF-1 skipSize omits calculateSize and summarizeBikeys delegates with skipSize: true"` 断言 `skipSize: true` 与 `summarizeBikeys` 均不触发 `calculateSize`（`sizeBytes === undefined`），默认 `scan()` 仍正确返回 `2073` 字节。
  - **Tier B 架构优化方案**:
    1. 新增 `scanAsync(options)`，使用 `fs.promises.readdir` / `fs.promises.stat` 配合有限并发池（例如 `p-limit(8)`）替换同步 `readdirSync` / `statSync`。
    2. 在 `ModScanner` 与 `bikey-service.ts`（`inspectMod`）中基于 `(modPath, dirStat.mtimeMs, addonsDirMtimeMs)` 建立短期内存缓存（TTL 10~30s），避免连续点击体检/列表/开服时重复扫描同一批模组目录。

---

### PERF-2: `MonitoringDb` N+1 全库导出落盘与事务批处理

- **ID**: `PERF-2`
- **严重度 / 优先级**: `High` / `P0`
- **源码路径**: `packages/service/src/monitoring/db.ts`、`packages/service/src/api/routes.ts`、`packages/service/src/scheduling/cron-sync.ts`
- **符号名称**: `MonitoringDb.save`, `MonitoringDb.batchInsertPlayers`, `MonitoringDb.recordCollectionTick`, `POST /monitoring/collect`, `POST /servers/:uuid/monitoring/sync-players`, `syncCronJobsForServer`
- **修复后行号**: `db.ts:L102-L111, L141-L208`；`routes.ts:L776-L808, L822-L841`；`cron-sync.ts:L45-L73`
- **根因 / 瓶颈机制**: `sql.js` 运行于内存 WASM 实例，每次 `save()`（`db.ts:L102-L111`）均调用 `this.db.export()` 序列化整库并写入 `.tmp` 临时文件后重命名。此前 `POST /monitoring/collect`、`POST /servers/:uuid/monitoring/sync-players` 与 `monitoringCron` 定时采集在 `for (const player of players)` 循环内逐条调用 `recordPlayer()` 并再调用 `recordStats()`，60 名在线玩家单次采集会触发 `N+1 = 61` 次全库序列化与磁盘写入。此外 `batchInsertPlayers` 未包裹 SQLite 事务且未在空数组时早退。
- **分层状态**: `Tier A Landed`（单事务 + 单次 `save()`） + `Tier B Architectural Proposal`（数据保留策略与节流刷盘）
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 加固 `MonitoringDb.batchInsertPlayers`（`db.ts:L141-L167`）：空数组直接返回，使用 `BEGIN TRANSACTION` ... `COMMIT`（异常时 `ROLLBACK`、`finally` 中 `stmt.free()`），并在整批完成后仅调用 1 次 `this.save()`。
    2. 新增 `MonitoringDb.recordCollectionTick(serverUuid, playerCount, players, fps?)`（`db.ts:L169-L208`）：在同一个 SQLite 事务内原子写入 `a3st_statistics` 与全部在线玩家记录，整次采集仅执行 1 次 `this.save()`。
    3. 改造 `POST /monitoring/collect`（`routes.ts:L788-L804`）、`POST /servers/:uuid/monitoring/sync-players`（`routes.ts:L830-L839`）与 `syncCronJobsForServer` 监控任务（`cron-sync.ts:L60-L71`）使用 `recordCollectionTick` / `batchInsertPlayers`。
    4. **Vitest 验证**:
       - `packages/service/src/monitoring/db.test.ts` — `"PERF-2 batchInsertPlayers([]) is a no-op and non-empty batch writes disk once"`、`"PERF-2 recordCollectionTick persists stats and players with a single save()"`；
       - `packages/service/src/scheduling/cron-sync.test.ts` — `"uses recordCollectionTick once instead of N+1 recordPlayer/recordStats calls"`；
       - `packages/service/src/api/routes.test.ts` — `"PERF-2 /monitoring/collect and /monitoring/sync-players use batch persistence instead of N+1 recordPlayer"`。
  - **Tier B 架构优化方案**:
    1. 为 `a3st_statistics` 增加可配置保留窗口（默认 30 天）的定期清理与 `VACUUM`，防止数据库体积无限膨胀导致 `db.export()` 线性变慢。
    2. 对高频单条入库 `ingestMonitoringMessage` 引入写缓冲/去抖（例如 2 秒或每 20 条刷盘一次，并在 `close()` 时 flush）。

---

### PERF-3: 同步阻塞式进程与端口探测调用

- **ID**: `PERF-3`
- **严重度 / 优先级**: `High` / `P1`
- **源码路径**: `packages/service/src/process/identity.ts`、`packages/service/src/preflight/checker.ts`、`packages/service/src/config/game-config-writer.ts`
- **符号名称**: `isProcessRunning`, `getProcessExecutablePath`, `getProcessCommandLine`, `isUdpPortInUse`, `isPortInUse`
- **修复后行号**: `identity.ts:L40-L126`；`checker.ts:L23-L48`；`game-config-writer.ts:L198-L221`
- **根因 / 瓶颈机制**: `GET /servers/:uuid/status`、`GET /servers/:uuid/dashboard`、`GET /servers/:uuid/preflight` 等接口在需要检查持久化的 `processById` 时，在 Windows 上同步调用 `execFileSync("tasklist", ...)` 与 `execFileSync("powershell", ...)`（每次拉起 PowerShell CLR 冷启动耗时 200~800ms）；`checker.ts:L30` 与 `game-config-writer.ts:L204` 同步执行 `execSync("netstat ...")` / `execSync("ss -uln")`，直接冻结事件循环，影响 SSE 实时推送与并发请求响应。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 将 `isProcessRunning`、`getProcessExecutablePath`、`getProcessCommandLine` 的异步调用路径重构为 `promisify(execFile)`（保留 sync 包装仅用于关闭钩子等极少数同步上下文），并在请求级或 `ProcessManager.getState` 中引入 1~2 秒短 TTL 的 `(pid -> { alive, exePath, cmdLine })` 缓存，避免仪表盘轮询重复冷启动 PowerShell。
    2. 将 `checker.ts:L23-L48` 的 `isUdpPortInUse` 与 `game-config-writer.ts:L198-L221` 的 `isPortInUse` 统一复用 `port-check.ts` 中基于 `execFileAsync` / `/proc/net/udp` 的异步无 shell 实现。
    3. **验证计划**: 补充基于 `vi.mock("node:child_process")` 的异步并发测试，验证多台服务器并发查询 `/status` 时事件循环延迟 < 20ms 且 PowerShell 调用受 TTL 缓存合并。

---

### PERF-4: 大体积文件上传全量内存缓冲

- **ID**: `PERF-4`
- **严重度 / 优先级**: `Medium` / `P1`
- **源码路径**: `packages/service/src/api/routes.ts`
- **符号名称**: `POST /servers/:uuid/files/mission-pbo`, `POST /servers/:uuid/files/mod-list-html`
- **修复后行号**: `routes.ts:L1019-L1025, L1120-L1147`
- **根因 / 瓶颈机制**: `POST /servers/:uuid/files/mission-pbo` 使用 `for await (const chunk of data.file)` 将高达 100 MiB（`MISSION_PBO_MAX_BYTES`）的上传流全部收集进 `chunks: Buffer[]`，再执行 `Buffer.concat(chunks)` 与同步 `fs.writeFileSync(fullPath, ...)`。并发上传时会导致 V8/ArrayBuffer 峰值内存翻倍至 200+ MiB 并阻塞主线程落盘。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 使用 `stream.promises.pipeline` 将 `data.file` 通过自定义字节计数 `Transform`（实时校验不超过 `MISSION_PBO_MAX_BYTES`，超限则销毁流并返回 413）直接流式写入 `MPMissions/${safeName}.uploading-${randomUUID()}.tmp`。
    2. 写入完成后使用 `fs.promises.rename` 原子替换目标 `.pbo` 文件，异常时在 `finally` 中删除 `.tmp` 文件。
    3. **验证计划**: 使用 10 MiB 流式上传与超限（`MISSION_PBO_MAX_BYTES + 1`）边界用例验证内存峰值与临时文件清理行为。

---

### PERF-5: `ProxyAgent` 每次请求重复创建与连接池泄露

- **ID**: `PERF-5`
- **严重度 / 优先级**: `Medium` / `P1`
- **源码路径**: `packages/service/src/steamcmd/proxy-fetch.ts`、`packages/service/src/app.ts`
- **符号名称**: `proxyFetch`, `getProxyAgent`, `closeProxyAgents`
- **修复后行号**: `proxy-fetch.ts:L3-L18, L54-L60`；`app.ts:L218`
- **根因 / 瓶颈机制**: 当配置了 `HTTPS_PROXY`/`HTTP_PROXY` 环境变量时，每次调用 `proxyFetch()` 都会 `new ProxyAgent(proxyUrl)` 且从不关闭（`workshop-api.ts` 批量拉取 Workshop 详情页时会并发多次调用）。每次新建 `ProxyAgent` 均创建独立 `undici` 连接池，既浪费 TLS/TCP 握手开销，又在代理连接未释放时驻留句柄。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 在 `proxy-fetch.ts:L3-L12` 引入模块级 `proxyAgentCache = new Map<string, ProxyAgent>()` 与 `getProxyAgent(proxyUrl)` 复用同一代理 URL 的 `ProxyAgent` 实例。
    2. 导出 `closeProxyAgents()`（`proxy-fetch.ts:L14-L18`），并在 `app.ts:L218` 的 `onClose` 生命周期钩子中自动调用，服务关闭时优雅销毁全部连接池。
    3. **Vitest 验证**: `packages/service/src/steamcmd/proxy-fetch.test.ts` — `"reuses one ProxyAgent per proxyUrl and reconstructs when URL changes"` 断言同代理 URL 仅构造 1 次 `ProxyAgent`，切换代理 URL 时重建，调用 `closeProxyAgents()` 时全部 `.close()` 并清空缓存。

---

### PERF-6: `GET /servers` 全量加载配置与深拷贝热点

- **ID**: `PERF-6`
- **严重度 / 优先级**: `Medium` / `P2`
- **源码路径**: `packages/service/src/api/routes.ts`、`packages/service/src/config/store.ts`
- **符号名称**: `GET /servers`, `ConfigStore.listServers`, `ConfigStore.load`
- **修复后行号**: `routes.ts:L91-L111`；`store.ts:L55-L114`
- **根因 / 瓶颈机制**: `GET /servers` 先调用 `listServers()` 读取所有服务器目录的 `manifest.json`，随后在循环中为每台服务器调用 `app.configStore.load(s.uuid)`，仅为了读取 `config.server.serverDir` 与 `config.server.configName`。冷启动或携带 `?reload=true` 时，每台服务器都会触发多达 11 个 JSON 文件的同步读取与解析，且每次 `load()` 命中缓存时还会执行全量 `structuredClone`。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 扩展 `ServerManifest`（`store.ts:L27-L32`）持久化冗余摘要字段 `serverDir?: string`，在 `ConfigStore.save()` 写入 `manifest.json` 时同步更新；对历史无 `serverDir` 字段的旧 manifest 仅在缺失时懒读 `server.json`。
    2. 新增 `ConfigStore.loadSection(uuid, "server")` 轻量接口供 `GET /servers` 使用，避免为列表页加载 `mods`、`missions`、`scheduler` 等大体积节。
    3. **验证计划**: 为 `ConfigStore.listServers()` 与 `GET /servers` 添加断言 `fs.readFileSync` 调用次数（每台仅读取 `manifest.json`）的性能单元测试。

---

### PERF-7: `AsyncTaskManager` 任务记录无限增长

- **ID**: `PERF-7`
- **严重度 / 优先级**: `Low` / `P2`
- **源码路径**: `packages/service/src/task/manager.ts`
- **符号名称**: `AsyncTaskManager` (`tasks`, `cancelledIds`, `complete`, `cancel`)
- **修复后行号**: `task/manager.ts:L36-L52, L76-L94, L142-L157`
- **根因 / 瓶颈机制**: `AsyncTaskManager` 将所有异步任务对象（含完整 `commands`、`results` 与 `log` 数组）持续存入 `private tasks = new Map<string, AsyncTask>()`，并将所有取消的 ID 存入 `private cancelledIds = new Set<string>()`，缺少 TTL 清理与最大容量淘汰策略，长期运行后内存会随任务数单调上涨。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 为已结束任务（`Succeeded` / `Failed` / `Cancelled`）设置 TTL（默认 1 小时）与最大保留条数（默认 500 条），在 `create()` 入口处惰性淘汰过期或超出上限的最早完成任务，并同步从 `cancelledIds` 清理对应 ID（保持 `Pending`/`Running` 任务不被误删）。
    2. **验证计划**: 使用 `vi.useFakeTimers()` 模拟创建 600 个已完成任务或推进时间超过 TTL，验证 `tasks.size <= 500` 且未完成任务保留。

---

### PERF-8: SteamCMD 压缩包同步阻塞解压

- **ID**: `PERF-8`
- **严重度 / 优先级**: `Low` / `P2`
- **源码路径**: `packages/service/src/steamcmd/manager.ts`
- **符号名称**: `SteamCmdManager.extractSteamCmdWindowsArchive`, `SteamCmdManager.extractSteamCmdLinuxArchive`
- **修复后行号**: `steamcmd/manager.ts:L765-L786`
- **根因 / 瓶颈机制**: 尽管 `extractSteamCmdWindowsArchive` 与 `extractSteamCmdLinuxArchive` 均声明为 `async`，函数体内仍同步调用 `execSync("powershell ... Expand-Archive ...")` 与 `execSync("tar -xzf ...")`，在首次初始化解压 SteamCMD 的数秒内完全阻塞 Fastify HTTP 与 SSE 事件循环（导致前端进度流暂态卡顿）。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 使用 `promisify(execFile)` 替换 `execSync`：Linux 端直接调用 `execFileAsync("tar", ["-xzf", archivePath, "-C", destDir])`；Windows 端通过 `-EncodedCommand` 配合环境变量 `A3ST_ZIP_PATH` / `A3ST_DEST_DIR` 调用 `Expand-Archive`，同时消除同步阻塞与路径转义风险。
    2. **验证计划**: Mock `execFile` 验证参数数组及环境变量传递，以及解压期间事件循环可正常响应健康检查请求。

---

## 4. 已发现 BUG 详析（`BUG-1` 至 `BUG-15`）

### BUG-1: `waitForPortReady` 误探 TCP LISTEN 导致每次开服固定挂起 45s

- **ID**: `BUG-1`
- **严重度 / 优先级**: `Critical` / `P0`
- **源码路径**: `packages/service/src/process/port-check.ts`、`packages/service/src/scheduling/server-lifecycle.ts`
- **符号名称**: `isValidPort`, `parseProcNetUdp`, `isPortListening`, `isPortListeningAsync`, `waitForPortReady`, `startServer`
- **修复后行号**: `port-check.ts:L11-L163`；`server-lifecycle.ts:L19, L188-L211`
- **根因 / 瓶颈机制**: Arma 3 专用服务器监听的是 **UDP** 游戏端口（`port`），而非 TCP `LISTEN` 套接字。原 `port-check.ts` 在 Windows 调用 `Get-NetTCPConnection -State Listen`，在 Linux 解析 `/proc/net/tcp{,6}` 的 `0A` 状态，导致 `isPortListening(port)` 永远返回 `false`；而 `startServer` 调用 `waitForPortReady(port, 45_000, ...)`，使得每次正常开服/重启均强制空等满 45 秒并返回误导性的超时告警；此外当 `port <= 0` 时未提前返回，且最后一次检查未重检 `isAlive()`。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 新增严格端口校验 `isValidPort`（`port-check.ts:L11-L13`）与纯函数 `parseProcNetUdp(raw, port)`（`port-check.ts:L19-L38`），识别 `/proc/net/udp` 与 `/proc/net/udp6` 中 UDP 绑定态 `07` 与已连接态 `01`。
    2. Windows 端切换为 `Get-NetUDPEndpoint` 并通过环境变量 `A3ST_PROBE_PORT` 传参，零字符串插值（`port-check.ts:L8-L9, L65-L100`）。
    3. `waitForPortReady`（`port-check.ts:L136-L163`）默认采用非阻塞异步探测 `isPortListeningAsync`，入口先校验 `isAlive()` 与 `isValidPort(port)`，并在循环结束后再次校验 `isAlive()`。
    4. **Vitest 验证**: `packages/service/src/process/port-check.test.ts` — 5 条测试全部通过（覆盖 `parseProcNetUdp` IPv4/IPv6、无效端口、`Get-NetUDPEndpoint` 命令与环境变量校验、快速就绪 `< 500ms`、进程退出及 `port <= 0` 立即返回）。

---

### BUG-2: `createService` 未等待 `MonitoringDb` 异步初始化完成

- **ID**: `BUG-2`
- **严重度 / 优先级**: `High` / `P0`
- **源码路径**: `packages/service/src/app.ts`、`packages/service/src/monitoring/db.ts`
- **符号名称**: `createService`, `MonitoringDb.init`, `MonitoringDb.waitReady`
- **修复后行号**: `app.ts:L110-L111`；`db.ts:L50-L74, L113-L115`
- **根因 / 瓶颈机制**: `MonitoringDb` 构造函数中异步执行 `this.ready = this.init()`（加载 `sql.js` WASM），而 `app.ts` 原先直接继续注册路由并开始监听端口，未 `await monitorDb.waitReady()`。服务刚就绪时收到的早期监控写入/查询会命中 `if (!this.db) return` 并静默丢弃；同时 `init()` 中尝试在内存 WASM SQLite 上执行无效的 `PRAGMA journal_mode=WAL`。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 在 `createService`（`app.ts:L111`）中显式 `await monitorDb.waitReady()` 后再挂载路由与同步定时任务。
    2. 移除 `MonitoringDb.init`（`db.ts:L50-L74`）中无意义的 `PRAGMA journal_mode=WAL`。
    3. **Vitest 验证**: `packages/service/src/app.lifecycle.test.ts` — `"BUG-2 awaits monitorDb.waitReady() so immediate ingest right after createService persists"` 在 `createService` 返回后立即发起 `POST /monitoring/ingest` 并校验 `GET /monitoring/summary` 返回 `totalEntries === 1, peakPlayers === 12`。

---

### BUG-3: `rcon_ban` 与 `rcon_mission` 参数映射错位

- **ID**: `BUG-3`
- **严重度 / 优先级**: `High` / `P0`
- **源码路径**: `packages/service/src/api/routes.ts`、`packages/service/src/types/task.ts`
- **符号名称**: `executeCommand` (`rcon_ban`, `rcon_mission`), `AutomationCommand`
- **修复后行号**: `routes.ts:L1791-L1834`；`types/task.ts:L25-L41`
- **根因 / 瓶颈机制**: `routes.ts` 原先在 `rcon_ban` 中直接把 `cmd.playerId` 当作 `timeMinutes` 传给 `client.ban(cmd.playerGuid, cmd.playerId, cmd.reason)`；而 `rcon_mission` 只读取 `cmd.missionTemplate`，忽略了 `@a3st/api-client` 中定义的 `rconMissionName`。同时需注意现有前端 `packages/web/src/views/RconView.vue` 仍通过数字型 `playerId` 传递封禁时长，因此后端不能一刀切移除数字型 `playerId` 兼容。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 完善 `AutomationCommand`（`types/task.ts:L25-L41`）补齐 `rconMissionName`、`timeMinutes`、`reason`、`rconCommandText` 字段类型。
    2. `rcon_ban`（`routes.ts:L1791-L1820`）优先使用 `cmd.playerGuid` 或字符串型 `cmd.playerId` 作为 `target`；时长优先读取数值型 `cmd.timeMinutes`，仅当 `cmd.timeMinutes === undefined && typeof cmd.playerId === "number"` 时兼容旧版 `RconView.vue` 传参。
    3. `rcon_mission`（`routes.ts:L1825-L1834`）按 `cmd.rconMissionName ?? cmd.missionTemplate` 取值。
    4. **Vitest 验证**: `packages/service/src/api/routes.test.ts` — `"BUG-3 passes timeMinutes (with RconView legacy numeric playerId fallback) and rconMissionName ?? missionTemplate"` 验证标准调用与 `RconView.vue` 兼容调用均正确下发参数。

---

### BUG-4: `RconClient` UDP 分片重传重复拼接及连接错误定时器泄露

- **ID**: `BUG-4`
- **严重度 / 优先级**: `High` / `P1`
- **源码路径**: `packages/service/src/rcon/client.ts`
- **符号名称**: `RconClient.connect`, `RconClient.handleCommandResponse`, `RconClient.cleanup`
- **修复后行号**: `client.ts:L60-L144, L234-L263, L332-L356`
- **根因 / 瓶颈机制**:
  1. `handleCommandResponse` 对已存在的分片序号或单包响应使用 `(entry.chunks.get(index) ?? "") + pkt.message` 累加拼接。UDP 丢包重传或客户端 `retryTimer` 触发重复响应时，同一分片会被拼接多次导致返回体与玩家列表损坏。
  2. `connect()` 在定义 `failTimer` 与 `retryTimer` 之前绑定 `socket.on("error")`，出错时未清除这两个定时器，导致 `retryTimer` 继续发包并在 `timeout` 到期后触发第二次 `cleanup()` 及重复的 `"disconnected"` 事件。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. `handleCommandResponse`（`client.ts:L240-L262`）对多片与单片响应均改为 `entry.chunks.set(index, pkt.message)` 按分片索引幂等覆盖。
    2. `connect()`（`client.ts:L70-L140`）提前声明 `settled`、`failTimer`、`retryTimer` 与 `clearConnectTimers()`，在 `socket.on("error")`、超时和登录响应任一分支均立即清理定时器。
    3. `cleanup()`（`client.ts:L332-L356`）通过 `wasActive` 保证每次活跃连接至多触发 1 次 `"disconnected"`。
    4. **Vitest 验证**: `packages/service/src/rcon/client.test.ts` — `"overwrites duplicate UDP fragments by index instead of concatenating"` 与 `"clears failTimer and retryTimer on socket error and emits disconnected once"`。

---

### BUG-5: `mod-list-html` 缺少 `text/html` 解析器且非字符串请求体触发 500

- **ID**: `BUG-5`
- **严重度 / 优先级**: `High` / `P0`
- **源码路径**: `packages/service/src/app.ts`、`packages/service/src/api/routes.ts`
- **符号名称**: `createService` (`addContentTypeParser`), `POST /servers/:uuid/files/mod-list-html`
- **修复后行号**: `app.ts:L205-L207`；`routes.ts:L1013-L1034`
- **根因 / 瓶颈机制**: `@a3st/api-client` 的 `uploadModHtml` 以 `Content-Type: text/html` 发送原始 HTML 字符串，但 `app.ts` 未注册 `text/html` 的 Fastify ContentTypeParser，导致请求直接报 `415 Unsupported Media Type`；同时若客户端发送 `application/json` 对象 `{}`，原路由 `html = req.body as string` 绕过 `if (!html)` 检查并在 `html.matchAll(...)` 抛出 `TypeError`（500）。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 在 `app.ts:L205-L207` 注册 `app.addContentTypeParser("text/html", { parseAs: "string" }, (_req, body, done) => done(null, body))`。
    2. 在 `routes.ts:L1027-L1033` 增加 `typeof req.body === "string"` 守卫及 `!html.trim()` 校验，非字符串或空文本返回 `400 NO_CONTENT`。
    3. **Vitest 验证**: `packages/service/src/api/routes.test.ts` — `"BUG-5 & BUG-7 via createService: accepts text/html, rejects JSON body 400, and writes server.cfg on mission-pbo?writeCfg=true"`。

---

### BUG-6: `PUT /servers/:uuid/rename` 未同步更新 `config.server.configName`

- **ID**: `BUG-6`
- **严重度 / 优先级**: `Medium` / `P1`
- **源码路径**: `packages/service/src/api/routes.ts`
- **符号名称**: `PUT /servers/:uuid/rename`, `GET /servers`
- **修复后行号**: `routes.ts:L101-L104, L290-L309`
- **根因 / 瓶颈机制**: `PUT /servers/:uuid/rename` 原先仅向 `configStore.save(uuid, config, body?.newName)` 传入新名称更新 `manifest.json`，未写回 `config.server.configName`；而 `GET /servers`（`routes.ts:L102-L104`）优先采用非空的 `config.server.configName` 覆盖 `manifest.configName`，导致重命名后列表和配置页仍显示旧名称，且空白名称未被拒绝。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 在 `routes.ts:L293-L308` 校验 `newName` 去空格非空（空白返回 `400 INVALID_BODY`），并在调用 `app.configStore.save(uuid, config, newName)` 前同步更新 `config.server = { ...config.server, configName: newName }`。
    2. **Vitest 验证**: `packages/service/src/api/routes.test.ts` — `"BUG-6 PUT /servers/:uuid/rename updates both manifest and config.server.configName and rejects blank names"`。

---

### BUG-7: `POST /servers/:uuid/files/mission-pbo` 忽略 `?writeCfg=true`

- **ID**: `BUG-7`
- **严重度 / 优先级**: `Medium` / `P1`
- **源码路径**: `packages/service/src/api/routes.ts`
- **符号名称**: `POST /servers/:uuid/files/mission-pbo`
- **修复后行号**: `routes.ts:L1092-L1186`
- **根因 / 瓶颈机制**: 路由类型声明接收 `query.writeCfg`，但实现仅处理了 `addToMissionList === "true"`，从未触发 `writeAll(uuid, config)` 生成最新 `server.cfg`。用户在上传界面勾选“同时写入游戏配置”后不会真正落盘。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 在 `routes.ts:L1149-L1170` 统一使用 `parseQueryBool` 解析 `addToMissionList` 与 `writeCfg`，当 `writeCfg=true` 时触发 `maybeAutoSnapshot(app, uuid, "write")` 与 `writeAll(uuid, config)`（失败返回 `400 WRITE_CFG_FAILED`），并在成功响应中返回 `cfgWritten` 与 `writeCfgMessage`。
    2. **Vitest 验证**: `packages/service/src/api/routes.test.ts` — `"BUG-5 & BUG-7 via createService: ... writes server.cfg on mission-pbo?writeCfg=true"` 验证 `.pbo` 与包含任务模板的 `server.cfg` 均真实生成。

---

### BUG-8: `enable_mods` / `disable_mods` 与 `roleEntries` 状态分叉

- **ID**: `BUG-8`
- **严重度 / 优先级**: `Medium` / `P2`
- **源码路径**: `packages/service/src/api/routes.ts`、`packages/service/src/mods/enabler.ts`、`packages/service/src/mods/mod-config-sync.ts`、`packages/service/src/mods/scanner.ts`
- **符号名称**: `executeCommand` (`enable_mods`, `disable_mods`), `disableModsByScope`, `syncRoleEntriesFromIds`, `ModScanner.buildModMeta`
- **修复后行号**: `routes.ts:L1506-L1560`；`enabler.ts:L5-L57`；`mod-config-sync.ts:L33-L57`；`scanner.ts:L183-L197`
- **根因 / 瓶颈机制**: 当用户先在 Web UI 中配置过 `roleEntries` 后，自动化任务 `enable_mods` 只更新 `enabledIds`/`clientModIds` 而不刷新 `roleEntries`，导致 `ModScanner.buildModMeta` 读取旧的 `savedRole` 覆盖 `isClientMod`；而 `disable_mods`（非 `all` 作用域）仅从对应角色的 `*ModIds` 移除并调用 `syncRoleEntriesFromIds`，却从未将已失去全部角色的模组从 `enabledIds` 中清理。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 在 `mod-config-sync.ts` 中抽离统一的 `applyModRoleMutation(config)` 辅助函数：`enable_mods` 调用 `syncRoleEntriesFromIds`（必要时补全缺失的 `roleEntries` 项）；`disable_mods` 在调用 `disableModsByScope` 后重算 `enabledIds = union(clientModIds, serverModIds, hcModIds)`。
    2. **验证计划**: 在 `mods/` 补充单测验证“按路径保存 `roleEntries` 后执行 `enable_mods` / `disable_mods(scope="client")`，`ModScanner.scan()` 与 `enabledIds` 完全一致”。

---

### BUG-9: SteamCMD Linux 延迟子进程错误永久挂起与 Windows 日志截断失效

- **ID**: `BUG-9`
- **严重度 / 优先级**: `High` / `P1`
- **源码路径**: `packages/service/src/steamcmd/console-capture.ts`
- **符号名称**: `spawnPipeCapture`, `spawnWindowsCaptured`, `readNewBytes`
- **修复后行号**: `console-capture.ts:L48-L245`
- **根因 / 瓶颈机制**:
  1. `spawnPipeCapture` 在注册 `child.on("error", (err) => reject(err))` 后立刻同步 `resolve(...)`。在 Linux 上 `child.pid` 在 `execve` 之前即已存在，异步 `ENOENT`/`EACCES` 触发时 `Promise` 已决断，导致 `reject` 被忽略且 `exitResolve` 永不调用，`SteamCmdManager._busy` 永久锁死。
  2. `spawnWindowsCaptured` 先判 `!child.pid` 返回 rejected Promise 后才绑定 `child.on("error")`，可能引发未捕获 `'error'` 事件。
  3. `readNewBytes` 在 `stat.size <= offset` 时直接保持旧 `offset`，当 Windows 新一轮 SteamCMD 截断或新建 `logs/console_log.txt` 时，将完全丢失所有新输出直到文件长度超过上一轮旧偏移。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. `spawnPipeCapture`（`console-capture.ts:L159-L194`）区分 `resolved` 与 `settled`：若 `error` 在 `resolve` 之后到达，关闭所有 `readline` reader、向 `onData` 输出错误日志并调用 `exitResolve(1)`；同时监听 `close` 事件兜底。
    2. `spawnWindowsCaptured`（`console-capture.ts:L96-L105`）先绑定 `error`/`exit` 监听器再检查 `!child.pid`。
    3. `readNewBytes`（`console-capture.ts:L227-L245`）在文件不存在时将 `newOffset` 重置为 `0`，在 `stat.size < offset` 时将有效偏移归零并从头读取。
    4. **Vitest 验证**: `packages/service/src/steamcmd/console-capture.test.ts` — `"spawnPipeCapture settles waitForExit(1) when child emits error after resolve"` 与 `"spawnWindowsCaptured redacts debugMsg and resets offset to 0 when console_log.txt truncates"`。

---

### BUG-10: 无头客户端缺少 `error` 监听且服务关闭未回收残留进程

- **ID**: `BUG-10`
- **严重度 / 优先级**: `High` / `P1`
- **源码路径**: `packages/service/src/process/headless.ts`、`packages/service/src/app.ts`
- **符号名称**: `startHeadlessClient`, `stopHeadlessClient`, `stopAllHeadlessClients`
- **修复后行号**: `headless.ts:L14-L91`；`app.ts:L217`
- **根因 / 瓶颈机制**: `startHeadlessClient` 创建子进程并存入 `hcProcesses` 后仅监听 `"exit"` 而未绑定 `"error"`，当可执行文件缺失（`ENOENT`）时会因未捕获 `'error'` 事件直接导致整个 Node 服务崩溃退出；`exit` 回调删除 Map 键时亦未校验 `hcProcesses.get(uuid) === proc`，可能误删刚重启的新实例句柄；且服务退出时无统一回收全部 HC 进程的机制。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 为 `proc` 绑定 `proc.on("error", ...)`（记录日志并在引用匹配时清理 `hcProcesses`），并为 `proc.on("exit")` 添加 `hcProcesses.get(uuid) === proc` 身份守卫（`headless.ts:L60-L70`）。
    2. 导出 `stopAllHeadlessClients()`（`headless.ts:L87-L91`），并在 `app.ts:L217` 的 `onClose` 钩子中统一终止全部无头客户端。
    3. **Vitest 验证**: `packages/service/src/process/headless.test.ts` — `"attaches proc error listener so ENOENT does not crash and removes map entry"` 与 `"stopAllHeadlessClients kills all active HC instances"`。

---

### BUG-11: SteamCMD 下载中断句柄与临时文件泄露及秒级日志文件名覆盖

- **ID**: `BUG-11`
- **严重度 / 优先级**: `Medium` / `P1`
- **源码路径**: `packages/service/src/steamcmd/manager.ts`
- **符号名称**: `SteamCmdManager.ensureInstalledBody`, `formatSessionLogStamp`
- **修复后行号**: `steamcmd/manager.ts:L186-L234, L789-L798`
- **根因 / 瓶颈机制**: `ensureInstalledBody` 在循环读取网络流并写入 `archivePath` 时，若用户在半途取消或流异常，抛出异常直接跳出循环，`writer` 文件描述符、`reader` HTTP 流以及残缺压缩包均不会被关闭/清理；此外 `formatSessionLogStamp` 精度仅到秒（`YYYYMMDD_HHMMSS`），同一秒内多次运行会互相覆盖日志。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 在 `ensureInstalledBody`（`manager.ts:L187-L234`）中监听 `writer.on("error")` 并以 `try/catch` 包裹读写循环；异常/取消时销毁 `writer` 并等待 `"close"` 事件释放句柄、取消 `reader.cancel()` 并删除残留 `archivePath`。
    2. 升级 `formatSessionLogStamp`（`manager.ts:L789-L798`）追加毫秒与 4 位单调自增序号（`_${ms}_${seq}`），在保留字典序最新排序兼容性的同时杜绝同秒碰撞。
    3. **Vitest 验证**: `packages/service/src/steamcmd/manager.test.ts` — `"BUG-11 cleans up download writer, reader, and partial archive when aborted mid-stream"` 与 `"BUG-11 generates unique session log filenames within the same second"`。

---

### BUG-12: Workshop API 响应使用定长切片与正则而非结构化 JSON 解析

- **ID**: `BUG-12`
- **严重度 / 优先级**: `Medium` / `P2`
- **源码路径**: `packages/service/src/steamcmd/workshop-api.ts`
- **符号名称**: `findModSegment`, `parseModDetails`
- **修复后行号**: `workshop-api.ts:L98-L115, L171-L202`
- **根因 / 瓶颈机制**: `parseModDetails` 明明接收的是 Steam Web API 的标准 JSON 字符串，却未调用 `JSON.parse`，而是依赖 `findModSegment` 截取 `[index - 400, index + 6000]` 窗口再运行正则匹配 `creator_app_id`/`title`/`time_updated`。当某个模组 `description` 超过 6000 字符或包含转义 JSON 引号、`107410` 字样时，容易导致 `time_updated` 截断丢失或非 Arma 3 条目误判。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 在 `parseModDetails` 中优先 `JSON.parse(json)` 读取 `response.publishedfiledetails` 数组，按 `Number(item.publishedfileid)` 精确建表并校验 `item.creator_app_id === undefined || Number(item.creator_app_id) === 107410`，仅在 JSON 解析异常时才降级到现有正则逻辑。
    2. **验证计划**: 在 `workshop-api.test.ts` 增加超长描述（>10KB）及含转义引号的 API JSON 夹具用例。

---

### BUG-13: Fastify 缺少 `onClose` 资源回收与跨实例 SSE 监听器累加

- **ID**: `BUG-13`
- **严重度 / 优先级**: `High` / `P1`
- **源码路径**: `packages/service/src/app.ts`、`packages/service/src/api/sse.ts`、`packages/service/src/monitoring/db.ts`
- **符号名称**: `createService`, `SseManager.wireSteamCmd`, `SseManager.unwireSteamCmd`, `SseManager.closeAll`, `MonitoringDb.close`
- **修复后行号**: `app.ts:L210-L220`；`sse.ts:L16-L100`；`db.ts:L40, L276-L283`
- **根因 / 瓶颈机制**: `app.ts` 此前无 `app.addHook("onClose", ...)`，导致调用 `app.close()` 时 `scheduler` cron 定时器持续驻留、`monitorDb` 未安全落盘关闭、SSE `keepAlive` 定时器在连接未显式断开时持续触发；且 `app.ts` 直接复用模块级单例 `sseManager`，测试或多次启停 `createService()` 会将匿名监听器永久残留。同时 `MonitoringDb.close()` 缺少幂等保护，二次关闭会在 `sql.js` 上抛异常。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. `SseManager`（`sse.ts:L16-L100`）记录 `wiredListeners` 与每客户端 `keepAlive` 定时器，新增 `unwireSteamCmd(steamCmd)` 与 `closeAll()`。
    2. `createService`（`app.ts:L210-L220`）为每个服务实例创建独立 `instanceSseManager`，并在 `onClose` 钩子中依次执行 `scheduler.clear()`、`instanceSseManager.unwireSteamCmd(steamCmd)`、`instanceSseManager.closeAll()`、`stopAllHeadlessClients()`、`await closeProxyAgents()` 与 `monitorDb.close()`。
    3. `MonitoringDb.close()`（`db.ts:L40, L276-L283`）增加 `private closed = false` 幂等守卫，兼容外部调用方（如 `routes.test.ts` `afterAll`）的显式重复关闭。
    4. **Vitest 验证**: `packages/service/src/app.lifecycle.test.ts` — `"clears scheduler, unwires SSE listeners, and closes monitorDb idempotently on app.close()"` 及 `packages/service/src/api/sse.test.ts` — `"unwireSteamCmd removes listeners and closeAll clears keepalive and ends streams"`。

---

### BUG-14: `tail`/`hours` 参数缺少边界校验且 6 处 `NOT_FOUND` 误返回 HTTP 200

- **ID**: `BUG-14`
- **严重度 / 优先级**: `Medium` / `P1`
- **源码路径**: `packages/service/src/api/routes.ts`
- **符号名称**: `parsePositiveInt`, `GET /steamcmd/log`, `GET /servers/:uuid/logs/read`, `GET /servers/:uuid/monitoring/stats`, `GET /servers/:uuid/config`, `GET /servers/:uuid/preflight`, `GET /servers/:uuid/dashboard`, `POST /schedule/restart`, `POST /servers/:uuid/snapshots/:snapshotId/restore`, `GET /tasks/:taskId`
- **修复后行号**: `routes.ts:L132-L135, L455, L479-L482, L642-L645, L735, L765, L890-L906, L941-L944, L1237-L1240, L1407-L1420`
- **根因 / 瓶颈机制**:
  1. `tail` 与 `hours` 直接使用 `parseInt(..., 10)`：传入 `"abc"` 时得到 `NaN`，在 `logs/reader.ts` 中 `lines.slice(lines.length - NaN)` 等价于 `lines.slice(0)`（无上限返回全部读取行），在 `monitoring/db.ts` 中拼接 `'-NaN hours'` 导致 SQL 条件恒假返回空数组；传入 `<= 0` 则返回空切片。
  2. 6 个资源查询/操作端点在缺失目标时返回 `HTTP 200` 与 `error: "NOT_FOUND"`（及 `/schedule/restart` 校验失败返回 200），与同文件内其余 `404`/`400` 端点语义不一致。经排查 `@a3st/api-client`（直接 `r.json()`）与 `@a3st/web` 全部调用方均以 `res.success` 分支，改为标准 `404`/`400` 状态码并保留原 JSON 信封完全兼容。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 新增 `parsePositiveInt(raw, fallback, max)`（`routes.ts:L1407-L1420`），在 `/steamcmd/log`（默认 300 上限 10000）、`/logs/read`（默认 200 上限 10000）与 `/monitoring/stats`（默认 24 上限 8760）强制非正数/NaN 回退默认值并封顶。
    2. 为上述 6 处 `NOT_FOUND` 分支补齐 `reply.status(404)`，同时为 `POST /schedule/restart` 的非法请求/表达式补齐 `reply.status(400)`。
    3. **Vitest 验证**: `packages/service/src/api/routes.test.ts` — `"BUG-14 bounds tail/hours query params and returns HTTP 404 on NOT_FOUND endpoints"`。

---

### BUG-15: `restartOnCrash` 与 `restartDelay` 仅存配置字段而未实现崩溃守护

- **ID**: `BUG-15`
- **严重度 / 优先级**: `Low` / `P2`
- **源码路径**: `packages/service/src/types/config.ts`、`packages/service/src/process/manager.ts`、`packages/service/src/scheduling/server-lifecycle.ts`
- **符号名称**: `StartupConfigSection` (`restartOnCrash`, `restartDelay`), `ProcessManager.start`, `stopServer`
- **修复后行号**: `types/config.ts:L34-L37`；`process/manager.ts:L107-L117`；`server-lifecycle.ts:L58-L112`
- **根因 / 瓶颈机制**: `StartupConfigSection` 定义了 `restartOnCrash?: boolean` 与 `restartDelay?: number` 并在前端表单持久化保存，但 `ProcessManager` 的 `proc.on("exit")` 与 `server-lifecycle.ts` 均未消费这两个字段，仅在 Windows 分离窗口模式下甚至无法通过已 `unref` 句柄感知非预期崩溃。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 在 `server-lifecycle.ts` 维护 `intentionalStops = new Set<string>()`（`stopServer`/`restartServer` 时标记，启动成功后清除），由后台轻量巡检（或非分离模式下的 `processManager.on("exit")`）检测非预期退出且 `config.startup?.restartOnCrash === true` 的实例。
    2. 结合 `Math.max(1000, (config.startup?.restartDelay ?? 5) * 1000)` 与崩溃循环熔断器（例如 5 分钟内连续崩溃 3 次则暂停自动拉起并记录告警日志），避免配置错误导致无限拉起风暴。
    3. **验证计划**: 使用假子进程与 `vi.useFakeTimers()` 分别测试“主动停止不重启”、“异常退出按 `restartDelay` 重启”以及“连续崩溃 3 次熔断”。

---

## 5. 安全性与稳定性详析（`SEC-1` 至 `SEC-7`）

### SEC-1: PID 类型绕过与 `execSync` / PowerShell 命令注入

- **ID**: `SEC-1`
- **严重度 / 优先级**: `Critical` / `P0`
- **源码路径**: `packages/service/src/process/identity.ts`、`packages/service/src/process/manager.ts`、`packages/service/src/api/routes.ts`
- **符号名称**: `isValidPid`, `isProcessRunning`, `getProcessExecutablePath`, `getProcessCommandLine`, `verifyProcessIdentity`, `killProcessTree`, `ProcessManager.{adopt,kill,getState}`, `sanitizeImportedProcessId`
- **修复后行号**: `identity.ts:L14-L126, L190-L197, L255-L273`；`manager.ts:L127-L196`；`routes.ts:L1304-L1314`
- **根因 / 瓶颈机制**: 原 `sanitizeImportedProcessId` 与 `identity.ts` 均使用 `pid <= 0` 校验数值。在 JavaScript 中，当请求体 `config.tasks.processById` 为恶意字符串（如 `"1); Start-Process calc; #"`）时，`"1); Start-Process calc; #" <= 0` 求值为 `false`，从而绕过守卫直接拼接进 `execSync(\`powershell ... -Id ${pid}\`)` 与 `tasklist`/`taskkill` 模板字符串，在 Windows 上造成高危 OS 命令注入；此外 `out.includes(String(pid))` 存在短 PID（如 `12` 匹配 `1234`）误判风险。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 新增并导出严格类型守卫 `isValidPid(pid: unknown): pid is number`（`typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0`），并在 `identity.ts` 全部 5 个公开进程函数、`ProcessManager.{adopt,kill,getState}` 与 `sanitizeImportedProcessId` 入口强制执行。
    2. 彻底移除 `identity.ts` 与 `manager.ts` 中的 `execSync` / shell 拼接：改用 `execFileSync` 执行 `tasklist` / `taskkill`（`windowsHide: true`），并使用正则边界 `(?:^|\\s|,|")${pid}(?:\\s|,|"|$)` 精确匹配 PID；PowerShell 路径采用 `-NoProfile -NonInteractive -EncodedCommand`（UTF-16LE Base64 常量脚本）经环境变量 `A3ST_TARGET_PID` 安全传递 PID。
    3. **Vitest 验证**:
       - `packages/service/src/process/identity.test.ts` — `"isValidPid rejects strings, floats, NaN, Infinity, and <= 0"`、`"never invokes execFileSync for malformed or non-positive PIDs"`、`"uses execFileSync with exact PID boundary matching and env-var PowerShell on win32"`；
       - `packages/service/src/api/routes.test.ts` — `"SEC-1 sanitizes malicious string processById in PUT/PATCH config without spawning shell"`。

---

### SEC-2: Steam 明文密码通过 SSE、日志及会话文件泄露

- **ID**: `SEC-2`
- **严重度 / 优先级**: `High` / `P0`
- **源码路径**: `packages/service/src/steamcmd/arguments.ts`、`packages/service/src/steamcmd/console-capture.ts`、`packages/service/src/steamcmd/manager.ts`
- **符号名称**: `redactPasswordInArguments`, `redactSteamCmdConsoleChunk`, `spawnWindowsCaptured`, `SteamCmdManager.runCapturedProcess`
- **修复后行号**: `arguments.ts:L99-L144`；`console-capture.ts:L27-L61`；`manager.ts:L556-L578`
- **根因 / 瓶颈机制**:
  1. `spawnWindowsCaptured` 直接向 `onData` 发送未脱敏的 `[调试] ProcessStartInfo.Arguments: ${argumentsString}`，经 `runCapturedProcess` 立即存入内存 `sessionOutput`、广播到实时 SSE（`/api/v1/steamcmd/stream`）并写入磁盘 `steamcmd_*.log`。
  2. `redactPasswordInArguments` 原仅执行 `argumentsString.replaceAll(password, "***")`，当密码包含 `"` 或 `\` 时，命令行里存放的是 `quoteSteamCmdArgument(password)` 转义后的 `\"`/`\\` 形式，导致脱敏完全失效。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 升级 `redactPasswordInArguments`（`arguments.ts:L103-L118`）：同时匹配 `+login <userToken> <passToken>`（保留缓存模式 `+login <user> +quit` 中的 `+quit` 不被误替换）、转义引号形式及原始密码。
    2. 新增 `redactSteamCmdConsoleChunk`（`arguments.ts:L121-L144`），对 `[调试] ProcessStartInfo.Arguments:` 行、`+login` 参数对及控制台密码回显进行实时清洗。
    3. 在 `spawnWindowsCaptured`（`console-capture.ts:L59-L61`）发送 `debugMsg` 前及 `runCapturedProcess`（`manager.ts:L568-L574`）写入 `appendSessionOutput`、发射 `"output"` SSE 事件和 `onChunk` 前双重脱敏。
    4. **Vitest 验证**:
       - `packages/service/src/steamcmd/arguments.test.ts` — 验证含引号/反斜杠密码脱敏、缓存登录 `+quit` 保留及未知密码 `+login` 兜底脱敏；
       - `packages/service/src/steamcmd/console-capture.test.ts` — 验证 `spawnWindowsCaptured` 首条调试输出不泄露明文密码；
       - `packages/service/src/steamcmd/manager.test.ts` — `"SEC-2 redacts Steam password from live output events, aggregated log, and session log file"`。

---

### SEC-3: Pino 日志 `?token=` 泄露、时序比较及 CORS 策略加固

- **ID**: `SEC-3`
- **严重度 / 优先级**: `High` / `P0`
- **源码路径**: `packages/service/src/app.ts`、`packages/service/src/api/sse.ts`
- **符号名称**: `redactQueryToken`, `safeTokenEquals`, `createService` (`logger`, `onRequest`, `@fastify/cors`), `SseManager.registerRoutes`
- **修复后行号**: `app.ts:L32-L43, L79-L100, L172-L203`；`sse.ts:L106-L113`
- **根因 / 瓶颈机制**:
  1. Fastify 5 默认 Pino `req` serializer 原封不动记录 `request.url`，导致 SSE 连接通过 `?token=...` 鉴权时把 `API_TOKEN` 明文写入服务日志；同时 `Authorization` / `x-api-key` 未配置脱敏路径。
  2. `onRequest` 钩子对 Bearer、`x-api-key` 与 `?token=` 均使用 `===` 字符串比较，存在理论时序侧信道；若重复传参导致头/查询值为数组时行为不够稳健。
  3. `@fastify/cors` 与 `sse.ts` 当前反射任意 `Origin`（需兼容 Capacitor `http://localhost` / LAN 及 Electron `file://` `null` 来源）。
- **分层状态**: `Tier A Landed`（`?token=` 与请求头脱敏 + `timingSafeEqual`） + `Tier B Architectural Proposal`（Origin 白名单与回环 CSRF 防护）
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 配置 Fastify `logger.redact`（掩码 `req.headers.authorization` 与 `req.headers["x-api-key"]`）并自定义 `logger.serializers.req` 通过 `redactQueryToken(request.url)` 将日志中的 `?token=...` 替换为 `token=***`（`app.ts:L32-L34, L80-L97`），不修改 `request.url` 本身，保持业务查询逻辑完整。
    2. 新增 `safeTokenEquals(provided, expected)`（`app.ts:L36-L43`），基于进程级随机密钥 `TOKEN_COMPARE_KEY` 的 HMAC-SHA256 摘要配合 `crypto.timingSafeEqual` 比较，并通过 `typeof provided === "string"` 避免非字符串或不同长度触发 `RangeError`。
    3. 保留 `@fastify/cors` 对 `Origin: "null"`（Electron `file://`）及 `127.0.0.1`/`localhost`/LAN（Capacitor）的完整兼容性。
    4. **Vitest 验证**: `packages/service/src/app.auth.test.ts` — 验证 Pino 日志流中出现 `token=***` 且绝不含明文 token、不同长度错误 token 稳定返回 `401`、以及 `null`/`127.0.0.1`/`localhost`/`capacitor://localhost` CORS 响应头均正常。
  - **Tier B 架构优化方案**:
    1. 引入可配置的 `CORS_ORIGINS` 白名单（默认放行 `http(s)://127.0.0.1:*`、`http(s)://localhost:*`、`capacitor://localhost`、`ionic://localhost` 及 Electron 桌面端模式），并区分公网绑定与本机回环场景。
    2. 为 Electron `apps/desktop`（`apps/desktop/src/main/index.ts`）增加随进程生成的短时启动秘钥 `A3ST_DESKTOP_TOKEN` 与可选回环 CSRF 校验，防止本机任意恶意网页通过 `http://127.0.0.1:19580` 发起跨站状态修改。

---

### SEC-4: `:uuid` / `:snapshotId` 路径穿越风险

- **ID**: `SEC-4`
- **严重度 / 优先级**: `High` / `P0`
- **源码路径**: `packages/service/src/util/upload-safety.ts`、`packages/service/src/config/store.ts`、`packages/service/src/config/snapshot.ts`、`packages/service/src/config/game-config-writer.ts`、`packages/service/src/logs/reader.ts`、`packages/service/src/bans/bans-service.ts`、`packages/service/src/api/routes.ts`
- **符号名称**: `SAFE_ID_REGEX`, `isSafeId`, `assertSafeId`, `assertSafeSubdirPath`, `ConfigStore`, `ConfigSnapshotStore`, `getConfigRoot`, `apiRoutes` (`preValidation` hook)
- **修复后行号**: `upload-safety.ts:L4-L30`；`store.ts:L45-L52, L78-L83, L116-L145, L177, L185-L207`；`snapshot.ts:L36-L142`；`game-config-writer.ts:L293-L299`；`logs/reader.ts:L20-L47`；`bans-service.ts:L15-L27`；`routes.ts:L76-L88, L894-L897, L988-L991, L1205-L1208`
- **根因 / 瓶颈机制**: HTTP 路由中的 `:uuid`、`:snapshotId`、query `serverUuid` 及 body `serverUuid` 此前直接传入 `path.join(...)`，在 `ConfigStore.delete`、`ConfigSnapshotStore.restore` 与 `getConfigRoot` 中直接参与读写与 `fs.rmSync(..., { recursive: true })`。恶意 `..` 或路径分隔符可在数据目录甚至系统盘任意目录产生文件读写或递归删除。同时因既有测试与兼容数据使用 `"uuid-1"`、`"test-uuid"` 等非严格 RFC 4122 标识符，校验须兼容 `[a-zA-Z0-9_-]`。
- **分层状态**: `Tier A Landed`
- **修复与测试验证证据 / 架构优化设计**:
  - **Tier A 已落地修复**:
    1. 在 `upload-safety.ts:L4-L30` 定义 `SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/`、`isSafeId`、`assertSafeId` 与 `assertSafeSubdirPath`（正则校验 + `path.resolve`/`path.relative` 目录边界双重防御）。
    2. 在 `ConfigStore`（`load`, `readManifestConfigName`, `save`, `delete`, `getServerConfigDir`, `invalidateCache`）、`ConfigSnapshotStore`（`create`, `list`, `restore`, `prune` 均校验 `uuid` 与 `snapshotId`）、`getConfigRoot`、`logs/reader.ts` 与 `bans-service.ts` 全面强制执行边界校验。
    3. 在 `apiRoutes`（`routes.ts:L76-L88`）挂载全局 `preValidation` 钩子拦截非法 `params.uuid`（`400 INVALID_UUID`）与 `params.snapshotId`（`400 INVALID_SNAPSHOT_ID`），并在 `POST /schedule/restart`、`GET /bans` 及 `POST /task` 显式校验 `serverUuid`。
    4. **Vitest 验证**:
       - `packages/service/src/config/store.test.ts` — `"SEC-4 rejects path traversal and invalid IDs in load, save, delete, getServerConfigDir, and invalidateCache"`；
       - `packages/service/src/config/snapshot.test.ts` — `"SEC-4 rejects traversal uuid and snapshotId across create, list, restore, and prune"`；
       - `packages/service/src/api/routes.test.ts` — `"SEC-4 returns 400 INVALID_UUID / INVALID_SNAPSHOT_ID on traversal params and queries"`。

---

### SEC-5: 自定义可执行路径与未校验启动参数风险

- **ID**: `SEC-5`
- **严重度 / 优先级**: `High` / `P1`
- **源码路径**: `packages/service/src/config/game-config-writer.ts`
- **符号名称**: `getServerExecutablePath`, `buildStartCommandLine`, `isSafeStartupExtraArg`, `appendStartupExtraArgs`
- **修复后行号**: `game-config-writer.ts:L165-L196, L716-L728, L764-L776`
- **根因 / 瓶颈机制**:
  1. `getServerExecutablePath` 在 `config.server.executable` 为绝对路径时直接原样返回，且在非 `isKnownServerExecutable` 时仍拼接 `path.join(serverDir, executable)`（甚至可含相对穿越）。若远程管理接口被滥用，可将 `executable` 指向系统工具并由 `ProcessManager` 拉起。
  2. `isSafeStartupExtraArg` 仅应用于 `startup.startConfigArgs`，而 `startup.parameters`（`L716-L719`）与 `startup.startArgs`（`L721-L724`）未经过同等字符/结构白名单检查即直接拆词入参。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 将 `getServerExecutablePath` 默认限制为 `isKnownServerExecutable`（`arma3server` / `arma3server_x64` / `.exe`）且必须位于规范化后的 `serverDir` 内部；仅当服务端启动环境变量显式设置 `ALLOW_CUSTOM_EXECUTABLE=1` 且路径通过安全校验时才允许自定义二进制。
    2. 对 `startup.parameters` 与 `startup.startArgs` 解析出的每个 token 统一执行 `isSafeStartupExtraArg`（或仅保留合法 `-key=value` / `-flag` 参数并拒绝控制字符与路径穿越），保存配置时提前给出可理解的 400 校验反馈。
    3. **验证计划**: 在 `game-config-writer.test.ts` 验证越权 `executable`（如 `cmd.exe`）默认被拒、允许白名单二进制且拒绝含非法字符的 `startArgs`。

---

### SEC-6: 服务抗滥用与进程稳定性防护（限流、Schema、配置原子写入及异常兜底）

- **ID**: `SEC-6`
- **严重度 / 优先级**: `Medium` / `P1`
- **源码路径**: `packages/service/src/app.ts`、`packages/service/src/api/sse.ts`、`packages/service/src/config/store.ts`、`packages/service/src/index.ts`
- **符号名称**: `createService`, `SseManager.addSteamCmdClient`, `SseManager.broadcastSteamCmdOutput`, `ConfigStore.save`, `index.ts` 信号处理
- **修复后行号**: `app.ts:L78-L100`；`sse.ts:L22-L53`；`store.ts:L176-L180`；`index.ts:L25-L40`
- **根因 / 瓶颈机制**:
  1. 启用公网绑定与 `API_TOKEN` 后缺少 `@fastify/rate-limit`，易受凭证暴力枚举或接口高频刷请求影响；路由缺少 Fastify JSON Schema 校验导致各 handler 需分散手动判空与强转类型。
  2. `SseManager` 未限制最大并发 SSE 客户端数量，且 `broadcastSteamCmdOutput` 忽略 `reply.raw.write()` 返回 `false` 的背压信号，慢客户端会持续积压 Node.js 写缓冲。
  3. `ConfigStore.save` 直接 `fs.writeFileSync` 覆写目标 JSON，断电或并发写入可能产生半截损坏 JSON；`index.ts` 缺少 `SIGINT`/`SIGTERM` 重入锁及 `uncaughtException`/`unhandledRejection` 安全日志兜底。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 引入 `@fastify/rate-limit`（针对公网鉴权失败及高频管理端点数限制速率），并逐步为关键 POST/PUT 路由补全 Fastify JSON Schema（利用内置 AJV 高效校验与序列化）。
    2. 为 `SseManager` 增加 `MAX_SSE_CLIENTS`（例如 32）及 `write()` 返回 `false` 时的背压/超时剔除策略。
    3. 将 `ConfigStore.save` 改造为“写入 `.tmp` 后调用原子 `replaceFile`”（复用 `monitoring/db.ts:L5-L20` 已验证的跨平台 `EPERM`/`EBUSY` 兼容模式），并在 `index.ts` 加入关闭重入锁与未捕获异常日志落盘。
    4. **验证计划**: 并发压测 SSE 慢客户端剔除、`ConfigStore.save` 异常中断不损坏原 JSON、以及触发两次 `SIGINT` 仅执行一次优雅停服。

---

### SEC-7: CSV 导出换行注入与电子表格公式注入

- **ID**: `SEC-7`
- **严重度 / 优先级**: `Medium` / `P2`
- **源码路径**: `packages/service/src/monitoring/export.ts`
- **符号名称**: `csvEscape`, `buildPlayersCsv`
- **修复后行号**: `export.ts:L51-L59, L69-L74`
- **根因 / 瓶颈机制**: 游戏内玩家昵称（`playerName`）完全由不可信客户端输入。当前 `csvEscape` 仅在包含 `,` 或 `"` 时加引号，既未对 `\r`/`\n` 加引号（允许玩家昵称伪造额外 CSV 行），也未中和以 `=`、`+`、`−`、`@`、`\t`、`\r` 开头的公式载荷（在 Excel / WPS 打开导出文件时可能触发 DDE/公式执行警告或数据外泄）。
- **分层状态**: `Tier B Architectural Proposal`
- **修复与测试验证证据 / 架构优化设计**:
  - **架构优化方案**:
    1. 升级 `csvEscape(value)`：若值首字符匹配 `/^[=+\-@\t\r]/`，先在其前添加单引号 `'` 中和公式语义；随后只要值包含 `,`、`"`、`\r` 或 `\n`，即按 RFC 4180 使用双引号包裹并将内部 `"` 转义为 `""`。
    2. **验证计划**: 新增 `monitoring/export.test.ts` 验证 `=CMD|...`、`+1+1`、`@SUM(...)` 及含 `\r\n` 恶意玩家名在导出 CSV 中均被安全转义且无跨行注入。

---

## 6. 后续演进路线图（Tier B Implementation Roadmap）

建议后续迭代按风险与收益比（ROI）分三个阶段推进 Tier B 架构演进：

1. **阶段一（稳定性与安全高优）**：
   - 落地 `SEC-5`（可执行文件白名单与 `parameters`/`startArgs` 清洗）与 `SEC-7`（CSV 公式/换行转义）；
   - 落地 `BUG-8`（统一模组角色与 `enabledIds` 同步）与 `BUG-12`（Workshop API 结构化 `JSON.parse`）。
2. **阶段二（非阻塞 I/O 与大文件/高并发性能）**：
   - 落地 `PERF-3`（`identity.ts` 与端口检测全面异步化 + 1~2s TTL 缓存）与 `PERF-8`（异步解压）；
   - 落地 `PERF-4`（`mission-pbo` 流式写入临时文件 + 原子替换）与 `PERF-1 (Tier B)`（异步 `ModScanner` 与 `mtimeMs` 缓存）；
   - 落地 `PERF-6`（`manifest.json` 摘要读取）与 `PERF-7`（`AsyncTaskManager` TTL/上限淘汰）。
3. **阶段三（平台级弹性与边界加固）**：
   - 落地 `BUG-15`（`restartOnCrash` 崩溃守护与熔断机制）；
   - 落地 `SEC-3 (Tier B)`（`CORS_ORIGINS` 白名单 + Electron 启动秘钥/CSRF 校验）与 `SEC-6`（`@fastify/rate-limit`、Schema 校验、SSE 背压与 `ConfigStore` 原子落盘）。
