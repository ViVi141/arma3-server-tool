# A3ST Material Design 3 升级 & 后端审计加固 — 交接文档 (HANDOFF)

> **当前状态**：已按指令终止所有后台 Teamwork 子智能体，工作区代码处于可编译、测试全绿的干净交接状态。你可以直接将本文档或其中的子任务拆分发给任意单独的智能体继续执行。

---

## 一、 已完成并落地的成果总览

### 1. Milestone M3：后端（`@a3st/service`）性能、BUG 修复与安全加固（100% 完成并通过验证）
* **详细审计报告**：[docs/backend-performance-security-audit.md](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/docs/backend-performance-security-audit.md)（涵盖 `PERF-1..8`、`BUG-1..15`、`SEC-1..7` 共 30 项源码级定位、行号与修复验证）。
* **已落地的源码修改（21 个后端核心文件）**：
  * **安全加固（F13）**：
    * [identity.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/process/identity.ts) & [manager.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/process/manager.ts)：`isValidPid` 校验，消除 `execSync` 字符串拼接，改用 `execFileSync` + 环境变量与 `-EncodedCommand`；
    * [arguments.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/steamcmd/arguments.ts)、[console-capture.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/steamcmd/console-capture.ts)、[steamcmd/manager.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/steamcmd/manager.ts)：在写入 `sessionOutput` 与 SSE 流前对 Steam 登录密码进行脱敏；
    * [app.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/app.ts)：Fastify Pino 日志脱敏 `?token=`，API Token 校验改用 `createHmac` + `crypto.timingSafeEqual` 防时序攻击；
    * [upload-safety.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/util/upload-safety.ts)、[store.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/config/store.ts)、[snapshot.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/config/snapshot.ts)、[game-config-writer.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/config/game-config-writer.ts)、[reader.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/logs/reader.ts)、[bans-service.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/bans/bans-service.ts)：全面接入 `assertSafeId`、`assertSafeSubdirPath` 与 `assertSafeTargetPath` 防目录遍历。
  * **BUG 与性能热点修复（F14）**：
    * [port-check.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/process/port-check.ts)：将错误的 TCP `LISTEN` 探测修正为 UDP 端口就绪探测，解决开服等待 45 秒超时阻塞问题；
    * [db.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/monitoring/db.ts) & [cron-sync.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/scheduling/cron-sync.ts)：新增事务级 `batchInsertPlayers` 与 `recordCollectionTick` 单次落盘，并确保启动时 `await monitorDb.waitReady()`；
    * [scanner.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/mods/scanner.ts) & [mod-config-sync.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/mods/mod-config-sync.ts)：支持 `skipSize: true` 快速通道，非 UI 扫描不再递归统计目录体积；
    * [routes.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/api/routes.ts)、[sse.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/api/sse.ts)、[proxy-fetch.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/steamcmd/proxy-fetch.ts)、[headless.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/service/src/process/headless.ts)：修复 `rcon_ban` / `rcon_mission` 参数传递、`PUT /rename` 同步 `config.server.configName`、`mission-pbo?writeCfg=true`、`text/html` 解析及进程/SSE/代理连接优雅关闭。
* **测试验证**：`npm -w @a3st/service run test` **42 个测试文件 / 250 个测试用例全部通过**。

---

### 2. Milestone M1：前端 M3 核心设计系统、壳层、命令面板与路由守卫（主体已落地，构建通过）
* **新增核心文件**：
  * [M3Icon.vue](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/components/M3Icon.vue)：零 CDN 依赖的本地内联 Material Symbols SVG 图标组件（支持 Electron/Capacitor 离线运行）。
  * [theme.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/config/theme.ts)：响应式明暗主题管理（支持 `system -> light -> dark` 循环切换并同步 Electron IPC）。
  * [command-registry.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/config/command-registry.ts) & [CommandPalette.vue](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/components/CommandPalette.vue)：`Ctrl+K` 全局命令/页面/配置项/实例搜索浮层（`data-testid="command-palette"`）。
  * [backgroundTasks.ts](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/stores/backgroundTasks.ts)：全局非阻塞后台任务 Store 与 M3 Snackbar 状态管理。
