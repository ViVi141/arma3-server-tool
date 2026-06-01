# 变更日志

格式基于各版本发布清单整理；详细条目见 [archive/releases/](archive/releases/)。

## [1.5.0] — 当前

- **A3ST 配置包**：`config/{uuid}/` 分片存储（`manifest.json`、`mods.json` 等）；旧版 `config/{uuid}.json` 自动迁移。
- **保存与应用分离**：「保存到工具」只写配置包；「应用到服务器目录」写 `server.cfg` 等；「启动」不再自动写 cfg。
- **同步状态**：仅「已保存 / 未保存」；不再跟踪游戏目录 cfg 手改漂移。
- **性能**：大模组列表下保存/应用/刷新加速（快照、扫描、启动参数构建等优化）。
- **预检**：无 `server.cfg` 时启动被阻断并提示先应用。
- **Agent**：`save` / `write_cfg` / `start` 语义与 GUI 对齐（见 [config-workflow.md](config-workflow.md)、[agent-capabilities.md](agent-capabilities.md)）。

## [1.4.2]

- 修复仅启用服务器模组时 bikey 不会自动复制的问题。
- 新增「复制全部 Bikey」按钮，可手动对当前扫描列表批量复制。
- bikey 改为只复制不删除；扫描模组时若开启自动复制则同步全部模组；多余密钥不影响服务器运行。

## [1.4.1]

- 修复模组 bikey 签名状态检测与自动复制逻辑不一致（递归查找、复制后文件名判断）。
- Agent：Kestrel HTTP API、能力发现 `GET /api/v1/actions`、配置 CRUD、文件上传、异步任务、SteamCMD/游戏日志读取等（见 [agent-capabilities.md](agent-capabilities.md)）。

## [1.4.0]

- UI 迁移 AntdUI；顶栏与响应式布局；设置 dirty/baseline；模组扫描受保护路径容错；带时间戳安装包等。

## [1.3.0]

- 监控与统计增强、定时任务与导出相关改进（详见归档发布说明）。

## [1.2.x]

- 1.2.3：稳定性与回归修复。  
- 1.2.2 / 1.2.1 / 1.2.0：WinForms 分层、RCon、模组、SteamCMD 等能力补齐。

## [1.1.x]

- 1.1.1 / 1.1.0：开源发布准备、文档与打包流程。

## [1.0.0]

- 去 DevExpress、.NET 10 分层重构后首个公开发布基线。

---

## 发布操作

版本号：`Directory.Build.props` 中的 `Version`。

```powershell
.\scripts\build-release.ps1
```

打 tag 示例（维护者，需先提交版本与文档变更）：

```powershell
git tag -a v1.5.0 -m "Arma3 Server Tools v1.5.0"
git push origin v1.5.0
```

完整清单见 [archive/releases/release-v1.5.0.md](archive/releases/release-v1.5.0.md)。
