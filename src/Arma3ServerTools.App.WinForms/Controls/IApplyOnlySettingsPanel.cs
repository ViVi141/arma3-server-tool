using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    /// <summary>
    /// 保存/应用前将 UI 写入模型时使用的轻量绑定，避免全量磁盘扫描。
    /// </summary>
    internal interface IApplyOnlySettingsPanel : IServerSettingsPanel
    {
        void BindForApply(ArmaServerConfig config);
    }
}
