---
kind: external_dependency
name: Electron 桌面壳（Windows）
slug: electron
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Electron
- 角色：Arma3 Server Tools 的 Windows 桌面外壳，不是第三套后端；仅 spawn 本机 Node service 并静态加载 web。
- 集成点：`apps/desktop/`，入口 `dist-electron/main.js`，通过 `vite-plugin-electron` + Vite 构建；打包由 `electron-builder`（NSIS）产出 `Arma3ServerTools-Setup-*.exe` 与 `win-unpacked`。
- 关键约束：当前仅出 Windows 包（`.github/workflows/release.yml` 在 `windows-latest` 上运行），Linux 场景走纯 service + 浏览器；`electron-builder.yml` 将 web、service、assets 作为 extraResources 打入 asar。
- verify exact API/params against official docs