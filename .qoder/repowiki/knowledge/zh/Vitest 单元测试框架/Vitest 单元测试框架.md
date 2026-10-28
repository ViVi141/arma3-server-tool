---
kind: external_dependency
name: Vitest 单元测试框架
slug: vitest
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Vitest
- 角色：Service 侧测试框架，测试文件就近存放于 `src/**/*.test.ts`。
- 集成点：`npm test` → `vitest run`；CI 中通过 `npm test` 触发。