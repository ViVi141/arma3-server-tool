using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Config
{
    /// <summary>
    /// Builds semicolon-separated Arma 3 mod lists for -mod / -serverMod parameters.
    /// </summary>
    public static class ModCommandLineBuilder
    {
        public static string FormatModParameter(string serverDir, string modPath, string modDirName)
        {
            if (!string.IsNullOrWhiteSpace(modPath))
            {
                string trimmed = modPath.Trim().TrimEnd('\\', '/');
                if (trimmed.StartsWith("@", StringComparison.Ordinal))
                {
                    return trimmed;
                }

                if (!string.IsNullOrWhiteSpace(serverDir))
                {
                    string token = TryFormatAsServerRelativeToken(serverDir, trimmed);
                    if (!string.IsNullOrEmpty(token))
                    {
                        return token;
                    }
                }

                return trimmed;
            }

            if (string.IsNullOrWhiteSpace(modDirName) || string.IsNullOrWhiteSpace(serverDir))
            {
                return string.Empty;
            }

            string folderName = modDirName.Trim().TrimEnd('\\', '/');
            if (folderName.StartsWith("@", StringComparison.Ordinal))
            {
                folderName = folderName.Substring(1);
            }

            if (string.IsNullOrEmpty(folderName))
            {
                return string.Empty;
            }

            string serverModFolder = Path.Combine(serverDir, folderName);
            if (!Directory.Exists(serverModFolder))
            {
                return string.Empty;
            }

            return "@" + folderName;
        }

        public static bool IsModParameterAvailable(string serverDir, string formattedParameter)
        {
            if (string.IsNullOrWhiteSpace(formattedParameter))
            {
                return false;
            }

            if (formattedParameter.StartsWith("@", StringComparison.Ordinal))
            {
                return true;
            }

            return Directory.Exists(formattedParameter);
        }

        public static string BuildModList(string serverDir, IEnumerable<ModsEntityModRef> mods)
        {
            var builder = new InternalBuilder(serverDir);
            if (mods == null)
            {
                return string.Empty;
            }

            foreach (ModsEntityModRef mod in mods)
            {
                builder.TryAdd(mod.ModPath, mod.ModDirName);
            }

            return builder.ToString();
        }

        public static string BuildClientModList(string serverDir, IList<ModsEntity> mods)
        {
            var entries = new List<ModsEntityModRef>();
            if (mods != null)
            {
                foreach (ModsEntity entity in mods)
                {
                    if (entity == null)
                    {
                        continue;
                    }

                    if (entity.LocalMod || entity.HeadlessClientMod)
                    {
                        entries.Add(new ModsEntityModRef(entity.ModPath, entity.ModDirName));
                    }
                }
            }

            return BuildModList(serverDir, entries);
        }

        public static string BuildServerModList(
            string serverDir,
            IList<ModsEntity> mods,
            bool includeMonitoringMod)
        {
            var entries = new List<ModsEntityModRef>();
            if (mods != null)
            {
                foreach (ModsEntity entity in mods)
                {
                    if (entity == null)
                    {
                        continue;
                    }

                    if (entity.ServerMod)
                    {
                        entries.Add(new ModsEntityModRef(entity.ModPath, entity.ModDirName));
                    }
                }
            }

            if (includeMonitoringMod)
            {
                entries.Add(new ModsEntityModRef(ToolConstants.MonitoringServerModToken, string.Empty));
            }

            return BuildModList(serverDir, entries);
        }

        public static string BuildHeadlessModList(string serverDir, IList<ModsEntity> mods)
        {
            var entries = new List<ModsEntityModRef>();
            if (mods != null)
            {
                foreach (ModsEntity entity in mods)
                {
                    if (entity == null)
                    {
                        continue;
                    }

                    if (entity.HeadlessClientMod)
                    {
                        entries.Add(new ModsEntityModRef(entity.ModPath, entity.ModDirName));
                    }
                }
            }

            return BuildModList(serverDir, entries);
        }

        private static string TryFormatAsServerRelativeToken(string serverDir, string fullPath)
        {
            try
            {
                string normalizedServerDir = Path.GetFullPath(serverDir)
                    .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string normalizedModPath = Path.GetFullPath(fullPath)
                    .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string prefix = normalizedServerDir + Path.DirectorySeparatorChar;
                if (!normalizedModPath.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    return string.Empty;
                }

                string relative = normalizedModPath.Substring(prefix.Length);
                string folderName = ModFileTools.GetDirectoryName(relative);
                if (string.IsNullOrEmpty(folderName))
                {
                    folderName = relative;
                }

                if (string.IsNullOrEmpty(folderName))
                {
                    return string.Empty;
                }

                if (folderName.StartsWith("@", StringComparison.Ordinal))
                {
                    return folderName;
                }

                return "@" + folderName;
            }
            catch
            {
                return string.Empty;
            }
        }

        public readonly struct ModsEntityModRef
        {
            public ModsEntityModRef(string modPath, string modDirName)
            {
                ModPath = modPath;
                ModDirName = modDirName;
            }

            public string ModPath { get; }

            public string ModDirName { get; }
        }

        private sealed class InternalBuilder
        {
            private readonly string serverDir;
            private readonly HashSet<string> entries = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            private readonly StringBuilder buffer = new StringBuilder();

            public InternalBuilder(string serverDir)
            {
                this.serverDir = serverDir ?? string.Empty;
            }

            public void TryAdd(string modPath, string modDirName)
            {
                string formatted = FormatModParameter(serverDir, modPath, modDirName);
                if (!IsModParameterAvailable(serverDir, formatted))
                {
                    return;
                }

                if (!entries.Add(formatted))
                {
                    return;
                }

                if (buffer.Length > 0)
                {
                    buffer.Append(';');
                }

                buffer.Append(formatted);
            }

            public override string ToString()
            {
                return buffer.ToString();
            }
        }
    }
}
