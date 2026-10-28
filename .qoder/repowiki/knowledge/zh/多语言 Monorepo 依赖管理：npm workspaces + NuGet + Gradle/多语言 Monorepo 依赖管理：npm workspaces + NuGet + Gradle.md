---
kind: dependency_management
name: 多语言 Monorepo 依赖管理：npm workspaces + NuGet + Gradle
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - apps/desktop/package.json
    - apps/mobile/package.json
    - packages/web/package.json
    - packages/service/package.json
    - packages/api-client/package.json
    - apps/desktop/electron-builder.yml
    - DestinyServerMonitoring/DestinyServerMonitoring/packages.config
    - DestinyServerMonitoring/DestinyServerMonitoring/DestinyServerMonitoring.csproj
    - apps/mobile/android/build.gradle
    - apps/mobile/android/gradle/wrapper/gradle-wrapper.properties
---

## 1. 使用的系统/方法

仓库是一个跨语言的 Monorepo，按语言分别采用各自的包管理器与锁定策略：

- **Node.js / TypeScript**：使用 `npm` + `workspaces`（根 `package.json` 声明 `"workspaces": ["apps/*", "packages/*"]`），通过 `package-lock.json` 做版本锁定。
- **.NET Framework (4.8)**：`DestinyServerMonitoring` 子项目使用 NuGet Classic (`packages.config` + `.csproj`)，依赖 `UnmanagedExports` 1.2.7，并通过 `<Import Project="../packages/UnmanagedExports.1.2.7/tools/RGiesecke.DllExport.targets" .../>` 直接引用本地 `packages/` 下的包。
- **Android / Gradle**：`apps/mobile/android` 使用 Gradle Wrapper（`gradlew` + `gradle-wrapper.jar`），Gradle 分发版本在 `gradle-wrapper.properties` 中固定为 `gradle-8.11.1-all.zip`，仓库镜像源为 `google()` 与 `mavenCentral()`。

## 2. 关键文件

- 根级：`package.json`、`package-lock.json` — npm workspace 入口与锁文件。
- Node 子包：`apps/desktop/package.json`、`apps/mobile/package.json`、`packages/web/package.json`、`packages/service/package.json`、`packages/api-client/package.json`。
- .NET：`DestinyServerMonitoring/DestinyServerMonitoring/packages.config`、`DestinyServerMonitoring/DestinyServerMonitoring/DestinyServerMonitoring.csproj`。
- Android：`apps/mobile/android/build.gradle`、`apps/mobile/android/gradle/wrapper/gradle-wrapper.properties`。
- Electron 打包配置：`apps/desktop/electron-builder.yml`（由 `electron-builder` 消费）。

## 3. 架构与约定

### 3.1 npm workspaces 内部包
- 所有内部包统一以 `@a3st/` scope 命名：`@a3st/web`、`@a3st/service`、`@a3st/api-client`、`@a3st/desktop`、`@a3st/mobile`。
- 内部包之间通过 workspace 引用互相依赖：例如 `@a3st/desktop` 的 `dependencies` 写 `"@a3st/web": "*"`，`@a3st/web` 依赖 `"@a3st/api-client": "*"`。workspace 解析器会将其解析到本地路径，而非从 npm registry 拉取。
- 根 `package.json` 提供聚合脚本，用 `npm -w <pkg>` 调用各子包的 `dev`/`build`/`test`，如 `build:desktop` 串联 `build:service → build:web:desktop → @a3st/desktop pack`。
- 所有 Node 子包均声明 `"type": "module"`，统一使用 ESM。
- 根 `package.json` 通过 `engines.node = ">=20.0.0"` 约束运行时 Node 版本。

### 3.2 第三方依赖版本范围
- 所有第三方依赖使用 `^` 语义化版本范围（例如 `fastify: ^5.0.0`、`electron: ^33.4.11`、`vue: ^3.5.0`、`typescript: ^5.6.0`），实际安装版本由 `package-lock.json` 锁定。
- 没有发现私有 npm registry、`.npmrc`、`verdaccio` 或 `GOPRIVATE` 等私有源配置；依赖全部来自公共 npm registry。

### 3.3 .NET NuGet 依赖
- `packages.config` 仅声明一个 NuGet 包：`UnmanagedExports` 1.2.7（targetFramework net452）。
- `.csproj` 通过 `HintPath` 和 `Import` 直接指向 `../packages/UnmanagedExports.1.2.7/...`，即依赖被还原到仓库内的 `DestinyServerMonitoring/packages/` 目录，属于半 vendored 方式。
- 目标框架固定为 `v4.8`，LangVersion 在 Debug/Release x64/x86 配置下设为 `7.3`。

### 3.4 Android Gradle 依赖
- 顶层 `build.gradle` 声明 `google()` 与 `mavenCentral()` 两个仓库。
- Gradle 插件版本固定：`com.android.tools.build:gradle:8.7.2`、`com.google.gms:google-services:4.4.2`。
- Gradle 分发通过 Wrapper 固定为 `gradle-8.11.1-all.zip`，并启用 `validateDistributionUrl=true`。

## 4. 约定与约束

- **Workspace 内包互引使用 `*` 版本符**：`@a3st/desktop` 对 `@a3st/web`、`@a3st/web` 对 `@a3st/api-client` 均以 `"*"` 引用，依赖由 workspace 解析到本地源码，不发布到 npm。
- **所有 Node 子包标记 `private: true`**：表明这些包不会发布到公共 npm registry，仅供 monorepo 内部消费。
- **统一的 TypeScript 版本**：各子包 devDependencies 中的 `typescript` 均为 `^5.6.0`，保持类型检查工具一致。
- **Electron 构建产物由 electron-builder 输出**：`apps/desktop/package.json` 的 `pack`/`pack:dir` 脚本调用 `electron-builder --config electron-builder.yml`，打包配置集中在 `electron-builder.yml`。
- **.NET 依赖通过 packages.config + csproj Import 本地还原**：NuGet 包被还原到仓库内 `DestinyServerMonitoring/packages/`，并在 `.csproj` 中以绝对相对路径引用，确保 CI 可复现。
- **Android 构建强制使用指定 Gradle 版本**：`gradle-wrapper.properties` 中 `distributionUrl` 与 `validateDistributionUrl=true` 保证每次构建使用相同的 Gradle 发行版。
- **未发现私有注册表或代理配置**：整个仓库未出现 `.npmrc`、`nuget.config`、`settings.gradle` 中的私有 maven 源等配置，所有第三方依赖均来自公共源（npm、nuget.org、mavenCentral、google）。