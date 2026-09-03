# Electron 干净机实测指南

> 验证 **未安装 Node / 未克隆仓库** 的 Windows 机器能否运行 v2 桌面版。  
> 关联：[smoke-checklist.md](smoke-checklist.md) · [v2-quickstart.md](v2-quickstart.md)

## 一、在本机构建产物（开发机）

```powershell
cd <仓库根目录>
npm install
npm run pack:desktop:dir
```

产物目录：

```text
artifacts/desktop/win-unpacked/
  Arma3 Server Tools.exe
  resources/
    web/          # Vue 控制台静态文件
    service/      # Node 被控服务 + node_modules
    assets/       # 图标等
```

安装包（可选）：

```powershell
npm run pack:desktop
# -> artifacts/desktop/Arma3ServerTools-Setup-<version>.exe
```

## 二、开发机自动冒烟（打包后立即跑）

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-desktop-unpacked.ps1
```

检查项：

- 产物目录与 `resources/service/dist/index.js`、`resources/web/index.html` 存在
- 启动 `Arma3 Server Tools.exe` 后 `GET http://127.0.0.1:19580/api/v1/health` 返回 200
- `GET /api/v1/servers`、`GET /api/v1/actions` 可访问

通过后仍需 **人工 UI 验收**（见第四节）。

## 三、复制到干净机

任选一种：

| 方式 | 说明 |
|------|------|
| **A. 目录复制** | 将整个 `win-unpacked` 文件夹 zip 拷到干净机，解压到 **英文路径**（如 `D:\Arma3ServerTools\`） |
| **B. 安装包** | 拷 `Arma3ServerTools-Setup-*.exe`，在干净机安装到英文路径 |

干净机要求：

- Windows 10/11 x64
- **不需要** Node.js、npm、Git、.NET（Electron 自带 Chromium + Node 运行时）
- 安装/解压路径 **勿含中文**

## 四、干净机手动验收清单

### 启动

- [ ] 双击 `Arma3 Server Tools.exe`（或开始菜单快捷方式）能打开窗口
- [ ] 无「服务未找到」错误框
- [ ] 任务栏托盘图标存在；关闭窗口后最小化到托盘（非退出）

### 控制面板

- [ ] 默认进入 **主机连接**，有 **本机** `127.0.0.1:19580`
- [ ] 点击 **连接** 进入控制台（无白屏/404）
- [ ] **首服向导** 可打开并完成创建（可不填真实 Arma 目录）
- [ ] 顶栏 **保存 / 写入游戏配置 / 开服检查** 按钮可见

### 被控服务

- [ ] 菜单或路由进入 **被控设置**（Electron 专属）
- [ ] 修改 HTTP 端口或 API Token → **保存并重启 Service** 后 health 仍正常
- [ ] （可选）勾选 **允许远程控制** 后，同网段另一台浏览器可连（需防火墙放行）

### 退出

- [ ] 托盘 **退出** 后进程结束，`19580` 端口释放

## 五、常见问题

| 现象 | 处理 |
|------|------|
| 「安装路径包含中文」 | 移到英文目录重装/解压 |
| 「服务未找到」 | 打包不完整；开发机重跑 `pack:desktop:dir` |
| 白屏 | 检查 `resources/web/index.html` 是否存在 |
| 连接失败 | 等 5–10 秒再连；或托盘退出后重开 |
| 端口占用 | 被控设置改端口，或结束占用 19580 的进程 |

## 六、与 CI 的关系

- 日常 CI（`.github/workflows/ci.yml`）**不含** Electron 打包。
- **发版**：推送 tag `v*` 会触发 `.github/workflows/release.yml`，在 `windows-latest` 上构建 NSIS 安装包与 win-unpacked zip，并挂到该 tag 的 GitHub Release。
- 本地可选冒烟：`pack:desktop:dir` + `smoke-desktop-unpacked.ps1` + 第四节人工清单。
