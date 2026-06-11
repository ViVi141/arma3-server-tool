using System;
using Arma3ServerTools.Application.Session;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    /// <summary>
    /// Shared attach/detach helpers for settings panels that patch the session model on edit.
    /// </summary>
    internal sealed class SessionSettingsPanelSupport : IServerConfigSessionPanel, IDisposable
    {
        private readonly IServerSettingsPanel panel;
        private readonly Action<ArmaServerConfig> copyToModel;
        private ServerConfigSession session;
        private bool suppressPush;

        public SessionSettingsPanelSupport(
            IServerSettingsPanel panel,
            Action<ArmaServerConfig> copyToModel)
        {
            this.panel = panel ?? throw new ArgumentNullException(nameof(panel));
            this.copyToModel = copyToModel ?? throw new ArgumentNullException(nameof(copyToModel));
        }

        public bool IsSessionAttached
        {
            get { return session != null; }
        }

        public void Attach(ServerConfigSession newSession)
        {
            Detach();
            if (newSession == null)
            {
                panel.Bind(null);
                return;
            }

            session = newSession;
            suppressPush = true;
            try
            {
                panel.Bind(session.Model);
            }
            finally
            {
                suppressPush = false;
            }
        }

        public void Detach()
        {
            session = null;
        }

        public void PushModelFromPanel()
        {
            if (suppressPush || session == null)
            {
                return;
            }

            session.Patch(
                config =>
                {
                    copyToModel(config);
                });
        }

        public void Dispose()
        {
            Detach();
        }
    }
}
