# 变更日志

格式基于各版本发布清单整理；详细条目见 [archive/releases/](archive/releases/)。

## [2.0.0-alpha.25] — 当前

- 工程：`npm run clean` 改为跨平台 `scripts/clean.mjs`，去掉 Windows 下不可用的 `rm -rf`。
- CI：根 `typecheck` 覆盖 web 与 desktop；本地 `ci-local.ps1` 将 `TEMP/TMP` 固定到 `.tmpbuild/esbuild-temp`，避免 Windows esbuild 清理临时目录 Access denied。
- 仓库卫生：从索引移除 `DestinyServerMonitoring/.vs/.../.suo`。
- 文档：`architecture-v2.md` 对齐当前 Material Design 3 主题（删除已下线的 ark/demo 描述）；`known-issues.md` ISSUE-06 更新为 electron-builder 26 + `after-pack.cjs`。
- Service 496 用例（1 跳过）；typecheck（api-client/service/web/desktop）与 build:service / build:web 通过。

## [2.0.0-alpha.24]

- 定时任务页交互对齐用户心智：迁移弹窗改为任务表格 + 人话策略摘要（不再展示 JSON）；保存即同步调度器，顶栏「保存」与页内按钮等效，成功只提示一次，同步失败明确“已保存、未同步”。
- 旧配置被默认值补全时明确提示补全项，不再静默降级；任务 ID 改名行内提示“保存后按新任务创建”；删除任务需确认并说明未保存可恢复。
- Cron 即时校验：与后端同一 croner 库，中文错误 + 下次运行预览，保存前拦截非法表达式，避免“保存成功但任务被同步器跳过”。
- 迁移前置条件缺项时提示并定位策略面板；确认后显示“已标记待停用”；不可勾选项 hover 说明差额；规则说明折叠；错误统一内联呈现，“门禁”改为“可执行”。
- Service 写盘健壮性：配置、运维库、监控库与健康模组统一走 `replaceFile`，Windows 上目标文件瞬时被占用（EPERM/EBUSY）时删除后重试，不再把一次偶发占用变成 500 或事务失败。
- Service 496 用例（1 跳过）、Playwright 194 用例全绿。

## [2.0.0-alpha.23]

- 修复从旧版本升级后定时任务页无法加载：旧配置存在但结构残缺（如维护策略只有 `enabled`）时逐字段校验并按默认值回退，编辑器不再因非数组的时段字段崩溃。
- 旧任务动作归一化与后端调度器同规则（数字 1/2/3、中文启动/停止/检测/更新模组/检查模组）：旧更新 Cron 正确显示、迁移提示可触发，保存不再静默改写任务语义。
- 任务缺 `taskId` 时回退对象 key，跳过无效条目；新增升级兼容 E2E 回归。
- Service 493 用例（1 跳过）、Playwright 193 用例全绿。

## [2.0.0-alpha.22]

- 修复启用 BattlEye 后多个 RCon 实例反复登入：新增按实例复用的 RCon 会话池（单飞登录、串行命令、失败冷却、空闲断开），仪表盘/监控/远程控制共享同一次登录；监控采集合并为单次往返，dashboard 增加 20 秒缓存节流。
- 修复软件内「连接远程控制」无效：启动参数补充 `-bepath` 指向实例 BattlEye 目录并复制运行时文件，`BEServer*.cfg` 真正生效；启动前自动刷新 BattlEye 配置。
- RCon 端口与游戏端口相同时自动偏移（BattlEye 要求独立端口），配置写入端与客户端共用同一推导；前端默认 `rconPort=2303`、首服向导取游戏端口±1，RCon 页显示实际端点与失败原因。
- `RconClient` 并发 `connect()` 共享一次握手，`disconnect()` 立即结算挂起命令，避免假死与 `Not connected`。
- Service 493 用例（1 跳过）、Playwright 192 用例全绿。

## [2.0.0-alpha.21]

