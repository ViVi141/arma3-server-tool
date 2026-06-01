# UI 模组表格优化说明

## 优化背景
用户反馈：模组表格中的 "Workshop ID" 列与 "文件夹名" 列内容重复，建议移除以简化界面。

## 问题分析
在 Arma 3 服务器工具中，Steam Workshop 模组的文件夹名通常就是其 Workshop ID（如 `@463939057`），因此单独显示 Workshop ID 列确实存在信息冗余。

## 优化方案

### 1. 移除 Workshop ID 列
从模组表格中完全移除 "Workshop ID" 列，包括：
- 列定义
- 排序枚举 `ModTableSortMode.ModId`
- 排序下拉框选项 "创意工坊 ID"
- 排序逻辑处理

### 2. 重新分配列宽
将移除的 7% 宽度重新分配给更重要的列：

| 列名 | 原始宽度 | 第一次优化 | 第二次优化 | 总提升 |
|------|---------|-----------|-----------|--------|
| 序号 | 4% | 3% | 3% | -25% |
| 文件夹名 | 9% | 12% | **14%** | **+56%** |
| 模组名 | 13% | 15% | **18%** | **+38%** |
| ~~Workshop ID~~ | 8% | 7% | **移除** | - |
| 签名状态 | 5% | 4% | 4% | -20% |
| 路径 | 22% | 25% | **27%** | **+23%** |
| 更新时间 | 10% | 9% | 9% | -10% |

### 3. 代码修改清单

#### ModSettingsPanel.cs

**枚举修改**:
```csharp
// Before
internal enum ModTableSortMode
{
    ScanOrder = 0,
    DirName = 1,
    ModName = 2,
    ModId = 3,        // ❌ 移除
    UpdatedTime = 4,
}

// After
internal enum ModTableSortMode
{
    ScanOrder = 0,
    DirName = 1,
    ModName = 2,
    UpdatedTime = 3,  // 4 → 3
}
```

**下拉框修改**:
```csharp
// Before
sortSelect = SettingsLayoutHelper.CreateSelect(
    140,
    "扫描顺序",
    "文件夹名",
    "模组名",
    "创意工坊 ID",  // ❌ 移除
    "更新时间");

// After
sortSelect = SettingsLayoutHelper.CreateSelect(
    140,
    "扫描顺序",
    "文件夹名",
    "模组名",
    "更新时间");
```

**索引限制修改**:
```csharp
// Before
sortMode = (ModTableSortMode)SettingsLayoutHelper.Clamp(0, 4, sortSelect.SelectedIndex);

// After
sortMode = (ModTableSortMode)SettingsLayoutHelper.Clamp(0, 3, sortSelect.SelectedIndex);
```

**排序逻辑修改**:
```csharp
// 移除以下代码块
if (sortMode == ModTableSortMode.ModId)
{
    return source.OrderBy(row => row.ModId);
}
```

**列定义修改**:
```csharp
// 移除以下列定义
new AntdUI.Column("ModId", "Workshop ID")
{
    ReadOnly = true,
    Width = "7%",
    SortOrder = true,
},
```

## 优化效果

### 视觉效果
- ✅ 表格更简洁，减少了冗余信息
- ✅ 重要列（文件夹名、模组名、路径）宽度显著增加
- ✅ 长文本截断问题进一步改善

### 用户体验
- ✅ 减少视觉干扰，聚焦核心信息
- ✅ 文件夹名和模组名更容易完整阅读
- ✅ 路径信息显示更充分

### 技术影响
- ✅ 编译通过，无错误
- ✅ 不影响数据存储和业务逻辑
- ✅ 完全向后兼容

## 列宽优化对比

### Before（原始）
```
序号(4%) | 更新(?) | 文件夹(9%) | 模组名(13%) | ID(8%) | ... | 路径(22%) | 时间(10%)
```

### After（优化后）
```
序号(3%) | 更新(?) | 文件夹(14%) | 模组名(18%) | ... | 路径(27%) | 时间(9%)
```

**可用宽度提升**:
- 文件夹名: +5% 绝对宽度 (+56% 相对提升)
- 模组名: +5% 绝对宽度 (+38% 相对提升)
- 路径: +5% 绝对宽度 (+23% 相对提升)

## 测试建议

### 功能测试
1. 验证模组扫描功能正常
2. 验证所有排序模式工作正常（扫描顺序、文件夹名、模组名、更新时间）
3. 验证表格显示和选择功能正常

### 显示测试
1. 添加长文件夹名的模组，验证显示效果
2. 添加长模组名的模组（如中文名），验证显示效果
3. 添加长路径的模组，验证显示效果

### 兼容性测试
1. 加载旧的配置文件，验证兼容性
2. 验证模组数据正确保存和加载

## 相关文件
- `src/Arma3ServerTools.App.WinForms/Controls/ModSettingsPanel.cs`
- `docs/ui-display-check-report.md`
- `docs/ui-optimization-changelog.md`
