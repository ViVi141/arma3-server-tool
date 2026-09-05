# 变更日志

格式基于各版本发布清单整理；详细条目见 [archive/releases/](archive/releases/)。

## [2.0.0-alpha.7] — 当前

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
