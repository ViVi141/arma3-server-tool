---
kind: external_dependency
name: Capacitor Android 壳
slug: capacitor-android
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Capacitor (Android)
- 角色：移动端主控壳，复用同一套 web（`build:mobile` 输出到 `apps/mobile/www`），不引入独立原生业务逻辑。
- 集成点：`apps/mobile/`，依赖 `@capacitor/core` + `@capacitor/android` v7；`npm run sync` 会执行 `cap sync android` 并调用 `scripts/ensure-mobile-cleartext.ps1` 处理 Android 明文 HTTP 限制。
- 产物：APK 通过 `scripts/pack-mobile-apk.ps1` 打包。