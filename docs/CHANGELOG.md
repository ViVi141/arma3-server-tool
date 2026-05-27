# 变更日志

格式基于各版本发布清单整理；详细条目见 [archive/releases/](archive/releases/)。

## [1.4.1] — 当前

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

打 tag 示例：

```powershell
git tag -a v1.4.1 -m "Arma3 Server Tools v1.4.1"
git push origin v1.4.1
```
