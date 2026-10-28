---
kind: external_dependency
name: sql.js（SQLite in-memory/WASM）
slug: sql-js
category: external_dependency
category_hints:
    - client_constraint
scope:
    - '**'
---

### sql.js
- 角色：Service 侧监控统计数据的持久化存储，替代传统 SQLite 文件。
- 稳定约束：WASM 版 SQLite，部署形态与原生 sqlite3 不同（无外部 `.db` 文件依赖），需按 Service 启动流程初始化。