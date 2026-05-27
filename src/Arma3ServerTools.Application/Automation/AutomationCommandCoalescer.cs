using System;
using System.Collections.Generic;

namespace Arma3ServerTools.Application.Automation
{
    /// <summary>
    /// Merges automation commands so AI-split tasks still run as one SteamCMD session when safe.
    /// </summary>
    public static class AutomationCommandCoalescer
    {
        private static readonly HashSet<string> PassthroughActions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "status",
            "help",
            "read_logs",
            "read_rpt",
            "rcon_players",
            "scan_mods",
            "preflight",
            "steamcmd_status",
            "save",
        };

        public static List<AutomationCommand> Coalesce(IList<AutomationCommand> commands)
        {
            List<AutomationCommand> merged = CoalesceDownloadMods(commands);
            return StripRedundantDownloadModsAfterHtmlImport(merged);
        }

        private static List<AutomationCommand> CoalesceDownloadMods(IList<AutomationCommand> commands)
        {
            var result = new List<AutomationCommand>();
            if (commands == null || commands.Count == 0)
            {
                return result;
            }

            AutomationCommand pendingDownload = null;
            int mergedDownloadCount = 0;
            var deferredPassthrough = new List<AutomationCommand>();

            for (int i = 0; i < commands.Count; i++)
            {
                AutomationCommand command = commands[i];
                if (command == null)
                {
                    continue;
                }

                string action = NormalizeAction(command.Action);
                if (string.Equals(action, "download_mods", StringComparison.OrdinalIgnoreCase))
                {
                    if (pendingDownload == null)
                    {
                        pendingDownload = CloneDownloadCommand(command);
                        mergedDownloadCount = 1;
                    }
                    else
                    {
                        MergeDownloadCommand(pendingDownload, command);
                        mergedDownloadCount++;
                    }

                    continue;
                }

                if (IsPassthroughAction(action))
                {
                    deferredPassthrough.Add(command);
                    continue;
                }

                FlushPendingDownload(result, ref pendingDownload, ref mergedDownloadCount);
                AppendDeferredPassthrough(result, deferredPassthrough);
                result.Add(command);
            }

            FlushPendingDownload(result, ref pendingDownload, ref mergedDownloadCount);
            AppendDeferredPassthrough(result, deferredPassthrough);
            return result;
        }

        private static void AppendDeferredPassthrough(
            List<AutomationCommand> result,
            List<AutomationCommand> deferredPassthrough)
        {
            if (deferredPassthrough.Count == 0)
            {
                return;
            }

            for (int i = 0; i < deferredPassthrough.Count; i++)
            {
                result.Add(deferredPassthrough[i]);
            }

            deferredPassthrough.Clear();
        }

        private static List<AutomationCommand> StripRedundantDownloadModsAfterHtmlImport(
            List<AutomationCommand> commands)
        {
            if (commands == null || commands.Count == 0)
            {
                return commands;
            }

            bool htmlAlreadyDownloaded = false;
            var filtered = new List<AutomationCommand>(commands.Count);

            for (int i = 0; i < commands.Count; i++)
            {
                AutomationCommand command = commands[i];
                if (command == null)
                {
                    continue;
                }

                string action = NormalizeAction(command.Action);
                if (string.Equals(action, "import_mods_html", StringComparison.OrdinalIgnoreCase))
                {
                    filtered.Add(command);
                    htmlAlreadyDownloaded = HtmlImportModeIncludesDownload(command.HtmlImportMode);
                    continue;
                }

                if (htmlAlreadyDownloaded)
                {
                    if (string.Equals(action, "download_mods", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (!IsPassthroughAction(action))
                    {
                        htmlAlreadyDownloaded = false;
                    }
                }

                filtered.Add(command);
            }

            return filtered;
        }

        private static bool IsPassthroughAction(string action)
        {
            if (string.IsNullOrWhiteSpace(action))
            {
                return false;
            }

            return PassthroughActions.Contains(action);
        }

        private static bool HtmlImportModeIncludesDownload(string mode)
        {
            if (string.IsNullOrWhiteSpace(mode))
            {
                return true;
            }

            string value = mode.Trim().ToLowerInvariant();
            if (value == "enable")
            {
                return false;
            }

            if (value == "download" || value == "download_and_enable")
            {
                return true;
            }

            return true;
        }

        private static string NormalizeAction(string action)
        {
            if (string.IsNullOrWhiteSpace(action))
            {
                return string.Empty;
            }

            return action.Trim();
        }

        private static void FlushPendingDownload(
            List<AutomationCommand> result,
            ref AutomationCommand pendingDownload,
            ref int mergedDownloadCount)
        {
            if (pendingDownload == null)
            {
                return;
            }

            if (mergedDownloadCount > 1)
            {
                pendingDownload.CoalescedFromCount = mergedDownloadCount;
            }

            result.Add(pendingDownload);
            pendingDownload = null;
            mergedDownloadCount = 0;
        }

        private static AutomationCommand CloneDownloadCommand(AutomationCommand source)
        {
            var clone = new AutomationCommand
            {
                Action = "download_mods",
                EnableModsOnServer = source.EnableModsOnServer,
                ScanModsAfterDownload = source.ScanModsAfterDownload,
                CaptureSteamCmdOutput = source.CaptureSteamCmdOutput,
                SteamCmdTimeoutSeconds = source.SteamCmdTimeoutSeconds,
            };
            if (source.ModIds != null)
            {
                clone.ModIds.AddRange(source.ModIds);
            }

            return clone;
        }

        private static void MergeDownloadCommand(AutomationCommand target, AutomationCommand source)
        {
            if (source.ModIds != null)
            {
                var seen = new HashSet<ulong>();
                for (int i = 0; i < target.ModIds.Count; i++)
                {
                    if (target.ModIds[i] > 0)
                    {
                        seen.Add(target.ModIds[i]);
                    }
                }

                for (int i = 0; i < source.ModIds.Count; i++)
                {
                    ulong modId = source.ModIds[i];
                    if (modId > 0 && seen.Add(modId))
                    {
                        target.ModIds.Add(modId);
                    }
                }
            }

            if (source.CaptureSteamCmdOutput == true)
            {
                target.CaptureSteamCmdOutput = true;
            }

            if (source.EnableModsOnServer)
            {
                target.EnableModsOnServer = true;
            }

            if (source.ScanModsAfterDownload)
            {
                target.ScanModsAfterDownload = true;
            }

            if (source.SteamCmdTimeoutSeconds > target.SteamCmdTimeoutSeconds)
            {
                target.SteamCmdTimeoutSeconds = source.SteamCmdTimeoutSeconds;
            }
        }
    }
}
