using Arma3ServerTools.Application.Session;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal interface IServerConfigSessionPanel
    {
        bool IsSessionAttached { get; }

        void Attach(ServerConfigSession session);

        void Detach();
    }
}
