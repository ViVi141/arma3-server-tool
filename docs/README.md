# 文档索引

> 当前产品版本：**v1.4.1** · 维护仓库：[ViVi141/arma3-server-tool](https://github.com/ViVi141/arma3-server-tool)

本目录仅保留**仍与当前代码一致**的说明。历史发布清单、改造计划、代码审查报告等已移至 [archive/](archive/)。

---

## 用户与运维

| 文档 | 说明 |
|------|------|
| [first-server-guide.md](first-server-guide.md) | 首次开服步骤（安装包内另有 `first-server-guide.txt` 纯文本版） |
| [known-issues.md](known-issues.md) | 已知问题与用户反馈 |
| [smoke-checklist.md](smoke-checklist.md) | 发版前冒烟验收 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更摘要 |
| [monitoring-cpp-dll-build.md](monitoring-cpp-dll-build.md) | Monitoring DLL（C++）构建 |

---

## Agent 与 OpenClaw（AI 自动化）

| 文档 | 说明 |
|------|------|
| [openclaw-integration.md](openclaw-integration.md) | OpenClaw + Skill 总览（单机和双机入口） |
| [deployment-ab-openclaw.md](deployment-ab-openclaw.md) | **双机**：A 开服 / B OpenClaw / QQ 接 B |
| [agent-channels.md](agent-channels.md) | Agent HTTP API、任务 JSON、Inbox |
| [agent-capabilities.md](agent-capabilities.md) | 各 `action` 行为、限制与 REST 能力 |
| [ai-agent-pitfalls.md](ai-agent-pitfalls.md) | **AI/OpenClaw 常见问题与排查** |
| [../skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md) | 给大模型的操作说明 |
| [../scripts/openclaw/a3st-invoke.ps1](../scripts/openclaw/a3st-invoke.ps1) | 调用脚本 |

**权威 API 列表**（勿猜 action 名）：运行 Agent 后 `GET /api/v1/actions`。

---

## 开发与架构

| 文档 | 说明 |
|------|------|
| [architecture.md](architecture.md) | 解决方案分层与模块说明 |
| [../README.md](../README.md) | 仓库总览、构建与发布 |

---

## 归档（只读参考）

[archive/README.md](archive/README.md) — 含旧版 `release-v*`、refactoring / net10 迁移计划、product-roadmap、UX backlog、历史 code-review 等。
