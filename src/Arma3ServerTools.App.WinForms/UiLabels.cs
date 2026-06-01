using Arma3ServerTools.Core;

namespace Arma3ServerTools.App.WinForms
{
    /// <summary>
    /// 界面显示用中文标签（配置字段名仍写入 cfg，此处仅影响用户可见文本）。
    /// </summary>
    internal static class UiLabels
    {
        public const string AppTitle = ToolConstants.ProductName;

        public const string ServerId = "服务器标识";

        public const string PathRulesHint =
            "工具安装路径与 Arma 3 服务器目录均须为纯英文路径（不能包含中文或全角字符）。";

        public const string PathRulesShort =
            "工具或服务器路径不能包含中文，请改用纯英文路径。";

        public const string SingleInstanceAlreadyRunning =
            "程序已在运行，不能同时打开多个实例。\r\n"
            + "已尝试切换到已有窗口；若未看到，请检查任务栏或系统托盘。";

        public const string SaveToToolButton = "保存到工具";
        public const string ApplyToServerButton = "应用到服务器目录";

        public const string SaveToToolSuccess = "配置已保存到工具（A3ST 配置包，未写入游戏目录 cfg）。";

        public const string ApplyToServerSuccess =
            "已写入 server.cfg、basic.cfg、*.Arma3Profile 与 BattlEye 配置，并部署监控组件（如已启用）。";

        public const string StartServerSuccess = "已启动服务器进程（使用游戏目录中现有 cfg）。";

        public const string StatusUnsavedChanges = "● 未保存到工具";

        public const string StatusSaved = "✓ 已保存到工具";

        public const string SyncLegendHint =
            "橙色字段 = 已修改未保存；Tab 旁 ● = 该页有未保存修改。游戏目录 cfg 仅由「应用到服务器目录」生成，手改 cfg 工具不负责。";

        public const string ConfigRefreshModePerformance = "配置读取模式：性能优先（内存）";

        public const string ConfigRefreshModeCompatibility = "配置读取模式：兼容模式（手动刷新读磁盘）";

        public const string TabLocalDirtySuffix = " ●";

        public const string SaveToToolPendingMarker = " ●";

        public const string ApplyToServerPendingMarker = " ●";

        public const string ExtraArgsGroup = "附加参数（可直接编辑，保存时自动编码）";

        public const string ScriptEventsGroup = "脚本事件（可直接编辑，保存时自动编码）";

        public const string RemoteControlTab = "远程控制";

        public static string FormatSavedStatus(string saveTime)
        {
            if (string.IsNullOrWhiteSpace(saveTime))
            {
                return StatusSaved;
            }

            return StatusSaved + " · " + saveTime;
        }

        public static string CmdFlag(string description, string flag)
        {
            return description + " (" + flag + ")";
        }
    }
}
