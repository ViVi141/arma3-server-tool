# Vue + Electron 客户端重构计划

> 文档版本：1.1  
> 更新日期：2026-06-12  
> 状态：**部分已落地** — v2 已实现 Vue 3 + Electron + **Node** `@a3st/service`（非本文原计划的 .NET 被控服务）  
> 当前用户文档：[v2-quickstart.md](v2-quickstart.md) · [config-workflow.md](config-workflow.md#v2-web-界面对照)  
> 关联：[architecture.md](architecture.md) · [agent-channels.md](agent-channels.md)

本文档为 **早期改造计划**（WinForms → Vue + 被控服务）。下文目标架构与仓库结构仍作历史参考；实现细节以 v2 TypeScript monorepo 为准。

---

## 一、产品目标

### 1.1 一句话

**一个开服遥控产品**：桌面端可同时 **被控**（对外提供开服能力）与 **主控**（连接本机或其它机器）；手机端 **仅主控**；开服机 Windows 上由 **.NET 服务** 执行进程、cfg、SteamCMD 等与现 Application 层一致的能力。

### 1.2 角色定义

| 角色 | 运行位置 | 能力 |
|------|----------|------|
| **被控端** | 开服机 Windows | 监听 HTTP API；启停 `arma3server`；写 cfg；SteamCMD；上传 PBO/HTML；MonitoringHost |
| **主控端（桌面）** | 任意 Windows（Electron） | 连接一台或多台被控；**可连接 `127.0.0.1` 控制自己** |
| **主控端（手机）** | Android / iOS（Capacitor） | 仅主控 UI；无被控设置、不启动 .NET 服务 |

### 1.3 明确不做（本计划范围外）

| 项 | 说明 |
|----|------|
| 远程桌面 / 屏幕流 | 不做 RDP/WebRTC 画面；只做 **结构化远控**（命令 + 文件） |
| OpenClaw / LLM 主路径 | 可选保留 HTTP 脚本；产品主线不依赖自然语言理解 |
| 用 Node 重写开服后端 | 进程、SteamCMD、BattlEye 等继续 **C# Application** |
| v1 复刻 WinForms 全部 Tab | 分阶段迁移；v1 以 **户外遥控 MVP** 为主 |

### 1.4 与现有组件关系

| 现有 | 计划 |
|------|------|
| `Arma3ServerTools.App.WinForms` | **废弃**（自 v2.0 起从安装包移除） |
| `Arma3ServerTools.Agent.Host` | **演进为** `Arma3ServerTools.Service`（被控 HTTP 宿主，API 尽量兼容） |
| `Arma3ServerTools.MonitoringHost` | **保留**，由 Service 拉起 |
| Core / Application | **保留**，客户端只换壳 |
| `skills/` · `a3st-invoke.ps1` | 可选；仍可调 Service 的 `/api/v1` |

---

## 二、目标架构

```text
┌─────────────────────────────────────────────────────────────────┐
│ 开服机 Windows                                                   │
│  Arma3ServerTools.Service.exe   (.NET，无 UI)                    │
│    · Kestrel /api/v1（鉴权、上传、task）                          │
│    · AddArma3ServerToolsApplication                              │
│    · 拉起 MonitoringHost                                         │
│  Arma3ServerTools.exe (Electron)  可选同机安装                   │
│    · 主进程：启停 Service、托盘、单实例                           │
│    · 渲染：Vue 主控 UI + 被控设置页                               │
└─────────────────────────────────────────────────────────────────┘
          ▲ HTTPS + Bearer（Tailscale / 内网 / 反代）
          │
    ┌─────┴─────┬─────────────┐
    │           │             │
  Electron     Capacitor    脚本/机器人
  (另一台 PC   (手机仅主控)   (HTTP 同 API)
   或本机主控)
```

### 2.1 桌面「双角色」在 UI 上的表达

- **被控**：设置 →「允许远程主控」、端口、Token、来访 IP、复制连接信息。  
- **主控**：连接管理 → 添加主机（名称、Base URL、Token）；预置 **「本机」** → `http://127.0.0.1:{port}`。  
- **同一套控制台页面** 渲染远程/本机，不按两套 UI 分叉。

### 2.2 手机 Capacitor

- 构建同一 Vue 应用，**路由/特性开关** 隐藏被控相关页。  
- 不打包、不启动 .NET Service（仅 HTTP 客户端）。

---

## 三、技术选型

| 层级 | 选型 | 说明 |
|------|------|------|
| 前端框架 | **Vue 3** | Composition API + `<script setup>` |
| 语言 | **TypeScript** | 全栈类型；与 `api-client` 共享 |
| 构建 | **Vite** | Web / Electron / Capacitor 共用构建配置 |
| 桌面壳 | **Electron** | 建议 `electron-vite` 或 `electron-builder` + Vite |
| 移动壳 | **Capacitor** | 同一 `dist/` 产物嵌入 WebView |
| 状态 / 路由 | **Pinia** + **Vue Router** | 连接列表、当前主机、任务轮询状态 |
| HTTP | `fetch` 或 **axios** | multipart 上传 PBO |
| UI 组件 | **Element Plus** 或 **Naive UI** | 桌面 + 移动适配；选型在阶段 0 锁定 |
| Monorepo | **pnpm workspaces** | `apps/*` + `packages/*` |
| 被控服务 | **.NET 10** `Microsoft.NET.Sdk.Web` | 自 `Agent.Host` 迁移 |
| 安装包 | Inno Setup 更新 | Electron + Service + monitoring + mod 资源 |

---

## 四、仓库结构（目标）

```text
arma3-server-tool/
├── apps/
│   ├── desktop/                 # Electron 主进程 + 打包配置
│   └── mobile/                  # Capacitor 配置与原生工程
├── packages/
│   ├── web/                     # Vue SPA（主控 UI + 被控设置）
│   ├── api-client/              # TypeScript：/api/v1 封装
│   └── shared/                  # 类型、常量、工具（可选）
├── src/
│   ├── Arma3ServerTools.Core/
│   ├── Arma3ServerTools.Application/
│   ├── Arma3ServerTools.Service/    # 新：被控 HTTP（自 Agent.Host 迁）
│   └── Arma3ServerTools.MonitoringHost/
├── scripts/
│   ├── build-release.ps1          # 扩展：前端 build + Electron 打包
│   └── ci-local.ps1               # 扩展：pnpm build + 现有 dotnet CI
├── docs/
│   └── vue-electron-client-plan.md
└── pnpm-workspace.yaml
```

**保留但标记遗留（迁移完成后移除）**

- `src/Arma3ServerTools.App.WinForms/`
- `src/Arma3ServerTools.Agent.Host/`（合并进 Service 后删除）

---

## 五、API 策略

### 5.1 v1 原则

- **复用** 现有 `GET /api/v1/actions` 与 [agent-channels.md](agent-channels.md) 路径，减少后端改动。  
- Vue 客户端 **禁止硬编码 action 名**；启动时或开发模式拉取 `actions` 做校验/文档链接。

### 5.2 v1 客户端依赖的端点

| 类别 | 端点 | 用途 |
|------|------|------|
| 探活 | `GET /api/v1/health` | 连接测试 |
| 能力 | `GET /api/v1/actions` | 能力发现 |
| 服列表 | `GET /api/v1/servers` | 连接后选服 |
| 状态 | `GET /api/v1/servers/{uuid}/status` | 仪表盘 |
| 配置读 | `GET /api/v1/servers/{uuid}/config` | 任务列表下拉、模组列表 |
| 配置改 | `PATCH /api/v1/servers/{uuid}/config?writeCfg=true` | 后续阶段 |
| 任务 | `POST /api/v1/task`（`async: true`） | 启停、换图、模组 |
| 任务查询 | `GET /api/v1/tasks/{taskId}` | SteamCMD 进度 |
| 上传 | `POST .../files/mission-pbo` | PBO |
| 上传 | `POST .../files/mod-list-html` | HTML 模组列表 |
| 日志 | `GET .../logs/read` | 简版 RPT 查看 |
| RCon | task：`rcon_players` 等 | 在线人数 |

### 5.3 计划新增（阶段 2+，简化 App 逻辑）

| 端点 | 说明 |
|------|------|
| `POST /api/v1/servers/{uuid}/mission/switch` | 换图 + 可选重启，单请求 |
| `POST /api/v1/servers/{uuid}/mods/download` | `modIds` + 挂服 + 可选 async |
| `GET /api/v1/servers/{uuid}/missions` | 任务列表摘要（免整包 config） |

新增端点内部仍调用 `ServerAutomationService`，与 task JSON 等价。

### 5.4 配置持久化

- Service 继续使用 `{UserData}/config/agent/settings.json` 或 **重命名** 为 `config/service/settings.json`（迁移时双读一期）。  
- Electron 被控设置页通过 **Service REST** 读写（阶段 1 可先编辑 JSON + 重启 Service）。

---

## 六、Electron 主进程职责

| 职责 | 说明 |
|------|------|
| 启停 Service | 子进程 `Arma3ServerTools.Service.exe`，工作目录为安装根 |
| 单实例 | 复用现有互斥逻辑（可迁到 Node `requestSingleInstanceLock`） |
| 托盘 | 最小菜单：打开控制台 / 退出（退出时停 Service、停 MonitoringHost） |
| 路径检查 | 启动时检测安装路径与用户数据路径 **不含中文** |
| 资源路径 | 开发/生产解析 `Service.exe`、`monitoring/` 位置 |
| 深度链接 | v2：可选 `a3st://connect?...` |

**安全**：主进程不向渲染进程暴露 `nodeIntegration`；`contextIsolation: true`；Token 存 `safeStorage` 或加密本地文件。

---

## 七、Vue 应用模块（packages/web）

### 7.1 路由（桌面完整版）

| 路径 | 页面 | 手机 |
|------|------|------|
| `/connections` | 连接管理（含「本机」） | ✅ |
| `/settings/host` | 被控：端口、Token、远程开关 | ❌ 隐藏 |
| `/console/:connectionId` | 选服 | ✅ |
| `/console/:connectionId/dashboard` | 状态、启停、重启 | ✅ |
| `/console/:connectionId/missions` | 换图 | ✅ |
| `/console/:connectionId/mods` | 加模组 / 上传 HTML | ✅ |
| `/console/:connectionId/upload` | 上传 PBO | ✅ |
| `/console/:connectionId/logs` | 日志简览 | 可选 v2 |
| `/console/:connectionId/settings` | 完整配置编辑 | 桌面 v2+ |

环境变量 `VITE_APP_MODE=mobile` 时注册路由守卫，重定向 `/settings/host`。

### 7.2 连接模型

```typescript
interface SavedConnection {
  id: string;
  name: string;
  baseUrl: string;      // http://127.0.0.1:19580 或 Tailscale URL
  token?: string;
  isLocal?: boolean;
}
```

本地存储：`localStorage`（Capacitor 可用 Preferences 插件同步）。

---

## 八、分阶段实施

### 阶段 0：决策与骨架（1–2 周）

| 任务 | 验收 |
|------|------|
| 锁定 UI 库（Element Plus / Naive UI） | ADR 或本文件附录记录 |
| 初始化 pnpm workspace + `packages/web` + Vite | `pnpm dev` 可打开空白页 |
| 初始化 `apps/desktop` Electron 空壳加载 Vite | 窗口显示 Vue |
| 创建 `src/Arma3ServerTools.Service` 项目 | 与 `Agent.Host` 行为一致，`dotnet run` 可 health |
| CI 草案 | 文档记录；可不阻塞主线 |

**出口**：桌面窗口 + Service 可独立运行。

---

### 阶段 1：被控服务 + 本机主控 MVP（2–3 周）

| 任务 | 验收 |
|------|------|
| Service 迁入 `AgentApiEndpoints`、鉴权、上传 | 与现有 Agent 集成测试对照 |
| Service 拉起 `MonitoringHost`（自 WinForms 迁出 launcher） | 启服后监控健康检查通过 |
| `packages/api-client`：health、servers、status、task、upload | 单元测试（vitest） |
| Vue：连接页 + 本机默认连接 | 一键连 `127.0.0.1` |
| Vue：仪表盘（状态、重启、停、启） | 对本机 Service 可操作 |
| Electron 主进程启停 Service | 关 Electron 退出时 Service 停止 |
| 设置页只读：端口、Token 展示 | 与 settings.json 一致 |

**出口**：**无 WinForms** 即可完成本机启停与重启。

---

### 阶段 2：户外核心能力（2–3 周）

| 任务 | 验收 |
|------|------|
| Vue：任务列表 + `switch_mission` + 重启 | 换图并重启成功 |
| Vue：模组 ID 输入 + `download_mods` async + 进度 UI | 轮询 task / steamcmd log |
| Vue：PBO 上传（multipart） | 部署到 MPMissions |
| Vue：被控设置（远程开关、白名单） | 保存后 Service 重启生效 |
| 远程连接验收 | B 机 Electron 或 curl 连 A（Tailscale） |
| （可选）简化 REST：`mission/switch`、`mods/download` | App 不再手写 task JSON |

**出口**：满足「户外换任务、加模组」；另一台 PC 主控可用。

---

### 阶段 3：Capacitor 手机（1–2 周）

| 任务 | 验收 |
|------|------|
| `apps/mobile` + Capacitor Android 构建 | APK 可安装 |
| `VITE_APP_MODE=mobile` 构建管线 | 无被控页 |
| 文件选择上传 PBO（Capacitor 插件） | 真机上传成功 |
| 连接配置与桌面可共用（手动输入 URL） | 手机连家里 Service |

**出口**：手机主控 v1 与桌面主控功能对齐（MVP 子集）。

---

### 阶段 4：安装包与 WinForms 下线（1–2 周）

| 任务 | 验收 |
|------|------|
| 更新 `scripts/build-release.ps1` | 产出 `Arma3ServerTools-Setup-*.exe` |
| 安装包内容：Electron + Service + monitoring + mod | 干净机安装后可开服 |
| 从 sln 移除 WinForms；Agent.Host 合并完成 | CI 全绿 |
| 更新 README、`first-server-guide`、architecture | 无 WinForms 主路径 |
| `skills/` 默认 URL 指向 Service | 脚本仍可用 |

**出口**：**v2.0.0** 发布；WinForms 仅 archive 或删除。

---

### 阶段 5：体验补齐（持续）

按优先级 backlog：

| P | 功能 |
|---|------|
| P1 | 首次建服向导（Vue）、`preflight` 展示 |
| P1 | 配置 PATCH 表单（网络、RCon、基本） |
| P2 | 统计图表（Chart.js 替代 ScottPlot） |
| P2 | 定时任务、封禁管理 |
| P3 | iOS Capacitor、扫码配对、设备码 |
| P3 | Windows Service 模式（无 Electron 也可被控） |

---

## 九、测试策略

| 层 | 方式 |
|----|------|
| `api-client` | Vitest + mock fetch |
| `packages/web` | Vitest 组件测试；关键流程 Playwright（桌面） |
| Service | 现有 Application 测试保留；HTTP 集成测试可选 `WebApplicationFactory` |
| 发版 | 扩展 [smoke-checklist.md](smoke-checklist.md)：Electron 本机 + 手机 Tailscale 各一条 |

---

## 十、风险与缓解

| 风险 | 缓解 |
|------|------|
| Electron 安装包体积大 | 接受；或后续考虑 Tauri 仅桌面 |
| Steam Guard 无头失败 | UI 明确提示；task `captureSteamCmdOutput: false` |
| 大 PBO 移动上传失败/慢 | 限制提示；推荐 QQ 机器人直传 Service |
| Service 与 Electron 生命周期 | 主进程严格管理子进程；崩溃重启策略 |
| 配置编辑远复杂于 WinForms | 分阶段；v1 不承诺全 Tab |
| Capacitor iOS 审核 | 阶段 3 先 Android；iOS 后移 |

---

## 十一、里程碑与版本号建议

| 版本 | 内容 |
|------|------|
| **v2.0.0-alpha** | 阶段 1：Service + Electron 本机 MVP |
| **v2.0.0-beta** | 阶段 2：换图、模组、远程 |
| **v2.0.0** | 阶段 3–4：手机 + 新安装包 + WinForms 移除 |
| **v2.1.0** | 阶段 5 P1 配置与向导 |

---

## 十二、阶段 0 立即行动清单

1. 在仓库根添加 `pnpm-workspace.yaml` 与 `package.json`。  
2. 创建 `packages/web`（Vue3 + TS + Vite + Vue Router + Pinia）。  
3. 创建 `apps/desktop`（electron-vite 模板精简）。  
4. 创建 `src/Arma3ServerTools.Service`，复制 `Agent.Host` 并改名。  
5. 将 `MonitoringHostLauncher` 迁入 Application 或 Service 项目。  
6. 本文件评审通过后开分支 `feature/vue-electron-client`。

---

## 附录 A：UI 库待选（阶段 0 锁定其一）

| 库 | 优点 | 缺点 |
|----|------|------|
| **Element Plus** | 文档全、国内常用、表格强 | 移动端需额外适配 |
| **Naive UI** | TS 友好、现代 | 生态略小于 Element |

建议：**Element Plus** + 移动页用简单布局 + 大按钮；或 Naive 若团队更偏好。

---

## 附录 B：与 config-workflow 的一致性

客户端所有写操作仍遵循 [config-workflow.md](config-workflow.md)：

- **保存到工具** ↔ `save` / `PUT/PATCH config`  
- **应用到服务器** ↔ `write_cfg` / `writeCfgAfter` / `?writeCfg=true`  
- **启动** ↔ `start`（不写 cfg）

Vue UI 按钮文案与 API 行为对齐，避免「点了重启但没 write_cfg」类误用。

---

*实施中若 API 与代码不一致，以 `src/Arma3ServerTools.Service`（或过渡期 `Agent.Host`）及 `GET /api/v1/actions` 为准。*
