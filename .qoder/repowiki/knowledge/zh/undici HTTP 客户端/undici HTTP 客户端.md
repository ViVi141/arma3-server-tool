---
kind: external_dependency
name: undici HTTP 客户端
slug: undici
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### undici
- 角色：Service 内部 HTTP 客户端，用于调用 SteamCMD、BattlEye RCon V2 等外部服务。
- 稳定约束：Service 对外用 Fastify，对内使用 undici；不要混用 `fetch`/`axios`。