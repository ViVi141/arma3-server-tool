# 文档索引

> **v2 主线**：`2.0.0-alpha` · [ViVi141/arma3-server-tool](https://github.com/ViVi141/arma3-server-tool)  
> **v1 归档**：下文标注「v1」的文档与 [archive/](archive/) 描述旧版 WinForms GUI，业务语义仍可参考；C# 源码已从仓库移除。

---

## v2 用户 / 开发者（当前）

| 文档 | 说明 |
|------|------|
| [v2-quickstart.md](v2-quickstart.md) | **首选** — 安装、双进程开发、Electron |
| [architecture-v2.md](architecture-v2.md) | v2 分层、ConsoleShell、classic/ark 视觉主题 |
| [linux-server.md](linux-server.md) | Linux 开服机（Service + SteamCMD + 浏览器） |
| [desktop-clean-machine-test.md](desktop-clean-machine-test.md) | Electron 干净机实测与打包冒烟 |
| [config-workflow.md](config-workflow.md) | 配置包 vs 游戏 cfg；含 **v2 Web 按钮对照** |
| [agent-capabilities.md](agent-capabilities.md) | Task `action` 行为 |
| [agent-channels.md](agent-channels.md) | HTTP API、任务 JSON |
| [openclaw-integration.md](openclaw-integration.md) | OpenClaw 集成（见文首 v2 说明） |
| [../README.md](../README.md) | 仓库总览 |

运行 Service 后 **`GET /api/v1/actions`** 为权威 action 列表。

本地 CI 与 `.github/workflows/ci.yml` 一致：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ci-local.ps1
```

含 Playwright E2E（自动拉起临时 Service）。跳过 E2E：`$env:A3ST_SKIP_E2E=1` 后再跑上述命令。

---

## v1 运维 / 历史（WinForms）

| 文档 | 说明 |
|------|------|
| [first-server-guide.md](first-server-guide.md) | 从零开服（**文首已补充 v2 路径**） |
| [architecture.md](architecture.md) | C# 解决方案分层（**v1**；v2 见 [v2-quickstart.md](v2-quickstart.md)） |
| [known-issues.md](known-issues.md) | 已知问题 |
| [archive/releases/](archive/releases/) | 历史发版清单 |

---

## OpenClaw / Agent

1. [openclaw-integration.md](openclaw-integration.md)
2. [deployment-ab-openclaw.md](deployment-ab-openclaw.md)
3. [agent-capabilities.md](agent-capabilities.md)
4. [agent-channels.md](agent-channels.md)
5. [ai-agent-pitfalls.md](ai-agent-pitfalls.md)
6. [../skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md)

---

## 计划与归档

| 文档 | 说明 |
|------|------|
| [vue-electron-client-plan.md](vue-electron-client-plan.md) | 早期改造计划（**部分已落地为 v2 TS 栈**） |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更（含 v2.0.0-alpha） |
| [archive/README.md](archive/README.md) | 历史文档索引 |

---

## 目录结构

```text
docs/
├── README.md                 # 本索引
├── v2-quickstart.md          # v2 快速开始
├── CHANGELOG.md
├── config-workflow.md
├── architecture.md           # v1 架构
├── first-server-guide.md
├── agent-*.md
├── openclaw-integration.md
└── archive/                  # 历史（不随 v2 主线更新）
```
