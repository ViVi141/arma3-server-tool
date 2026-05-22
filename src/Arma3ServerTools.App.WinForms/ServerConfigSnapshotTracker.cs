using System;
using System.Collections.Generic;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class ServerConfigSnapshotTracker
    {
        private readonly Dictionary<string, string> snapshots = new Dictionary<string, string>(StringComparer.Ordinal);

        public void Capture(string serverUuid, ArmaServerConfig config)
        {
            if (string.IsNullOrEmpty(serverUuid) || config == null)
            {
                return;
            }

            snapshots[serverUuid] = JsonSerializer.ToJson(config);
        }

        public void Remove(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return;
            }

            snapshots.Remove(serverUuid);
        }

        public void Clear()
        {
            snapshots.Clear();
        }

        public bool HasChanges(string serverUuid, ArmaServerConfig configAfterApplyAll)
        {
            if (string.IsNullOrEmpty(serverUuid) || configAfterApplyAll == null)
            {
                return false;
            }

            string baseline;
            if (!snapshots.TryGetValue(serverUuid, out baseline))
            {
                return false;
            }

            string current = JsonSerializer.ToJson(configAfterApplyAll);
            return !string.Equals(baseline, current, StringComparison.Ordinal);
        }
    }
}
