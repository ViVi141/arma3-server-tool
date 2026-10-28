---
kind: build_system
name: Arma3 Server Tools v2 多端构建与发布系统
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - .github/workflows/ci.yml
    - .github/workflows/release.yml
    - scripts/build-release.ps1
    - scripts/build-desktop.ps1
    - scripts/stage-desktop.ps1
    - scripts/ci-local.ps1
    - scripts/ci-e2e.ps1
    - scripts/pack-mobile-apk.ps1
    - apps/desktop/package.json
    - apps/desktop/electron-builder.yml
    - apps/mobile/package.json
---

## 1. 总体方案

仓库采用 **npm workspaces monorepo**（`package.json` 中 `workspaces: ["apps/*", "packages/*"]`）作为顶层编排，聚合以下子项目：
- `apps/desktop` — Electron + Vite 桌面客户端（Windows NSIS 安装包）
- `apps/mobile` — Capacitor Android 壳工程（APK）
- `packages/web` — Vue 前端（Vite 构建，同时产出 desktop / mobile 两套产物）
- `packages/service` — Fastify Node.js 后端服务
- `packages/api-client` — TypeScript API 客户端库
- `.NET 4.8` 监控扩展 DLL（`DestinyServerMonitoring/`）以及 .NET WinForms 主程序、Agent/Monitoring Host（由 `scripts/build-release.ps1` 通过 `dotnet build/publish` 构建）

构建工具链：
- Node ≥20（`engines.node` 锁定）
- npm workspaces + `npm -w <workspace>` 命令
- Vite（web/desktop）、electron-builder（NSIS）、Capacitor + Gradle（Android）、Inno Setup（`.NET` 安装包）
- GitHub Actions CI（`.github/workflows/ci.yml`、`release.yml`）

## 2. 关键文件

| 文件 | 职责 |
|---|---|
| `package.json` | workspace 根、统一脚本入口（`build:*`、`pack:*`、`test`、`typecheck`） |
| `apps/desktop/package.json` | Electron 应用定义，依赖 `@a3st/web` |
| `apps/desktop/electron-builder.yml` | electron-builder 配置（asar、extraResources、NSIS） |
| `apps/mobile/package.json` | Capacitor shell 脚本（sync/run/pack:apk） |
| `scripts/stage-desktop.ps1` | 将 web dist + service runtime 打包进 `apps/desktop/electron-resources/` |
| `scripts/build-desktop.ps1` | 桌面端到端构建（typecheck → test → build service/web → stage → electron-builder） |
| `scripts/build-release.ps1` | .NET 主程序 + Agent/MonitoringHost 发布、Inno Setup 安装包、zip 归档 |
| `scripts/pack-mobile-apk.ps1` | Android debug APK 构建（cap sync + gradle assembleDebug） |
| `scripts/ci-local.ps1` | 本地镜像 CI 流程（可跳过 E2E） |
| `scripts/ci-e2e.ps1` | 启动 Service + Playwright Chromium E2E |
| `.github/workflows/ci.yml` | PR/main 触发：TypeScript check → test → build service/web → Playwright E2E |
| `.github/workflows/release.yml` | tag `v*` 触发 Windows 桌面打包并上传 GitHub Release |

## 3. 架构与约定

### 3.1 版本管理
- 所有 workspace 共享同一版本号（`2.0.0-alpha.13`），由根 `package.json` 的 `version` 字段驱动。
- `.NET` 侧的版本解析优先级：命令行 `-Version` > `Directory.Build.props` 中的 `Version` > 默认 `1.0.0`（`scripts/build-release.ps1::Resolve-ReleaseVersion`），并转换为四段式 `X.Y.Z.W`（`ConvertTo-FourPartVersion`）。
- GitHub Release 名称使用 `${github.ref_name}`（即 git tag），预发版通过 tag 包含 `alpha/beta/rc` 自动标记 `prerelease: true`。

### 3.2 构建流水线
- **开发阶段**：`npm run dev:desktop` / `dev:service` / `dev:web` 分别启动各 workspace。
- **构建阶段**：`npm run build:desktop` = `build:service` → `build:web:desktop`（`--base ./`）→ `@a3st/desktop` build；`npm run build:mobile` = `build:web:mobile`。
- **打包阶段**：`npm run pack:desktop` 调用 `@a3st/desktop` 的 `pack` 脚本，先执行 `stage-desktop.ps1` 把 web 和 service 产物复制到 `apps/desktop/electron-resources/`，再由 electron-builder 打包为 NSIS 安装器和 `win-unpacked`。
- **.NET 发布**：`scripts/build-release.ps1` 对 `Arma3ServerTools.sln` 执行 restore → build → test → publish（主程序 + `monitoring` + `agent` 两个 satellite host），复制 `skills/`、`docs/first-server-guide.txt`、`scripts/openclaw/` 及 LICENSE/NOTICE/THIRD-PARTY-NOTICES.txt 到 `artifacts/_publish`，最后用 Inno Setup 生成 `Arma3ServerTools-Setup-v$Version-$BuildStamp.exe`。

