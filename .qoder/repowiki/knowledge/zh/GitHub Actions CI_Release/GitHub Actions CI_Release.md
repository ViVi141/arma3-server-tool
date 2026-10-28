---
kind: external_dependency
name: GitHub Actions CI/Release
slug: github-actions
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### GitHub Actions
- CI：push/PR 到 main/master 时，在 ubuntu-latest 上以 Node 20/22 矩阵跑 typecheck、test、build:service、build:web、Playwright E2E。
- Release：tag `v*` 时在 windows-latest 上打包 NSIS 安装器与 win-unpacked zip，发布到 GitHub Releases（软标签 prerelease 规则）。