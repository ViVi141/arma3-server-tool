using System;
using System.Collections.Generic;
using System.Linq;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Sync
{
    public sealed class ServerConfigSnapshotTracker
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

            persistedSnapshots[serverUuid] = SerializeSnapshot(config);
        }

        public void CaptureServerApplied(string serverUuid, ArmaServerConfig config)
        {
            if (string.IsNullOrEmpty(serverUuid) || config == null)
            {
                return;
            }

            serverAppliedSnapshots[serverUuid] = SerializeSnapshot(config);
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

            string current = SerializeSnapshot(configAfterApplyAll);
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

            string current = SerializeSnapshot(configAfterApplyAll);
            return !string.Equals(baseline, current, StringComparison.Ordinal);
        }

        private static string SerializeSnapshot(ArmaServerConfig config)
        {
            if (config == null)
            {
                return string.Empty;
            }

            string json = JsonSerializer.ToJson(config);
            ArmaServerConfig normalized = JsonSerializer.FromJson<ArmaServerConfig>(json);
            if (normalized == null)
            {
                return json;
            }

            if (normalized.ServerTaskManagement == null)
            {
                normalized.ServerTaskManagement = new ServerManagement();
            }

            if (normalized.MissionParams != null && normalized.MissionParams.Count > 1)
            {
                normalized.MissionParams = normalized.MissionParams
                    .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                    .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
            }

            // Runtime fields — not user edits, should not trigger unsaved prompts.
            normalized.ServerTaskManagement.ProcessById = 0;
            normalized.SaveTime = string.Empty;
            return JsonSerializer.ToJson(normalized);
        }
    }
}