* **已升级壳层文件**：
  * [m3-theme.css](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/styles/m3-theme.css)、[shell-v2.css](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/styles/shell-v2.css)、[App.vue](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/App.vue)、[ConsoleShell.vue](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/components/console/ConsoleShell.vue)、[ServerConsoleView.vue](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/views/ServerConsoleView.vue)、[UnsavedChangesDialog.vue](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/components/UnsavedChangesDialog.vue)、[DashboardHero.vue](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/components/dashboard/DashboardHero.vue)、[DeployOpsBar.vue](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/src/components/console/DeployOpsBar.vue)。
* **构建验证**：`npm --prefix packages/web run build` 与 `npm --prefix packages/web run build:mobile` 均已通过（exit 0）。

---

### 3. E2E 测试套件（171 个 Playwright 测试用例已编写并通过 TS 编译）
* 位于 [packages/web/e2e/](file:///c:/Users/74738/Desktop/Projects/Arma3/arma3-server-tool/packages/web/e2e/helpers.ts)，包含 `basic.spec.ts`、`m3-shell.spec.ts`、`m3-settings-forms.spec.ts`、`m3-mods-tasks.spec.ts`、`m3-views-responsive.spec.ts`、`m3-workflows.spec.ts`。

---

## 二、 待继续手动派遣的任务清单（按推荐执行顺序）

你可以按下面 **3 个独立任务包** 依次派遣给智能体：

### 任务包 1：M1 细节修补（M1 Iteration 2）
> **可直接复制给智能体的指令**：
> 请参考 `HANDOFF.md` 完成 Milestone M1 的 4 项审查修补，并验证 `npm --prefix packages/web run build` 和 `build:mobile`：
> 1. 在 `packages/web/src/components/M3Icon.vue` 中补充缺失的 `"article"` 图标路径，并核对全站所有 `<M3Icon>` 的 `name` 均存在对应 path；
> 2. 在 `packages/web/src/styles/shell-v2.css` 与 `m3-theme.css` 中确保移动端（`<=768px` 及 `html.is-mobile-app`）顶栏与底栏可点击按钮满足 `>=44px` (`2.75rem`) 触控热区，修复 `769px–800px` 下 `.shell-v2__rail-label` 字号被压成 `0px` 的问题；
> 3. 在 `packages/web/src/config/command-registry.ts` 与 `ServerConsoleView.vue` 中核对配置项搜索高亮关键词（needle）与各设置视图 `.vue` 中的真实 `<label>` 文本一致；
> 4. 在 `packages/web/src/components/CommandPalette.vue` 中处理中文输入法 `isComposing` 状态下的回车事件，在 `packages/web/src/stores/backgroundTasks.ts` 中防止同一 `taskId` 重复启动 `pollTask`。

---

### 任务包 2：Milestone M2（设置双栏表单、Checkbox/Switch 语义、模组工作台与全站视图升级）
> **可直接复制给智能体的指令**：
> 请参考 `HANDOFF.md`、`skills/material-design-3/SKILL.md` 及 `design-preview/06-material3-skill.html`，完成 Milestone M2（特性 F9–F12）：
> 1. **F9 设置页双栏响应式布局**：在 `SettingsViewLayout.vue`、`ArkTechPanel.vue` 及各设置页（`BasicSettings.vue`、`PerformanceView.vue`、`NetworkView.vue`、`SecurityView.vue`、`DifficultyView.vue`、`LogSettingsView.vue`）应用 `.m3-form-grid`（宽屏 `>1024px` 双栏、窄屏单栏；多行文本/路径占满两列 `.m3-form-span-2`），确保 `.settings-page__header` (`data-testid="btn-page-save"`) 可见且无冗余嵌套边框；
> 2. **F10 明确区分 Checkbox 与 Switch**：将所有需点击“保存”才生效的布尔配置项（含 `BasicSettings`、`PerformanceView`、`NetworkView`、`SecurityView`、`DifficultyView`、`LogSettingsView`、`ConfigEditor`、`SchedulerView`、`MissionsView`、`StatisticsView`、`HostSettingsView` 及全局设置弹窗）改为 `<el-checkbox>`（可使用 `.m3-check-item` 样式），仅将立即生效的开关保留为 `<el-switch>`；并在 `ConfigEditor.vue` 与 `StatisticsView.vue` 中接入 `useConfigEditorRegistration` 以支持未保存路由拦截；
> 3. **F11 模组工作台升级（`ModsView.vue`）**：
>    - 将可见性下拉框替换为 M3 筛选胶囊（`data-testid="mods-filter-all"` 全部、`mods-filter-enabled` 已启用、`mods-filter-outdated` 有更新、`mods-filter-bikey-issue` 签名异常）；
>    - 为每行模组提供可点击切换的加载角色标签（`客模 / 服模 / HC`，带 `data-testid="mod-role-client"` / `mod-role-server` / `mod-role-hc"`）；
>    - 移除 `runDownload()` 中的 `goToSteamCmd()` 强制路由跳转，改用 `useBackgroundTasksStore().startTask(...)` 在当前页提供非阻塞后台下载进度与完成后自动刷新扫描；
> 4. **F12 全站其余视图与图表 M3 统一**：将 `StatisticsView.vue` 的趋势图接入 `chart.js` / `vue-chartjs` 并使用 M3 主题色；统一 `DashboardView`、`ConnectionsView`、`PreflightView`、`SnapshotsView`、`RconView`、`BansView`、`LogsView`、`UploadView`、`SteamCmdView`、`AboutView`、`HostSettingsView`、`FirstServerWizard`、`NewServerDialog` 的 M3 表面层级与间距，保留所有既有 `data-testid` 属性，最后运行 `npm --prefix packages/web run build` 验证通过。

---

### 任务包 3：Milestone M4（E2E 用例校准与全栈集成验收）
> **可直接复制给智能体的指令**：
> 请参考 `HANDOFF.md` 完成最终验收（E2E Iteration 2 修补 + Milestone M4）：
> 1. 检查 `packages/web/e2e/*.spec.ts` 与 `helpers.ts`：
>    - 确认重命名弹窗确认按钮选择器匹配 `"保存"`；
>    - 对 Element Plus 的 `<el-checkbox>` / `<el-switch>` 断言可见外层容器（避免对 `0x0` 隐藏原生 `<input>` 调用 `toBeVisible()`）；
>    - 区分 `[data-testid="bg-task-banner"]` 与 `[data-testid="m3-snackbar"]` 的定位器；
> 2. 依次运行以下命令并修复任何失败项：
>    - `npm -w @a3st/service run test`
>    - `npm --prefix packages/web run build`
>    - `npm --prefix packages/web run build:mobile`
>    - `npm run test:e2e`

---

## 三、 详细架构与调研档案路径（供深入排查时查阅）
Teamwork 运行期间产出的所有详细设计契约与审查记录均保留在：
* `C:\Users\74738\.gemini\antigravity\scratch\teamwork\a49af907-d0dd-4852-ba51-4a6082a30770\.agents\teamwork\PROJECT.md`
* `C:\Users\74738\.gemini\antigravity\scratch\teamwork\a49af907-d0dd-4852-ba51-4a6082a30770\.agents\teamwork\teamwork_worker_m1_r1\handoff.md`
* `C:\Users\74738\.gemini\antigravity\scratch\teamwork\a49af907-d0dd-4852-ba51-4a6082a30770\.agents\teamwork\teamwork_worker_m3_r1\handoff.md`
* `C:\Users\74738\.gemini\antigravity\scratch\teamwork\a49af907-d0dd-4852-ba51-4a6082a30770\.agents\teamwork\teamwork_test_writer_e2e_r1_1\handoff.md`
