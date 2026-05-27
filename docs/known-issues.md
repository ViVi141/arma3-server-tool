# 已知问题与用户反馈记录

> 更新日期：2026-05-27  
> 关联：[README.md](README.md) · [CHANGELOG.md](CHANGELOG.md)

本文记录用户反馈的问题及处理状态。

---

## 打开问题

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

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-27 | ISSUE-01～04 记录；01/02/03/04 均已修复或改进 |
