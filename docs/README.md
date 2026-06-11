# 文档索引

> **v1.5.0** · [ViVi141/arma3-server-tool](https://github.com/ViVi141/arma3-server-tool)

本目录为**与当前代码一致**的维护文档。历史发布清单、改造计划与代码审查在 [archive/](archive/)（只读参考）。

---

## 按角色阅读

### 新用户 / 运维

1. [first-server-guide.md](first-server-guide.md) — 从零开服（安装包内 [first-server-guide.txt](first-server-guide.txt) 为纯文本同内容）  
2. [config-workflow.md](config-workflow.md) — **保存 / 应用 / 启动** 与配置包说明（v1.5+ 必读）  
3. [known-issues.md](known-issues.md) — 已知问题与修复记录  

### OpenClaw / Agent 集成

1. [openclaw-integration.md](openclaw-integration.md) — 单机 Agent + Skill 入口  
2. [deployment-ab-openclaw.md](deployment-ab-openclaw.md) — 双机（A 开服 / B OpenClaw / QQ）  
3. [agent-capabilities.md](agent-capabilities.md) — 各 `action` 行为  
4. [agent-channels.md](agent-channels.md) — HTTP API、任务 JSON、Inbox  
5. [ai-agent-pitfalls.md](ai-agent-pitfalls.md) — AI 编排常见坑  
6. [../skills/arma3-server-tools/SKILL.md](../skills/arma3-server-tools/SKILL.md) · [../scripts/openclaw/a3st-invoke.ps1](../scripts/openclaw/a3st-invoke.ps1)  

运行 Agent 后 **`GET /api/v1/actions`** 为权威 action 列表，勿猜命令名。

### 客户端重构（计划）

| 文档 | 说明 |
|------|------|
| [vue-electron-client-plan.md](vue-electron-client-plan.md) | **Vue + Electron + Capacitor** 替代 WinForms；Service 被控 + 双角色桌面 + 手机主控 |

### 开发与发版

| 文档 | 说明 |
|------|------|
| [architecture.md](architecture.md) | 解决方案分层、模块、测试命令 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更摘要 |
| [smoke-checklist.md](smoke-checklist.md) | 发版前冒烟 |
| [monitoring-cpp-dll-build.md](monitoring-cpp-dll-build.md) | Monitoring DLL（C++）构建 |
| [archive/releases/release-v1.5.0.md](archive/releases/release-v1.5.0.md) | 当前版发版清单与 tag 步骤 |
| [../README.md](../README.md) | 仓库总览、构建、安装包 |

CI 与本地检查步骤见 [archive/releases/release-v1.5.0.md](archive/releases/release-v1.5.0.md#发版前检查)（与 `.github/workflows/ci.yml` 一致）。

---

## 目录结构

```text
docs/
├── README.md                 # 本索引
├── CHANGELOG.md              # 变更摘要（当前版置顶）
├── config-workflow.md        # 配置包 + 保存/应用/启动（v1.5+）
├── architecture.md
├── first-server-guide.md
├── first-server-guide.txt    # 安装包用记事本版
├── release-README.txt        # 安装包 docs 内英文说明
├── known-issues.md
├── smoke-checklist.md
├── openclaw-integration.md
├── deployment-ab-openclaw.md
├── agent-capabilities.md
├── agent-channels.md
├── ai-agent-pitfalls.md
├── monitoring-cpp-dll-build.md
└── archive/                  # 历史文档（不随主线更新）
    ├── README.md
    ├── releases/             # release-v1.0.0 … release-v1.5.0
    ├── refactoring-plan.md
    ├── net10-migration-plan.md
    ├── product-roadmap.md
    ├── ux-optimization-backlog.md
    ├── code-review-2026-05-24.md
    ├── code-review-2026-05-27.md
    ├── consistency-review-2026-05.md
    └── deployment-abc-openclaw.md   # 重定向说明
```

---

## 归档

[archive/README.md](archive/README.md) — 旧版 `release-v*`、UX backlog、历史 code-review 等。
