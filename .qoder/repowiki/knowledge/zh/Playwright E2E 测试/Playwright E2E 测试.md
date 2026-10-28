---
kind: external_dependency
name: Playwright E2E 测试
slug: playwright
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Playwright
- 角色：Web 控制台端到端测试，CI 中自动拉起临时 Service（端口 `:19580`，健康检查 `/api/v1/health`）后运行。
- 集成点：`packages/web` devDep；本地可通过 `A3ST_SKIP_E2E=1` 跳过。