- 签名工作台：逐 PBO 签名覆盖与公钥内容比对、七类明确状态、AND/OR 组合筛选、本服已启用待处理视图、复制/CSV 导出、显式批量公钥部署并复扫。
- 无人运行与独立健康：无人组合预览与缺失任务阻断；独立 `@a3st_health` 未压缩 PBO 心跳；RPT 增量/轮转/多实例读取；在线与 FPS 未知不写 0。
- 受保护维护：逐服策略模板、时区窗口与跨午夜、活动保护、10/5/1 分钟广播；共享物理目录与同 ID 独立副本；全局 SteamCMD 队列与维护锁；六步有备份原位更新与回滚，故障后需人工显式释放。
- 运维闭环：备份仅保留最近一批成功批次、预算超限每批次一次告警、检查点重启恢复；旧更新 Cron 需预览确认后停用并同步调度器，非更新任务不变。
- 事件与 Agent 接口：独立 `a3st_operations.db`、游标事件与 30 天保留、只读 Token（仅 3 个 GET）、SMTP 设置与测试邮件、失败按 1/5/15/60 分钟重试。
- 新增维护、健康、事件、签名工作台的 Playwright 用例与 UI 异常载荷防御；Service 479 用例（2 跳过）、Playwright 192 用例全绿。

## [2.0.0-alpha.20]

- 新增 Linux 便携包（Release 资产 `Arma3ServerTools-linux-<version>.tar.gz`）：内置 Service 与 Web 控制台，解压后 `bash start.sh` 即可在 VPS/小主机上用浏览器操作；附带 `a3st.env.example`、systemd 单元模板与部署 README。
- 新增 `build:web:service`（`--base /`）：修复 Service 根路径托管时多级路由（如 `/console/:id/:tab`）刷新后静态资源 404 的问题；打包脚本会校验 base，防止误用相对路径产物。
- Release 流水线新增 Linux 构建 job（构建并上传 tar.gz + sha256）；CI 增加打包脚本回归。

## [2.0.0-alpha.19]

- 修复已同步模组仍显示「有更新」：比对时优先读 Steam `appworkshop_107410.acf` 的 `timeupdated`，下载成功后再写入 `.a3st-synced` 并刷新目录时间，避免作者包内旧 mtime 误报。

## [2.0.0-alpha.18]

- 安全依赖：`electron-builder` 升至 26.18（`afterPack` 恢复 service `node_modules`），并用 overrides 钉住 `tar` / `builder-util-runtime` / `minimatch` / `glob`；`npm audit` 归零。

## [2.0.0-alpha.17]

- SteamCMD 支持「优先缓存登录」（只传用户名，省略密码）；Guard 等待时不再自动重试。
- 定时任务新增「检查/更新模组」：禁更窗外发现启用模组有更新时，先停全部服务器再下载并重启先前在跑的服。
- 模组 HTML 导入 `mode` 真正生效（仅下载 / 合并启用 / 替换启用）；PBO 上传加固文件名与大小限制。
- 非 loopback 绑定且未配置 `API_TOKEN` 时拒绝管理 API；健康检查如实反映绑定与鉴权；补充反向代理说明。

## [2.0.0-alpha.16]

- 修复安装包启动报 `Cannot find package 'fastify'`：electron-builder 退回 25（v26 会剥离 extraResources 里的 service `node_modules`）。

## [2.0.0-alpha.15]

- 修复桌面端点「启动」后 ArmA3 服务器控制台窗口不显示：Service 无控制台，子进程需 `detached:true` 才能新建窗口（等效 `.bat` 的 `start`）。

## [2.0.0-alpha.14]

- CI runner 固定为 ubuntu-24.04，修复 Playwright 1.60 不支持 ubuntu26.04 导致的 E2E 安装失败。
- 依赖安全升级：Electron 33→45、electron-builder 25→26、vitest 4.1.8→4.1.12，`npm audit` 归零（含 tar critical 等 172 条 Dependabot 告警）。

## [2.0.0-alpha.13]

- 复用已有本机 Service 时记录监听 PID；退出与「保存并重启」会释放端口，避免撞端口或孤儿残留。
- 监控库初始化失败时读写改为安全跳过，不再拖垮查询路径。

## [2.0.0-alpha.12]

- Windows 重启后若服务没有托管控制台页面，桌面壳不再把 HTTP 404 当成界面；端口占用会重试，并回退到本地页面。
- 切换服务器实例时重载任务与设置页，避免把上一套任务配置写进当前配置。
- 去掉已弃用的 `tsconfig` `baseUrl`，并显式设置 `rootDir`。

## [2.0.0-alpha.11]

- 修复 Windows CI：SteamCMD 孤儿进程清理改用 `-EncodedCommand` + `Get-Process`，避免 PowerShell stdin 挂死导致测试超时。

## [2.0.0-alpha.10]

