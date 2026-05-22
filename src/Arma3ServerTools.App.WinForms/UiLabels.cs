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

        public const string WriteConfigFiles = "写入配置文件";

        public const string ConfigSavedHint = "已写入 server.cfg、basic.cfg 与 BattlEye 配置。";

        public const string ExtraArgsGroup = "附加参数（可直接编辑，保存时自动编码）";

        public const string ScriptEventsGroup = "脚本事件（可直接编辑，保存时自动编码）";

        public const string RemoteControlTab = "远程控制";

        public static string CmdFlag(string description, string flag)
        {
            return description + " (" + flag + ")";
        }
    }
}
