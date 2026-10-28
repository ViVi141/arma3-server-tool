---
kind: external_dependency
name: Croner 定时任务调度
slug: croner
category: external_dependency
category_hints:
    - sdk_real_api
scope:
    - '**'
---

### Croner
- 角色：Service 内 cron 调度器，用于定时重启服务器与采集监控统计。
- 稳定约束：通过 `scheduling` 模块注册任务；新增调度逻辑应复用该模块而非自行实现定时器。