# 冒烟验收清单

> 手动验收参考。v2 主线见 **§A**；v1 WinForms 见 **§B**（历史）。  
> 关联：[v2-quickstart.md](v2-quickstart.md) · [first-server-guide.md](first-server-guide.md) · [config-workflow.md](config-workflow.md)

---

## §A v2（Vue + Node Service）— 当前主线

### 环境

- [ ] Node.js ≥ 20；`powershell -ExecutionPolicy Bypass -File scripts/ci-local.ps1` 通过
- [ ] 开服机为 Windows；工具目录与 Arma 3 专用服务器目录均为**英文路径**
- [ ] `@a3st/service` 监听 `http://127.0.0.1:19580`（或自定义 `DATA_DIR` / 端口）
- [ ] Web 前端或 Electron 桌面版可打开控制面板

### 连接与首服

- [ ] 连接页默认 **本机** `127.0.0.1:19580` → **连接** 进入控制台
- [ ] 无配置时空列表显示 **首服向导** 引导
- [ ] **首服向导**：名称、目录、端口、RCon → 完成创建
- [ ] 或 **新建配置** 对话框可创建空白配置

### 保存 / 写入 / 启停

- [ ] 顶栏 **保存** 写入配置包（`config/{uuid}/`）
- [ ] **写入游戏配置** 生成 `server.cfg` 等（不自动启动）
- [ ] **开服检查** 对缺失 `server.cfg` 报阻塞错误
- [ ] **启动** / **停止** / **重启** 状态与 PID 正确
- [ ] 状态栏：**未写入游戏配置** / **已写入游戏配置** / 页内 **未保存**

### 核心 Tab

- [ ] **概览**：运行状态、在线人数、RPT 文件名、快捷入口
- [ ] **基本** / **安全**：主机名、端口、BattlEye、RCon
- [ ] **模组**：扫描、导入、Bikey 状态
- [ ] **SteamCMD**：下载 steamcmd、安装/更新 `arma3server`
- [ ] **远程控制**：RCon 连接、玩家列表
- [ ] **统计** / **定时** / **快照** / **RPT 日志**（高级 Tab 开启后可见）

### API / 自动化

- [ ] `GET /api/v1/health` 返回 200
- [ ] `GET /api/v1/actions` 列出 task action
- [ ] `POST /api/v1/task` 可执行 `save` / `write_cfg` / `start` 等

### 远程（可选）

- [ ] 另一台机器浏览器或 Electron 连接 Tailscale / 内网 Service URL
- [ ] Bearer Token 鉴权生效（401 无 Token）
- [ ] 连接页显示远程说明；Electron **被控设置** 可改端口 / Token / 允许远程

### Electron 桌面版（可选）

- [ ] `npm run pack:desktop:dir` 产出 `apps/desktop/dist/` 安装目录
- [ ] 干净 Windows 机解压/安装后可启动 Electron + 内嵌 Service
- [ ] **被控设置** 保存后 Service 重启，端口与 Token 生效
- [ ] 托盘最小化与退出正常（若已实现）

---

## §B v1（WinForms）— 归档

> 英文路径冒烟清单（7-05 / UX v1.1）。v1 WinForms 已归档，仅作历史参考。

### 环境准备

- [ ] 工具安装目录与 Arma 3 专用服务器目录均为英文路径
- [ ] 发布包根目录存在 `README.txt`（.NET 10 Desktop Runtime 说明）
- [ ] 缺 Runtime 时启动弹窗提示并打开下载页
- [ ] 已配置 SteamCMD（工具 → SteamCMD 设置）
- [ ] 监控宿主 DLL 已就绪（首次启动时工具会尝试拉起 MonitoringHost）

### 新建与配置

- [ ] **工具 → 首服向导**：填写名称、目录、端口、RCon、BattlEye，保存并应用到服务器目录
- [ ] 无配置时空列表引导页可见（首服向导 / 新建 / 开服指南）
- [ ] 左侧列表 **搜索框** 能按配置名 / UUID 过滤
- [ ] 列表 **排序** 下拉：按名称 / 运行优先 / 按保存时间
- [ ] **概览** Tab：主机名、端口、监控/统计摘要、定时摘要、RPT 文件名
- [ ] **启动前检查** 按钮：无阻塞错误项

### 保存 / 写入 / 启停

- [ ] 主按钮文案为 **保存到工具** / **应用到服务器目录**
- [ ] 大模组列表（100+）保存/写入时 UI 无明显冻结（Session + 后台持久化）
- [ ] **服务器** 菜单可切换自动快照策略（关闭 / 保存前 / 写入前 / 异步）
- [ ] 状态栏：**未保存到工具** / **已保存到工具**（无「cfg 未同步」三态）
- [ ] `config/{uuid}/manifest.json` 存在；旧版 `config/{uuid}.json` 迁移后已删除
- [ ] 切换配置时未保存对话框含「应用到服务器目录」选项
- [ ] 未应用时 **启动前检查** 对缺失 `server.cfg` 报阻塞错误
- [ ] **启动**：有错误项阻止启动；RCon 密码为空等警告需二次确认
- [ ] 启动成功 Toast 为「使用游戏目录中现有 cfg」类文案（非「已写入 server.cfg」）
- [ ] **停止** 后状态变为已停止，概览 PID 清空
- [ ] 关闭主窗口最小化到托盘；托盘菜单可恢复 / 退出

### RCon 与运维

- [ ] **远程控制** Tab：连接 RCon，查看玩家列表
- [ ] 运行中 **概览 → 在线人数** 显示 RCon 查询结果（或不可用提示）
- [ ] 远程控制页可 **修改 RCon 密码** 并保存到工具配置
- [ ] 踢人 / 公告 / 加载任务（若已配置任务）
- [ ] **封禁** Tab 顶部说明 `bans.txt` 与 BattlEye 双体系

### 日志与统计

- [ ] **概览 → 查看 RPT 日志**：能打开 tail 窗口，运行中可自动刷新
- [ ] **统计** Tab 含监控开关（非定时 Tab）
- [ ] **检测监控组件** 一键检查 DLL / 模组 / Host
- [ ] 无数据时显示排查 checklist
- [ ] **趋势图表**：FPS / 在线 / 击杀榜有数据（需监控快照）
- [ ] **导出 CSV** / **导出 HTML 日报** 成功
- [ ] 服务器意外退出时收到桌面气泡通知（手动停止不应通知）

### 自动化

- [ ] 本地执行 `dotnet test -c Release`（legacy），全部通过
- [ ] GitHub Actions CI 为绿（若已推送）

---

## 备注

| 现象 | 处理 |
|------|------|
| 路径含中文 | 工具启动时会提示；专用服务器目录亦须英文 |
| 端口被占用 | 开服检查应报错误；更换端口后重试 |
| 找不到 RPT | 先启动一次服务器，或确认 `ServerDir` 正确 |
| v2 Service 未启动 | 连接页探活失败；先 `npm run build:service` 再 `npm run start:service` |
