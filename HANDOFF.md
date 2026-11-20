# A3ST 交接文档（当前状态）

> 本文档描述工作区的**当前真实状态**，不再保留历次 Milestone 派遣指令。
> 历史审计与升级过程见 [docs/archive/](docs/archive/) 与 [docs/backend-performance-security-audit.md](docs/backend-performance-security-audit.md)。

## 一、项目结构

npm workspaces monorepo：

| 目录 | 说明 |
| --- | --- |
| `packages/web` | Vue 3 + Vite + Element Plus 控制台 SPA（Web / Electron 渲染层共用） |
| `packages/service` | Fastify 5 + SQLite(sql.js) 本地服务，对应 `@a3st/service` |
| `packages/api-client` | 前端与 Service 共享的 API 客户端与类型 |
| `apps/desktop` | Electron 主进程 / preload 外壳（vite-plugin-electron 构建） |
| `apps/mobile` | Capacitor Android 壳 |
| `DestinyServerMonitoring` | 服务器监控扩展 DLL（C#，独立于 npm 构建） |

Service HTTP 路由按域拆分在 `packages/service/src/api/routes/`（servers / steamcmd / settings / mods / logs / monitoring / schedule / snapshots / bans / files / tasks；公共的 `envelope` 与查询参数解析在 `shared.ts`，命令执行在 `task-commands.ts`），`routes.ts` 只保留 preValidation 校验钩子与各域注册入口。前端 `ModsView.vue` 仅负责模板与组件装配，业务逻辑集中在 `composables/useModsPage.ts`。

## 二、关键交互模型（本轮已落地）

1. **两级保存模型**：页面编辑 → 保存到配置包（`patchConfig`）→ 顶部「应用更改」写入游戏配置（`write_cfg` 生成 server.cfg / basic.cfg）→ 重启生效。
   - 工具栏「保存」只在存在活动编辑器时出现，概览/模组/日志等无编辑器的页面不再显示假保存。
   - 「应用更改」先自动保存脏编辑器，再写 cfg；运行中会询问「立即重启 / 稍后」。
   - 页内「保存」成功后立即刷新 sync-state（`CONFIG_EDITOR_KEY.onSaved`），同步横幅无需等轮询。
   - 底部状态栏 SYNC 四态：未保存 / 需写入 / 已写入·重启后生效 / 已同步。
2. **多实例定位**：实例 UUID 写入 URL query `?server=<uuid>` 并按连接记忆到 localStorage，刷新/前进后退/分享链接不会改错服。
3. **危险操作分级确认**：删除主机、恢复快照（覆盖配置包）、停止/重启运行中的服务器、临时/永久封禁均二次确认；RCON 操作需先在玩家表中显式选中玩家。
4. **术语基线**：日志模式 → 运维（OPS）；登出 → 切换主机；被控设置 → 服务设置/本机服务；Nodes → 主机连接；封禁区分为「本地封禁」（bans.txt）与「在线封禁（BattlEye）」。

## 三、视觉基线（Material Design 3）

- `packages/web/src/styles/m3-theme.css` 最后加载，是唯一权威主题层：Google Blue `#0b57d0`、完整 M3 color roles / typescale / shape / elevation、Element Plus 组件映射（胶囊按钮、tonal 语义色、无斑马纹表格）。
- 壳层：浅色顶栏 + 196px 导航抽屉（激活药丸）+ M3 tabs 子导航 + 底部状态行。
- 样式层序（自底向上）：`element-plus/dist/index.css` → `desktop-theme.css`（`--a3st-*` 令牌源）→ `shell-v2.css`（外壳结构）→ `m3-theme.css`。`ark-visual.css`、`feature-flags.ts`、`visualTheme.ts` 与 `views/demo/*` 已删除，不再有 `data-visual` 分支。
- 连接页使用 M3 页头（28px/400 标题、primary 色眉标、透明背景 + outline 分隔线），只有一个 h1，不要再加工具栏重复标题。
- 新增/修改 UI 时优先使用 `--md-sys-color-*` / `--md-sys-typescale-*` token，不要回头使用 `desktop-theme.css` 的旧变量或全大写 mono 排版。

## 四、构建与验证

```powershell
npm run typecheck                    # 根 + 各 workspace tsc
npm -w @a3st/web run build           # Web 生产构建（含 __APP_VERSION__ 注入）
npm -w @a3st/service run test        # Service 单元测试 (Vitest)
npm run test:e2e                     # Playwright E2E（194 例；需先 build:service，由 ci-e2e.ps1 启动真实 Service）
```

当前基线（最近一次全量验证）：根/Web/Desktop typecheck 通过，Web build 通过，Service 69 文件 493 用例通过（1 跳过），Playwright 194 用例全绿。

桌面端：`npm -w @a3st/desktop run typecheck` / `npm run build:desktop`（scripts/build-desktop.ps1）。
本地提交前建议 `scripts/ci-local.ps1`。

Linux 便携包：`npm run pack:linux`（build:service + build:web + `scripts/pack-linux.mjs`）→ `artifacts/linux/Arma3ServerTools-linux-<version>.tar.gz(.sha256)`。包内为 `service/`（dist + 生产依赖）+ `web/` + `start.sh` + `a3st.env.example` + `a3st.service`，Service 通过 `WEB_ROOT` 直接托管 Web UI；release workflow 的 `linux-bundle` job 在 tag 时自动构建上传，CI 在 Node 20 上跑一次打包脚本回归。

版本号单一来源：根与各包 `package.json`（当前 `2.0.0-alpha.23`）。前端通过 Vite `define.__APP_VERSION__` 注入，状态栏与关于页不再硬编码。

## 五、仓库卫生约定

- 不入库：`node_modules/`、`dist/`、`artifacts/`、`.tmpbuild/`、`.a3st-dev-data/`、`.a3st-e2e-data/`、`test-results/`、`apps/desktop/dist-electron/`、`apps/desktop/dist-stub/`、`.qoder/`。
- `apps/desktop/dist-electron` 与 `dist-stub` 已从索引移除，由 `vite` / `vite-plugin-electron` 在 dev/build 时生成。
- `.qoder/repowiki` 为 IDE 生成的知识库：早期版本曾入库，现改为忽略；若工作区出现大量删除/修改属工具重生成，请勿手工恢复。

## 六、已知待办

- E2E 在本地需真实起 Service；CI 见 `.github/workflows/ci.yml`。
- `docs/known-issues.md` 中的历史条目未逐条复核，接手时以代码与测试为准。
