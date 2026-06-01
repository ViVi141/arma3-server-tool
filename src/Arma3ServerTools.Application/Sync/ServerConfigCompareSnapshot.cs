using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Sync
{
    /// <summary>
    /// Builds compact compare fingerprints for <see cref="ArmaServerConfig"/> without
    /// serializing large mod lists twice into JSON.
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
            string json = JsonSerializer.ToCompactJson(config);
            ArmaServerConfig clone = JsonSerializer.FromJson<ArmaServerConfig>(json);
            if (clone == null)
            {
                return modsFingerprint;
            }

            NormalizeInPlace(clone);
            if (clone.StartupParameters == null)
            {
                clone.StartupParameters = new StartupParameters();
            }

            clone.StartupParameters.modsEntities = new List<ModsEntity>();
            string settingsPart = JsonSerializer.ToCompactJson(clone);
            return settingsPart + ModsSeparator + modsFingerprint;
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

        private static void NormalizeInPlace(ArmaServerConfig config)
        {
            if (config.ServerTaskManagement == null)
            {
                config.ServerTaskManagement = new ServerManagement();
            }

            if (config.MissionParams != null && config.MissionParams.Count > 1)
            {
                config.MissionParams = config.MissionParams
                    .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                    .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
            }

            config.ServerTaskManagement.ProcessById = 0;
            config.SaveTime = string.Empty;
        }
    }
}
