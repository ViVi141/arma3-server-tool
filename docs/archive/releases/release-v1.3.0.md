# v1.3.0 发布清单（Changelog）

> 本版范围：从 `v1.2.3` tag 到当前最新提交。

## 本版要点

### 安全与稳定性

- 增加进程身份校验，避免 PID 复用导致误杀无关进程。
- SteamCMD 登录参数统一安全转义，降低凭据暴露风险。
- `serverUuid` 增加安全校验，阻断路径穿越类风险。
- `WM_COPYDATA` 增加签名与长度校验，过滤非法/异常 IPC 消息。
- 定时任务执行链路增加异常兜底与日志，避免调度线程被异常打断。

### 监控与数据库性能

- 统计库增加关键索引，提升常用查询速度。
- 玩家统计改为 `UPSERT`，减少多次往返 SQL。
- 增加 `serverId` 缓存并优化批次内复用，降低重复查库。
- SQLite 启用性能参数（如 WAL / busy timeout），提升并发与写入稳定性。

### UI 响应性优化

- 统计页刷新改为异步拉取数据，降低主线程阻塞。
- 服务器状态轮询更新改进为更轻量的局部刷新路径。
- RPT 查看器支持尾部窗口读取与增量追加，避免反复全量读取。
- 日志落盘改为异步批量写入，降低前台线程 I/O 抖动。
- RCon 玩家/封禁/任务表支持差量重绑，减少无变化时的重绘。
- 关闭流程中调度器停机改为非阻塞后台收尾，避免关闭卡顿。

### 可观测性（新增）

- 新增 UI 性能埋点输出（`UI_PERF`），覆盖主操作链路、模组扫描、RCon 列表刷新。
- 可通过日志直接统计 `elapsed_ms`，形成 P50/P95 响应速度报告。

## 版本号与元信息

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.3.0` |
| `Directory.Build.props` | `AssemblyVersion` / `FileVersion` = `1.3.0.0` |
| `Directory.Build.props` | `InformationalVersion` = `1.3.0` |

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -Configuration Release
```

## Git tag 与 Release（维护者）

```powershell
git add -A
git commit -m "Release v1.3.0: security hardening, monitoring pipeline and UI responsiveness improvements."
git tag -a v1.3.0 -m "Arma3 Server Tools v1.3.0"
git push origin HEAD
git push origin v1.3.0
```

在 GitHub **Releases** 新建 `v1.3.0`，上传 `artifacts/Arma3ServerTools-Setup.exe`。
