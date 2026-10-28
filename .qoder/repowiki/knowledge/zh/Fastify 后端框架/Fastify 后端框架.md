---
kind: external_dependency
name: Fastify 后端框架
slug: fastify
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Fastify
- 角色：Node 被控端（`@a3st/service`）的 HTTP 框架，暴露 REST API（默认端口 `:19580`）+ SSE，是 UI / OpenClaw / E2E 的唯一业务边界。
- 集成点：`packages/service/src/app.ts`/`index.ts`；依赖 `@fastify/cors`、`@fastify/multipart`。
- 稳定约束：UI 不得绕过 REST 直接读写磁盘或 spawn 进程；所有操作必须走 `/api/v1/*`。