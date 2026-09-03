# 已知问题与用户反馈记录

> 更新日期：2026-08-28  
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
| 2026-08-28 | 增加 v2 alpha 状态表；首服向导与 smoke 清单 v2 章节 |
| 2026-06-01 | 增加 v1.5.0 升级说明 |
| 2026-05-27 | ISSUE-01～04 记录；均已修复或改进 |
