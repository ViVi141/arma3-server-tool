# 已知问题与用户反馈记录

> 更新日期：2026-10-29  
> 关联：[README.md](README.md) · [CHANGELOG.md](CHANGELOG.md) · [config-workflow.md](config-workflow.md) · [smoke-checklist.md](smoke-checklist.md)

本文记录用户反馈的问题及处理状态。

---

## v2 主线状态（2.0.0-alpha）

| 项 | 状态 | 说明 |
|----|------|------|
| 核心开服流程 | 可用 | Windows / **Linux** 开服机；保存 → 写入游戏配置 → 开服检查 → 启动 |
| 首服向导 | 已提供 | Web 控制台 **首服向导**（多步创建配置包） |
| 正式安装包 | 进行中 | Electron 可 `pack:desktop` |
| Agent 文档 | 已更新 v2 | 以 `GET /api/v1/actions` 为准 |
| E2E 测试 | 已纳入 CI | Playwright + 临时 Service（`scripts/ci-e2e.ps1`） |

### v2 打开问题

（当前无未关闭项）

---

## 打开问题（全版本）

（当前无未关闭项）

---

## 已关闭

| ID | 关闭日期 | 说明 |
|----|----------|------|
| ISSUE-01 | 2026-05-27 | SteamCMD 下载进度对话框 + 下载百分比（`SteamCmdProgressDialogForm`） |
| ISSUE-02 | 2026-05-27 | 安装包含 `first-server-guide.txt`，记事本打开（`FirstServerGuideOpener`） |
| ISSUE-03 | 2026-05-27 | 首服向导下载 SteamCMD 后可点「下一步」 |
| ISSUE-04 | 2026-05-27 | SteamCMD / 模组 / 游戏目录文案（`SteamPathUiHelper`） |
| ISSUE-05 | 2026-10-29 | 桌面端点「启动」后 ArmA3 服务器控制台窗口不显示（`packages/service/src/process/manager.ts`） |

### ISSUE-05 摘要（已修复）

- **问题**：用 `.bat` 手动开服窗口正常，但从控制台点「启动」时 ArmA3 专用服窗口不显示（服务器仍在后台跑）。
- **根因**：Service 由 Electron 以「无控制台」方式（`windowsHide:true` + stdio 重定向、非 detached）拉起，其子进程继承不到控制台。`spawn` 仅设 `windowsHide:false` 只表示「不主动隐藏」，并不会凭空创建一个窗口。
- **修复**：Windows 上需显示服务器窗口时补 `detached:true`（触发 `CREATE_NEW_CONSOLE`，等效 `.bat` 的 `start`）、`stdio:'ignore'`，并 `unref()` 让窗口独立于 Service 存活；停止仍靠持久化 PID + `taskkill /T`。默认显示窗口，后台无窗口部署可设 `startup.showServerWindow=false`。

### ISSUE-01 摘要（已修复）

- **问题**：下载 SteamCMD 无进度，易误判卡死。
- **修复**：模态进度窗显示阶段与 zip 下载百分比；初始化阶段为 Marquee。

### ISSUE-02 摘要（已修复）

- **问题**：服务器无法打开 `.md` 开服指南。
- **修复**：附带 `docs\first-server-guide.txt`，优先用记事本打开。

---

## 升级说明（v1.5.0）

- 工具配置由 `config/{uuid}.json` 迁移为 `config/{uuid}/` 配置包；首次 **保存到工具** 即完成迁移。
- **启动** 不再自动写入游戏 cfg；须先 **应用到服务器目录**。详见 [config-workflow.md](config-workflow.md)。

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-29 | ISSUE-05：桌面端服务器控制台窗口不显示（detached 新建控制台修复） |
| 2026-08-28 | 增加 v2 alpha 状态表；首服向导与 smoke 清单 v2 章节 |
| 2026-06-01 | 增加 v1.5.0 升级说明 |
| 2026-05-27 | ISSUE-01～04 记录；均已修复或改进 |
