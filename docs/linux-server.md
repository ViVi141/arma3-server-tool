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

远程访问时务必设置 `API_TOKEN` 并配置防火墙。`HOST=0.0.0.0`（或其它非 loopback）且未配置 `API_TOKEN` 时，Service **拒绝**除 `/api/v1/health`、`/api/v1/actions` 外的管理 API。

`GET /api/v1/health` 会如实返回：

- `remoteAccessEnabled`：是否绑定非本机地址
- `authConfigured`：是否已设置 `API_TOKEN`
- `bindHost` / `bindPort`：实际监听配置

## 反向代理与 HTTPS（推荐）

公网不要直接暴露 `:19580`。在网关终止 TLS，并把管理流量转到本机 Service；网关可用后再用防火墙限制后端仅本机可达。

### Caddy 示例

```caddyfile
a3st.example.com {
  encode gzip
  reverse_proxy 127.0.0.1:19580 {
    # SSE / 长连接（SteamCMD 进度流）
    flush_interval -1
  }
}
```

### Nginx 示例要点

- `proxy_http_version 1.1` + `Connection ""`（或按 SSE 需求调整）
- 对 `/api/v1/steamcmd/stream` 等 SSE：关闭或拉长缓冲（`proxy_buffering off`）
- 上传限制：`client_max_body_size 100m`（与 Service PBO 上限一致）
- 鉴权：优先让浏览器/客户端使用 `Authorization: Bearer <API_TOKEN>`；`?token=` 仅因 EventSource 无法设头而保留，**勿写入访问日志明文**（脱敏 `token=`）
- 同源：若 UI 与 API 同域反代，可减少 CORS 问题；跨域时需保留 CORS 与凭据策略

Service 侧环境变量建议：

```bash
export HOST=127.0.0.1   # 仅本机，由反向代理对外
export PORT=19580
export API_TOKEN='long-random-secret'
export WEB_ROOT=/opt/arma3-server-tool/packages/web/dist
```

## 限制

- **Electron 桌面壳** 未提供 Linux 安装包；请用浏览器或自行用 systemd 托管 Service。
- **监控 RVExtension**（`DestinyServerMonitoring`）若为 Windows DLL，Linux 上需单独编译或禁用监控模组。
- **BattlEye / RCon** 行为与 Windows 一致，但请在生产环境实测防火墙与端口。

