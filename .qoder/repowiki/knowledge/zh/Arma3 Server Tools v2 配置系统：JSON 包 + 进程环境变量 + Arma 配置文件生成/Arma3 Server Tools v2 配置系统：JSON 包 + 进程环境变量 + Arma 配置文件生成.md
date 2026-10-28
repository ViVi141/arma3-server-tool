---
kind: configuration_system
name: Arma3 Server Tools v2 配置系统：JSON 包 + 进程环境变量 + Arma 配置文件生成
category: configuration_system
scope:
    - '**'
source_files:
    - packages/service/src/index.ts
    - packages/service/src/config/index.ts
    - packages/service/src/config/store.ts
    - packages/service/src/config/snapshot.ts
    - packages/service/src/config/game-config-writer.ts
    - packages/service/src/types/config.ts
    - apps/desktop/src/main/index.ts
    - apps/mobile/capacitor.config.ts
---

## 1. 总体方案

本仓库的「配置」涉及两个层面，由 `packages/service`（Node.js Fastify 后端）统一承担核心逻辑：

- **工具自身的运行时配置**：通过 Node.js 进程环境变量加载，无 `.env` 文件、无 YAML/TOML、无集中式 config store。
- **Arma3 服务器实例的配置**：以 JSON 包形式持久化到磁盘，再由 `game-config-writer.ts` 渲染为 Arma3 引擎可识别的 `server.cfg` / `basic.cfg` / `<uuid>.Arma3Profile` / BattlEye 配置。

Electron 桌面端与 Capacitor 移动端仅消费 API，不直接持有配置加载逻辑；`.NET DestinyServerMonitoring` 扩展通过 callExtension 与桌面端通信，也不参与配置加载。

## 2. 关键文件

- `packages/service/src/index.ts` — 服务入口，解析 `PORT` / `HOST` / `API_TOKEN` / `DATA_DIR`。
- `packages/service/src/config/store.ts` — `ConfigStore`：JSON 包（manifest.json + section 文件）的 CRUD。
- `packages/service/src/config/snapshot.ts` — `ConfigSnapshotStore`：对配置包做快照/恢复/裁剪。
- `packages/service/src/config/game-config-writer.ts` — 将 `ServerConfigPackage` 渲染为 Arma3 原生配置文件并拼接启动命令行。
- `packages/service/src/config/index.ts` — 上述模块的统一 re-export。
- `packages/service/src/types/config.ts` — `ServerConfigPackage` 及其各 section 的类型定义。
- `apps/desktop/src/main/index.ts` — Electron main 进程透传 `process.env` 给子进程。
- `apps/mobile/capacitor.config.ts` — Capacitor 应用自身配置（与 Arma3 配置无关）。
- `apps/desktop/electron-builder.yml` — Electron 打包配置。

## 3. 架构与约定

### 3.1 运行时配置：纯 `process.env`

服务启动时直接从 `process.env` 读取：

| 变量 | 默认值 | 用途 |
|---|---:|---|
| `PORT` | `19580` | Fastify 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址 |
| `API_TOKEN` | `""` | API 鉴权令牌 |
| `DATA_DIR` | `<cwd>/.a3st-dev-data` | 工具数据根目录（含 `config/`、`snapshots/`） |
| `WEB_ROOT` | 未设置 | 静态 Web 资源目录（见 `web-static.ts`） |
| `A3ST_STEAMCMD_ROOT` | 未设置 | SteamCMD 安装根（见 `steamcmd/manager.ts`） |
| `HTTP(S)_PROXY` | 未设置 | SteamCMD 下载代理（见 `steamcmd/proxy-fetch.ts`） |

没有 dotenv 初始化、没有 schema 校验、没有分层合并（如 file → env → default）。新增运行时配置只需在 `index.ts` 中加一行 `process.env.X ?? default`。

### 3.2 服务器配置存储：JSON 包 + manifest

`ConfigStore` 把每个服务器实例保存在 `DATA_DIR/config/<uuid>/` 下，结构如下：

```
config/
├── <uuid>/
│   ├── manifest.json          # uuid, configName, lastModified, formatVersion
│   ├── server.json            # ServerConfigSection
│   ├── startup.json           # StartupConfigSection
│   ├── mods.json              # ModsConfigSection
│   ├── basic.json             # BasicConfigSection
│   ├── profile.json           # ProfileConfigSection
│   ├── battleye.json          # BattlEyeConfigSection
│   ├── tasks.json             # TaskListSection
│   ├── missionparams.json     # MissionParamsSection
│   ├── scheduler.json         # SchedulerConfigSection
│   └── monitoring.json        # MonitoringConfigSection
```

