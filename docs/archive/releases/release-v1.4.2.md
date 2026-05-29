# v1.4.2 发布清单（Changelog）

> 本版范围：自 `v1.4.1` 起的 bikey 复制改进。

## 本版要点

### v1.4.2 补丁

- 修复仅启用服务器模组（`-serverMod`）时 bikey 不会自动复制的问题。
- 新增「复制全部 Bikey」按钮，可对当前扫描列表一次性批量复制。
- bikey 策略调整为只复制、不删除；Keys 目录中多余密钥不影响服务器运行。
- 开启自动复制时，扫描模组后会同步复制全部已扫描模组的 bikey。

## 版本号

| 位置 | 内容 |
|------|------|
| `Directory.Build.props` | `Version` = `1.4.2` |

## Git tag

```powershell
git tag -a v1.4.2 -m "Arma3 Server Tools v1.4.2"
git push origin v1.4.2
```
