# Linux 开服指南（v2）

> Service 与 SteamCMD 已支持 **Linux**；Electron 安装包仍为 Windows。  
> 关联：[v2-quickstart.md](v2-quickstart.md) · [first-server-guide.md](first-server-guide.md)

## 环境

- **发行版**：常见 x64 Linux（Ubuntu 22.04+、Debian 12+ 等）
- **Node.js** ≥ 20（仅开发/源码运行 Service 时需要；Electron 用户不需要）
- **依赖**：`tar`（解压 SteamCMD）、`ss`（UDP 端口检测，通常随 iproute2 安装）
- **路径**：服务器目录与 Workshop 路径建议英文/ASCII（与 Windows 相同约束）

## 快速开始（源码）

```bash
git clone https://github.com/ViVi141/arma3-server-tool.git
cd arma3-server-tool
npm ci
npm run build:service
npm run build:web

export DATA_DIR="$HOME/.a3st-data"
export PORT=19580
node packages/service/dist/index.js
```

另开终端（或反向代理静态文件）：

```bash
npm run dev:web
# 浏览器打开 http://localhost:5173 ，API 代理到 19580
```

`GET /api/v1/health` 会返回：

- `platform`: `linux`
- `defaultServerExecutable`: `arma3server`
- `steamCmdBinary`: `steamcmd.sh`

## SteamCMD 与专用服务器

1. 控制面板 → **SteamCMD** → 填写 Steam 账号 → **下载 SteamCMD**（自动拉取 `steamcmd_linux.tar.gz`）
2. **安装/更新专用服务器** 到例如 `/opt/arma3server`
3. 确认目录内存在可执行文件 **`arma3server`**（Steam app **233780** Linux depot）
4. **首服向导** 或 **基本** 页将「可执行文件」设为 `arma3server`（或留空使用 Service 默认）

Linux 下 `app_update` 使用 `validate` 分支（无 Windows 的 `creatordlc` beta 参数）。

## 与 Windows 的差异

| 项 | Linux | Windows |
|----|-------|---------|
| 专用服二进制 | `arma3server` | `arma3server_x64.exe` |
| SteamCMD | `steamcmd.sh` | `steamcmd.exe` |
| 安装包 | 源码 + 浏览器 / systemd | Electron + NSIS |
| 进程启停 | `SIGTERM` / argv 解析 | `taskkill` / verbatim 命令行 |

## systemd 示例（可选）

```ini
[Unit]
Description=Arma3 Server Tools Service
After=network.target

[Service]
Type=simple
User=arma3
WorkingDirectory=/opt/arma3-server-tool
Environment=DATA_DIR=/var/lib/a3st
Environment=PORT=19580
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/node /opt/arma3-server-tool/packages/service/dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

远程访问时务必设置 `API_TOKEN` 并配置防火墙。

## 限制

- **Electron 桌面壳** 未提供 Linux 安装包；请用浏览器或自行用 systemd 托管 Service。
- **监控 RVExtension**（`DestinyServerMonitoring`）若为 Windows DLL，Linux 上需单独编译或禁用监控模组。
- **BattlEye / RCon** 行为与 Windows 一致，但请在生产环境实测防火墙与端口。
