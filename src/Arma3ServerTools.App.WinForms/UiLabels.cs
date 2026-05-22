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

        public const string SaveToToolButton = "保存到工具";
        public const string ApplyToServerButton = "应用到服务器目录";

        public const string SaveToToolSuccess = "配置已保存到工具（尚未写入游戏目录）。";

        public const string ApplyToServerSuccess =
            "已写入 server.cfg、basic.cfg、*.Arma3Profile 与 BattlEye 配置，并部署监控组件（如已启用）。";

        public const string StartServerSuccess = "已写入 server.cfg、basic.cfg、*.Arma3Profile 并启动服务器进程。";

        public const string StatusUnsavedChanges = "有未保存修改";

        public const string StatusServerCfgDrift = "游戏 cfg 未同步（启动时将自动写入）";

        public const string ExtraArgsGroup = "附加参数（可直接编辑，保存时自动编码）";

        public const string ScriptEventsGroup = "脚本事件（可直接编辑，保存时自动编码）";

        public const string RemoteControlTab = "远程控制";

        public static string FormatSyncedStatus(string saveTime)
        {
            if (string.IsNullOrWhiteSpace(saveTime))
            {
                return "工具与游戏 cfg 已同步";
            }

            return "已同步 · " + saveTime;
        }

        public static string CmdFlag(string description, string flag)
        {
            return description + " (" + flag + ")";
        }
    }
}
