# Android 手机主控（Capacitor）

> 手机端 **仅主控**：连接局域网 / Tailscale 上的 `@a3st/service`，不在手机上跑开服后端。

## 前置

- Node.js ≥ 20
- [Android Studio](https://developer.android.com/studio)（本机已检测到 SDK + JBR 即可）
- 开服机 Service 监听 `0.0.0.0:19580`，并配置 `API_TOKEN`

## 一键打 Debug APK

在仓库根目录：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/pack-mobile-apk.ps1
```

产物：`artifacts/mobile/a3st-mobile-debug.apk`

安装到手机（USB 调试）：

```powershell
adb install -r artifacts\mobile\a3st-mobile-debug.apk
```

## 开发迭代

```powershell
npm install
npm -w @a3st/mobile run sync
npm -w @a3st/mobile run open
```

Android Studio 打开后可 Run 到模拟器 / 真机。

## 手机里怎么连 N100

1. 打开 App → **添加主机**
2. URL：`http://192.168.31.176:19580`
3. Token：开服机上的 `API_TOKEN`
4. 连接

手机与 N100 须同一局域网，或走 Tailscale 等可达网络。App 已允许明文 HTTP（`cleartext`），以便访问内网 `http://` 地址。

## 说明

| 项 | 行为 |
|----|------|
| `VITE_APP_MODE=mobile` | 隐藏「被控设置」等桌面专用页 |
| 默认连接 | 不预置 `127.0.0.1`（手机上无意义） |
| 包名 | `com.vivi141.a3st` |
| 工程路径 | `apps/mobile`（`android/` 由 Capacitor 生成，默认不入库） |

正式上架签名包可后续再加 `assembleRelease`；当前以可安装的 debug APK 为主。
