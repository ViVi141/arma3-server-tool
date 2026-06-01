using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Sync
{
    /// <summary>
    /// Builds compact compare fingerprints for <see cref="ArmaServerConfig"/> with a single JSON
    /// serialization pass (mods are summarized separately).
    /// </summary>
    internal static class ServerConfigCompareSnapshot
    {
        private const char ModsSeparator = '\u001f';

        public static string Serialize(ArmaServerConfig config)
        {
            if (config == null)
            {
                return string.Empty;
            }

            string modsFingerprint = BuildModsFingerprint(config.StartupParameters?.modsEntities);
            using (CompareSnapshotRestoreToken restore = CompareSnapshotRestoreToken.Capture(config))
            {
                string settingsPart = JsonSerializer.ToCompactJson(config);
                return settingsPart + ModsSeparator + modsFingerprint;
            }
        }

        internal static string BuildModsFingerprint(IList<ModsEntity> mods)
        {
            if (mods == null || mods.Count == 0)
            {
                return "mods:0";
            }

            List<ModsEntity> sorted = mods
                .Where(mod => mod != null)
                .OrderBy(mod => mod.ModPath ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ThenBy(mod => mod.ModDirName ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var builder = new StringBuilder(sorted.Count * 48);
            builder.Append("mods:").Append(sorted.Count);
            for (int i = 0; i < sorted.Count; i++)
            {
                ModsEntity mod = sorted[i];
                builder.Append('|');
                builder.Append(mod.ModPath).Append(',');
                builder.Append(mod.ModDirName).Append(',');
                builder.Append(mod.ModId).Append(',');
                AppendFlag(builder, mod.LocalMod);
                AppendFlag(builder, mod.ServerMod);
                AppendFlag(builder, mod.HeadlessClientMod);
                AppendFlag(builder, mod.InputLocalMod);
            }

            return builder.ToString();
        }

        private static void AppendFlag(StringBuilder builder, bool value)
        {
            if (value)
            {
                builder.Append('1');
            }
            else
            {
                builder.Append('0');
            }
        }

        private sealed class CompareSnapshotRestoreToken : IDisposable
        {
            private readonly ArmaServerConfig config;
            private List<ModsEntity> modsBackup;
            private int processId;
            private string saveTime;
            private Dictionary<string, string> missionParamsBackup;

            private CompareSnapshotRestoreToken(ArmaServerConfig config)
            {
                this.config = config;
                ApplyNormalization();
            }

            public static CompareSnapshotRestoreToken Capture(ArmaServerConfig config)
            {
                return new CompareSnapshotRestoreToken(config);
            }

            public void Dispose()
            {
                if (config.StartupParameters != null)
                {
                    if (modsBackup != null)
                    {
                        config.StartupParameters.modsEntities = modsBackup;
                    }
                }

                if (config.ServerTaskManagement != null)
                {
                    config.ServerTaskManagement.ProcessById = processId;
                }

                config.SaveTime = saveTime;
                config.MissionParams = missionParamsBackup;
            }

            private void ApplyNormalization()
            {
                if (config.ServerTaskManagement == null)
                {
                    config.ServerTaskManagement = new ServerManagement();
                }

                processId = config.ServerTaskManagement.ProcessById;
                config.ServerTaskManagement.ProcessById = 0;
                saveTime = config.SaveTime;
                config.SaveTime = string.Empty;

                if (config.StartupParameters == null)
                {
                    config.StartupParameters = new StartupParameters();
                }

                modsBackup = config.StartupParameters.modsEntities;
                config.StartupParameters.modsEntities = new List<ModsEntity>();

                missionParamsBackup = config.MissionParams;
                if (config.MissionParams != null && config.MissionParams.Count > 1)
                {
                    config.MissionParams = config.MissionParams
                        .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                        .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
                }
            }
        }
    }
}