- 文件名 stem 小写后映射到 `SECTION_MAP`（`server`/`startup`/`mods`/`basic`/`profile`/`battleye`/`tasks`/`missionparams`/`scheduler`/`monitoring`），未知文件被忽略。
- `load()` 使用内存 `Map<uuid, ServerConfigPackage>` 缓存，可通过 `invalidateCache(uuid?)` 或 `{ forceDisk: true }` 刷新。
- `save()` 按 `SECTION_MAP` 反向写出，`missionParams` 字段对应 `missionparams.json`。
- `listServers()` 只读 `manifest.json`，不解析完整包。
- `formatVersion` 当前固定为 `2`，写入时从输入包继承。

### 3.3 快照子系统

`ConfigSnapshotStore` 位于 `DATA_DIR/snapshots/<uuid>/`，每次快照生成一个 `<id>_snapshot.json` 清单和一份所有 JSON 文件的拷贝（前缀 `<id>_`）。

- `create(uuid, label)` → 返回短 id（`crypto.randomUUID().slice(0, 12)`）。
- `list(uuid)` → 按 `timestamp` 倒序排序。
- `restore(uuid, snapshotId)` → 用快照覆盖当前 `config/<uuid>/` 下的同名 JSON 文件。
- `prune(uuid, keep=10)` → 保留最近 N 个快照，其余删除。

### 3.4 Arma3 配置文件生成

`writeAll(uuid, config)` 调用四个写入器，输出到 `serverDir/a3st_serverconfig/<uuid>/`：

| 目标文件 | 来源 section | 说明 |
|---|---|---|
| `server.cfg` | `basic` + `tasks` + `startup` | 主机名、密码、玩家数、BattlEye、Missions、logFile 等 |
| `basic.cfg` | `basic` | 带宽、包大小、自定义文件大小等 |
| `<uuid>.Arma3Profile` | `basic` + `startup` | 难度预设、视野、地形网格等 |
| `BattlEye/BEServer_x64.cfg` / `BEServer.cfg` | `battleye` + `basic` | RCon 密码与速率限制 |

同时提供 `buildStartCommandLine(uuid, config, mods)` 与 `buildHeadlessClientCommandLine(...)` 拼接 Arma3 启动参数，注入 `-config` / `-cfg` / `-profiles` / `-name=<uuid>` / `-mod` / `-serverMod` 等。

### 3.5 安全约束

- `isSafeStartupExtraArg(value)` 仅允许形如 `-flag=value` 且字符集限于 `[a-zA-Z0-9]` 与 `-_=:.\/+@ ",()[]` 的参数，长度 ≤ 256。
- `startConfigArgs` 以 base64 编码传入，解码后逐行过滤，再拼接到启动命令。
- `appendExtraLines` 支持追加任意文本到 `server.cfg` / `basic.cfg` / profile，但不会绕过上述白名单。

### 3.6 Electron 与子进程环境

`apps/desktop/src/main/index.ts` 在 spawn 子进程时显式传入 `...process.env`，使桌面端的环境变量能传递到后端服务与 Arma3 进程。`dist-electron/main.js` 是构建产物，同样展开 `process.env`。

## 4. 约定与约束

- **运行时配置一律来自 `process.env`**：`packages/service/src/index.ts` 是唯一入口，新增变量需在此处声明并赋予默认值。
- **服务器配置采用 JSON 包格式，schema 由 TypeScript 接口 `ServerConfigPackage` 描述**：新增 section 需在 `types/config.ts` 增加接口、在 `store.ts` 的 `SECTION_MAP` 注册、并在 `game-config-writer.ts` 的写入逻辑中添加处理。
- **manifest.json 是权威元数据源**：`listServers()` 仅读取它；`configName` 优先取保存时的 `configName`，回退到 `config.server.configName`，再回退到已有 manifest。
- **快照保留策略默认 keep=10**：`prune()` 会删除超出数量的旧快照。
- **日志路径会被规范化**：`resolveServerConsoleLogPath` 会把相对路径解析到 `configRoot` 下，避免写到扫描范围之外。
- **端口冲突检测跨平台**：Windows 走 `netstat -ano -p udp`，Linux/macOS 走 `ss -uln`，超时 3s。
- **HEADLESS 客户端端口选择**：基于 `serverPort + 5` 起随机探测，最多尝试 10 次。
- **Electron/Capacitor/Vite 等框架级配置文件（`electron-builder.yml`、`capacitor.config.ts`、`vite.config.ts`）与 Arma3 配置体系解耦**，不在本文讨论范围内。

## 5. 不适用项

- 未发现 `.env` 文件、dotenv 初始化、YAML/TOML 配置中心、feature flag 系统或 secrets manager。
- `.NET DestinyServerMonitoring` 扩展通过 callExtension 与桌面端通信，不参与配置加载。
- 前端（Vue/web）与 mobile 层不直接持有配置加载逻辑，仅通过 `api-client` 调用 `/api/v1/servers/{uuid}/config` 等 REST 接口。