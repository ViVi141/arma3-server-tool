---
kind: frontend_style
name: 基于 CSS 变量 + Element Plus 的主题与视觉风格系统
category: frontend_style
scope:
    - '**'
source_files:
    - packages/web/src/styles/desktop-theme.css
    - packages/web/src/styles/ark-visual.css
    - packages/web/src/styles/shell-v2.css
    - packages/web/vite.config.ts
    - packages/web/package.json
---

## 1. 使用的系统与工具

- **框架**: Vue 3 SPA，构建工具为 Vite（`packages/web/vite.config.ts`）。
- **组件库**: Element Plus (`element-plus` + `@element-plus/icons-vue`)，通过 `unplugin-vue-components` + `ElementPlusResolver` 自动按需注册。
- **样式语言**: 纯 CSS（无 SCSS/Less/Tailwind），所有样式位于 `packages/web/src/styles/`。
- **主题机制**: CSS Custom Properties（CSS 变量）+ 两个 HTML 属性选择器：
  - `[data-theme="light"|dark"]` 控制明/暗主题；
  - `[data-visual="ark"|classic"]` 控制两套视觉皮肤（ark 与 classic）。
- **响应式**: 基于 CSS `@media (max-width: ...)` 断点 + Capacitor 注入的 `html.is-mobile-app` / `html[data-app-mode="mobile"]` 类名进行移动端适配。

## 2. 关键文件

- `packages/web/src/styles/desktop-theme.css` — 全局设计令牌（`--a3st-*`）与 Element Plus 覆盖，定义 light/dark 两套主题。
- `packages/web/src/styles/ark-visual.css` — ark 视觉皮肤的变量覆写、Hero/Dashboard/Settings 等页面级样式。
- `packages/web/src/styles/shell-v2.css` — 壳层布局（顶栏 rail + stage + subnav + baseline），含桌面与移动端的完整响应式规则。
- `packages/web/vite.config.ts` — 配置 `base: "./"`（适配 Electron file://、Service 静态托管、Capacitor）、alias `@` → `src`、ElementPlusResolver 自动导入。
- `packages/web/package.json` — 声明依赖 `element-plus`、`@element-plus/icons-vue`、`pinia`、`vue-router`、`chart.js`、`vue-chartjs`。

## 3. 架构与设计约定

### 设计令牌（Design Tokens）
`desktop-theme.css` 在 `:root` 中集中声明 `--a3st-*` 系列变量（背景、边框、文本、强调色、状态色、滚动条、按钮变体、终端色等），并通过 `[data-theme]` 作用域分别赋值 light/dark。这些变量随后被映射到 Element Plus 的 `--el-*` 变量（如 `--el-bg-color`、`--el-text-color-primary`、`--el-color-primary` 等），使第三方组件继承应用主题。

### 双视觉皮肤
- **classic**（默认）：偏向 Windows 原生/Visual Studio Code 风格，使用 Segoe UI + Cascadia Mono，圆角极小（2px），色调中性。
- **ark**：更偏科幻/控制台风格，使用 `--ark-signal: #18d1ff` 作为强调色，配合 `--ark-state: #c8eb21`，大量使用 `writing-mode: vertical-rl` 竖排 rail、网格背景、clip-path 几何图形。
皮肤切换通过根元素上的 `data-visual` 属性驱动，`ark-visual.css` 内所有规则以 `[data-visual="ark"]` 前缀限定。

### 壳层布局（shell-v2）
`shell-v2.css` 定义了完整的控制台外壳：`.shell-v2__topbar`（品牌 + 实例切换 + relay 状态灯）、`.shell-v2__rail`（竖排导航，窄屏下变为底部 tab bar）、`.shell-v2__stage`（主内容区）、`.shell-v2__subnav`（页内子导航）、`.shell-v2__baseline`（底部状态栏）。布局采用 Flexbox，无栅格系统。

### 移动端适配策略
- 通过 `@media (max-width: 768px)` 将 `.shell-v2__rail` 从左侧竖排改为底部横向 tab bar，隐藏 `.relay` 与 `.picker`。
- 针对 Capacitor 打包产物，额外用 `html.is-mobile-app, html[data-app-mode="mobile"]` 选择器放大触控目标（`--el-component-size: 32px`，按钮 `min-height: 2.4rem~2.6rem`），并处理 iOS safe-area（`env(safe-area-inset-top/bottom)`）和 Chrome 地址栏遮挡（`--mobile-chrome-offset`、`100dvh`）。
- 表单在移动端强制竖排（`.form-row { flex-direction: column }`），Dialog 全宽（`width: min(92vw, 100%)`），表格启用横向滚动兜底。

### Element Plus 覆盖约定
`desktop-theme.css` 中对所有常用 Element Plus 组件（`.el-button`、`.el-input__wrapper`、`.el-card`、`.el-dialog`、`.el-table`、`.el-tabs`、`.el-menu`、`.el-alert`、`.el-popover`、`.el-scrollbar__thumb` 等）统一覆写圆角为 0 或 2px、阴影为 none、边框颜色使用 `--a3st-border*`，保证组件外观与应用主题一致。

### 无障碍与动效
- 使用 `prefers-reduced-motion: reduce` 禁用动画（`shell-v2.css` 中的 pulse 动画、`desktop-theme.css` 的全局过渡归零）。
- 键盘焦点通过 `.focus-visible` 选择器设置 `outline: 2px solid var(--a3st-accent)`。

## 4. 约定与约束

- **样式组织**: 所有样式集中在 `packages/web/src/styles/`，按职责拆分为 `desktop-theme.css`（主题 + 组件覆盖）、`ark-visual.css`（ark 皮肤）、`shell-v2.css`（壳层布局与响应式），无模块化 CSS 框架。
- **主题切换入口**: 通过给 `<html>` 或根元素设置 `data-theme` 与 `data-visual` 属性生效，而非运行时 JS API。
- **Element Plus 集成**: 通过 `unplugin-vue-components` + `ElementPlusResolver` 自动按需引入组件，样式由上述 CSS 覆盖，不在组件内写样式。
- **Vite base**: 固定为 `./`，确保 Electron、后端静态托管、Capacitor 三种部署形态共用同一份前端资源。
- **命名约定**: 自定义类名使用 BEM 风格（如 `.shell-v2__topbar`、`.shell-v2__rail-item`），CSS 变量统一以 `--a3st-*`（主题层）和 `--ark-*`（ark 皮肤层）前缀区分。
- **无 Tailwind/SCSS**: 仓库未安装 Tailwind、PostCSS 或任何预处理器，全部为原生 CSS。
- **移动端模式标记**: 由 Capacitor 注入 `html.is-mobile-app` 或 `html[data-app-mode="mobile"]`，样式以此作为移动端专属开关。