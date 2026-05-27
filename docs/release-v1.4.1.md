# v1.4.1 发布清单（Changelog）

> 本版范围：自 `v1.3.0` 起至当前提交（含 v1.4.0 功能与补丁）。

## 本版要点

### v1.4.1 补丁

- 修复模组「签名状态」检测与自动复制 bikey 逻辑不一致：统一递归查找模组内密钥、按复制后的文件名（`模组名-作者.bikey`）判断服务器 `Keys` 目录，并兼容手动复制的原始文件名。

### v1.4.0 功能摘要

- UI 迁移 AntdUI、顶栏布局与密码框修复；设置 dirty 与 baseline 比较；模组扫描受保护路径容错；构建时间戳安装包等。详见 [release-v1.4.0.md](release-v1.4.0.md)。

## 版本号

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.4.1` |

## Git tag

```powershell
git tag -a v1.4.1 -m "Arma3 Server Tools v1.4.1"
git push origin v1.4.1
```
