using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal interface IServerSettingsPanel
    {
        void Bind(ArmaServerConfig config);

        void ApplyToModel();
    }
}