- 移动端 Capacitor：LAN cleartext / CapacitorHttp；壳层底栏与动作条折叠；连接单击即连；日志/工坊手机布局；E2E 改用 data-testid。
- Linux 被控部署与静态 UI `WEB_ROOT` 解析增强；Console 日志与 SteamCMD 取消/锁修复（随主线累积）。

## [2.0.0-alpha.9]

- 配置了 API Token 时仍允许加载静态 UI（`/`、`/assets/*`）；Electron「本机」连接自动同步被控 Token，避免打开就 `Unauthorized`。

## [2.0.0-alpha.8]

- Electron 安装包优先从 `http://127.0.0.1:<port>/` 加载 UI；控制台路由同步打包；隐藏默认 File/Edit 菜单；连接主机后白屏修复。
## [2.0.0-alpha.7]

- SteamCMD「取消当前操作（不再重试）」：杀进程后禁止内部/solo 重试，并取消相关异步任务；工坊页按钮同步强化。
- 模组页新增「更新/下载选中」与「仅更新有更新的模组」入口（按勾选 / outdated 子集下载，非整库）。
- Electron：web `base` 固定相对路径；界面 `did-fail-load` 时回退到本机 Service 静态页，缓解关进程后再开空白窗。

## [2.0.0-alpha.6]

- `PUT/PATCH ?writeCfg=true` 真正调用 `writeAll` 落盘 server.cfg（修复 #9）。
- `write_cfg` 的 `class Missions` 只写 `missions[0]`，备选列表留在工具配置（修复 #13 / #11 任务不一致）。
- clone/整包导入清零或校验 `processById`；进程身份校验匹配 `-name=<uuid>` / `-port`（修复 #10）。
- 保存配置时保留 manifest `configName`；`GET /servers` 优先返回 `server.configName`（修复 #11）。
- 补全 `GET /actions` 的 taskActions / restEndpoints；新增 `DELETE /tasks/:taskId` 与 SteamCMD abort，可真正中止 `download_mods`（修复 #11 / #12）。

## [2.0.0-alpha.5]

- 去掉 `asarUnpack` 通配（Release 在 monorepo 下会因 `packages/api-client` 路径校验失败）；preload 仍用 asar 内 CJS。
- 修复 `switch_mission`：将目标任务置顶为 `Mission1`，并写入游戏 cfg（此前仅 append、不改顺序）。

## [2.0.0-alpha.4]

- Electron preload 改为 CJS，修复「被控设置仍显示 Web 模式」`electronAPI` 未注入。
- 被控设置可返回「主机连接」；控制台右上角改为「登出」。
- 配置类页面与任务页补页内「保存」；工坊模式顶栏也可保存。

## [2.0.0-alpha.3]

- Electron 打包窗口改回 `file://` + preload，本机不再被当成浏览器（选目录 / 被控设置可用）；连接 API 仍走 `:19580`。
- SteamCMD 下载失败时带上 CDN 地址，并提示检查 hosts / 代理。

## [2.0.0-alpha.2]

- 安装包内嵌 Service 补齐 `undici` 等生产依赖（修复启动时报 `ERR_MODULE_NOT_FOUND`）。

## [2.0.0-alpha.1]

- Electron 安装包改为通过本机 Service（`http://127.0.0.1:19580`）打开界面，修复连接页 `Failed to fetch`。

## [2.0.0-alpha] — v2 主线

- **技术栈**：Vue 3 + Electron + Node.js（`@a3st/service`）替代 WinForms + C# `Agent.Host`。
- **控制面板**：连接本机/远程被控服务、多服控制台、配置包编辑与「写入游戏配置」。
- **HTTP API**：Fastify `/api/v1`，与 v1 Agent 能力大体兼容（以 `GET /api/v1/actions` 为准）。
- **文档**：新增 [v2-quickstart.md](v2-quickstart.md)；索引与 README 标明 v1/v2 分界。
- **界面用语**：统一「保存 / 写入游戏配置 / 开服检查」；模组页「导入模组」「已选」等。

## [1.6.0] — v1（WinForms）

