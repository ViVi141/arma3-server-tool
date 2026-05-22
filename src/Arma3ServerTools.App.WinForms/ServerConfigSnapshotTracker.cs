using System;
using System.Collections.Generic;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class ServerConfigSnapshotTracker
    {
        private readonly Dictionary<string, string> persistedSnapshots =
            new Dictionary<string, string>(StringComparer.Ordinal);

        private readonly Dictionary<string, string> serverAppliedSnapshots =
            new Dictionary<string, string>(StringComparer.Ordinal);

        public void Capture(string serverUuid, ArmaServerConfig config)
        {
            CapturePersisted(serverUuid, config);
            CaptureServerApplied(serverUuid, config);
        }

        public void CapturePersisted(string serverUuid, ArmaServerConfig config)
        {
            if (string.IsNullOrEmpty(serverUuid) || config == null)
            {
                return;
            }

            persistedSnapshots[serverUuid] = JsonSerializer.ToJson(config);
        }

        public void CaptureServerApplied(string serverUuid, ArmaServerConfig config)
        {
            if (string.IsNullOrEmpty(serverUuid) || config == null)
            {
                return;
            }

            serverAppliedSnapshots[serverUuid] = JsonSerializer.ToJson(config);
        }

        public void Remove(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return;
            }

            persistedSnapshots.Remove(serverUuid);
            serverAppliedSnapshots.Remove(serverUuid);
        }

        public void Clear()
        {
            persistedSnapshots.Clear();
            serverAppliedSnapshots.Clear();
        }

        public bool HasChanges(string serverUuid, ArmaServerConfig configAfterApplyAll)
        {
            if (string.IsNullOrEmpty(serverUuid) || configAfterApplyAll == null)
            {
                return false;
            }

            string baseline;
            if (!persistedSnapshots.TryGetValue(serverUuid, out baseline))
            {
                return false;
            }

            string current = JsonSerializer.ToJson(configAfterApplyAll);
            return !string.Equals(baseline, current, StringComparison.Ordinal);
        }

        public bool HasServerCfgDrift(string serverUuid, ArmaServerConfig configAfterApplyAll)
        {
            if (string.IsNullOrEmpty(serverUuid) || configAfterApplyAll == null)
            {
                return false;
            }

            string baseline;
            if (!serverAppliedSnapshots.TryGetValue(serverUuid, out baseline))
            {
                return true;
            }

            string current = JsonSerializer.ToJson(configAfterApplyAll);
            return !string.Equals(baseline, current, StringComparison.Ordinal);
        }
    }
}