### 3.3 Electron 资源装配
`scripts/stage-desktop.ps1` 会：
1. 校验 `packages/web/dist/index.html` 与 `packages/service/dist/index.js` 存在。
2. 清空并重建 `apps/desktop/electron-resources/{web,service,assets}`。
3. 从 `packages/service/package.json` 提取 `dependencies`，生成临时 `a3st-service-runtime` 包并在 staging 目录内 `npm install --omit=dev`，再逐一校验每个依赖是否被安装。
4. 要求 `apps/desktop/build/icon.ico` 存在，否则抛错。

`electron-builder.yml` 通过 `extraResources` 将 `electron-resources/{web,service,assets}` 注入最终 asar 包，且关闭 `npmRebuild`（monorepo 下避免 `getRelativePath` 失败）。

### 3.4 Android 构建
`scripts/pack-mobile-apk.ps1` 要求 `ANDROID_HOME` 与 `JAVA_HOME`（JDK 17+），依次执行：`npm run build:web:mobile` → `cap sync android` → `ensure-mobile-cleartext.ps1` → `gradlew.bat assembleDebug`，输出到 `artifacts/mobile/a3st-mobile-debug.apk`。

### 3.5 CI 与本地验证
- `.github/workflows/ci.yml` 在 Ubuntu 上以 Node 20/22 矩阵运行：`npm ci` → `npm run typecheck` → `npm test` → `npm run build:service` → `npm run build:web` → 启动 Service（端口 19580，轮询 `/api/v1/health`）→ Playwright E2E。
- `scripts/ci-local.ps1` 是 CI 的本地镜像，支持 `A3ST_FORCE_NPM_CI=1` 强制重装、`A3ST_SKIP_E2E=1` 跳过 E2E。
- `scripts/ci-e2e.ps1` 通过 PowerShell Job 后台启动 Service，等待健康检查成功后安装 Chromium 并运行 Playwright，finally 清理进程。

### 3.6 产物命名与输出
- Electron 产物：`artifacts/desktop/Arma3ServerTools-Setup-${version}.${ext}`（NSIS）与 `Arma3ServerTools-win-unpacked-${version}.zip`（CI 额外 zip）。
- .NET 安装包：`artifacts/Arma3ServerTools-Setup-v$Version-$BuildStamp.exe`，可选 `Arma3ServerTools-v$Version-$Configuration[-win-x64].zip`。
- Android：`artifacts/mobile/a3st-mobile-debug.apk`。

## 4. 约定与约束

- **Node 版本**：根 `package.json` 的 `engines.node >= 20.0.0` 强制最低版本；CI 矩阵覆盖 20 与 22。
- **Workspace 依赖**：Electron 应用通过 `"@a3st/web": "*"` 引用同仓库前端，禁止跨仓库引用。
- **Service 运行时完整性**：`stage-desktop.ps1` 在打包前校验 service 的 `dependencies` 非空，并在 staging 目录重新 `npm install --omit=dev`，然后逐个检查每个依赖包是否存在——这是构建期强约束，缺失任一依赖都会抛错。
- **图标要求**：`apps/desktop/build/icon.ico` 必须存在，否则 `stage-desktop.ps1` 抛错。
- **Web 构建 base**：桌面模式使用 `--base ./`（`build:web:desktop`），移动端使用 `build:web:mobile`，两者路径不同，不可混用。
- **Playwright E2E 端口**：固定 `PORT=19580 HOST=127.0.0.1`，Service 必须暴露 `/api/v1/health` 健康端点，E2E 脚本轮询最多 30 秒。
- **Inno Setup 编译器**：`build-release.ps1` 按顺序查找 `INNO_SETUP_PATH`、`tools\innosetup-6\ISCC.exe`、用户/系统 ProgramFiles 下的 Inno Setup 6；若不存在且传入 `-InstallInnoSetup`，会通过 winget 或下载 `innosetup-6.7.2.exe` 静默安装到 `tools\innosetup-6`。
- **GitHub Release 触发**：仅响应 `push: tags: ["v*"]`，tag 名即 release 名称；`alpha/beta/rc` tag 自动设为 `prerelease: true`。
- **签名**：桌面构建显式设置 `CSC_IDENTITY_AUTO_DISCOVERY=false` 与 `signAndEditExecutable: false`，CI 不执行代码签名。
- **.NET 自包含**：`build-release.ps1` 默认 `SelfContained=true`（`-r win-x64 --self-contained true`），可通过参数切换为框架依赖部署。
- **OpenClaw Skill 捆绑**：发布时要求 `skills/arma3-server-tools/SKILL.md` 存在，否则抛错。

## 5. 未覆盖项

仓库没有 Dockerfile、Makefile 或跨平台交叉编译脚本；Linux/macOS 上的构建主要通过 GitHub Actions 的 `ubuntu-latest` 运行 Node 相关部分，Windows 专属的 Electron/.NET 构建仅在 `windows-latest` 的 release workflow 中执行。