- **ServerConfigSession 架构**：内存模型为唯一真相；`Patch` 即时更新；`ConfigPersistenceService` 按 UUID 串行落盘；启动列表仅读 manifest 摘要。
- **快照策略**：默认「写入服务器前 + 后台异步」；可在 **服务器** 菜单关闭或改为保存前；设置持久化于 `ui-settings.json`。
- **异步 API**：新增 `WriteAllAsync`、`StartAsync`、`StopAsync` 等异步方法，提升 UI 响应性。
- **并行处理**：配置文件并行写入（`Task.WhenAll`），减少 I/O 等待时间。
- **数据库优化**：批量插入玩家信息，显著提升监控性能；进程验证添加 2 秒超时，避免 UI 阻塞。
- **窗口布局**：优化最小尺寸（820→780），调整分割比例（34%→30%），增加设置面板空间。
- **模组表格**：移除冗余的 Workshop ID 列，重新分配列宽，改善长文本显示。
- **按钮整合**：模组面板 9 个独立按钮整合为 4 个分组（2 个下拉菜单 + 2 个直接按钮），减少视觉混乱。
- **文本简化**：主要按钮和状态文本更简洁（"保存到工具"→"保存配置"，"应用到服务器目录"→"写入服务器"）。
- **托盘提示**：首次最小化到系统托盘时显示气球提示，改善功能发现性；简化 UUID 显示。
- **功能开关**：`PerformanceFeatures` 类支持性能优化的受控发布；扩展 `UiPerformanceProbe` 支持详细性能指标追踪。
- **配置快照**：按 `AutoSnapshotMode` 在保存/写入前可选自动备份（默认写入前）；概览页可手动备份、恢复与删除。
- **开服体检**：概览页一键检测 SteamCMD、模组路径、Bikey 就绪、启动命令行长度、Keys 目录等；报告可复制。
- **Bikey 就绪视图**：模组页显示已启用模组的 🟢🟡🔴 统计，支持「复制缺失 Bikey」仅处理未复制的已启用模组。
- **Agent 能力补全**：`disable_mods`、`PATCH config`；读-改-应用链条统一（Session 失效、`write_cfg`=SaveAndWrite、`writeCfgAfter`/`restartAfter`、REST/上传 `?writeCfg=true`）。

## [1.5.0]

- **A3ST 配置包**：`config/{uuid}/` 分片存储（`manifest.json`、`mods.json` 等）；旧版 `config/{uuid}.json` 自动迁移。
- **保存与应用分离**：「保存到工具」只写配置包；「应用到服务器目录」写 `server.cfg` 等；「启动」不再自动写 cfg。
- **同步状态**：仅「已保存 / 未保存」；不再跟踪游戏目录 cfg 手改漂移。
- **性能**：大模组列表下保存/应用/刷新加速（快照、扫描、启动参数构建等优化）。
- **预检**：无 `server.cfg` 时启动被阻断并提示先应用。
- **Agent**：`save` / `write_cfg` / `start` 语义与 GUI 对齐（见 [config-workflow.md](config-workflow.md)、[agent-capabilities.md](agent-capabilities.md)）。

## [1.4.2]

- 修复仅启用服务器模组时 bikey 不会自动复制的问题。
- 新增「复制全部 Bikey」按钮，可手动对当前扫描列表批量复制。
- bikey 改为只复制不删除；扫描模组时若开启自动复制则同步全部模组；多余密钥不影响服务器运行。

## [1.4.1]

- 修复模组 bikey 签名状态检测与自动复制逻辑不一致（递归查找、复制后文件名判断）。
- Agent：Kestrel HTTP API、能力发现 `GET /api/v1/actions`、配置 CRUD、文件上传、异步任务、SteamCMD/游戏日志读取等（见 [agent-capabilities.md](agent-capabilities.md)）。

## [1.4.0]

- UI 迁移 AntdUI；顶栏与响应式布局；设置 dirty/baseline；模组扫描受保护路径容错；带时间戳安装包等。

## [1.3.0]

- 监控与统计增强、定时任务与导出相关改进（详见归档发布说明）。

## [1.2.x]

- 1.2.3：稳定性与回归修复。  
- 1.2.2 / 1.2.1 / 1.2.0：WinForms 分层、RCon、模组、SteamCMD 等能力补齐。

## [1.1.x]

- 1.1.1 / 1.1.0：开源发布准备、文档与打包流程。

## [1.0.0]

- 去 DevExpress、.NET 10 分层重构后首个公开发布基线。

---

## 发布操作

版本号：`Directory.Build.props` 中的 `Version`。

```powershell
.\scripts\build-release.ps1
```

打 tag 示例（维护者，需先提交版本与文档变更）：

```powershell
git tag -a v1.5.0 -m "Arma3 Server Tools v1.5.0"
git push origin v1.5.0
```

完整清单见 [archive/releases/release-v1.5.0.md](archive/releases/release-v1.5.0.md)。
