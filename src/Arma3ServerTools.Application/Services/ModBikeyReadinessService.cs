using System.Collections.Generic;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class ModBikeyReadinessSummary
    {
        public int EnabledModCount { get; set; }

        public int ReadyCount { get; set; }

        public int NeedsAttentionCount { get; set; }

        public int UnsignedCount { get; set; }

        public int UncheckedCount { get; set; }

        public bool HasEnabledMods
        {
            get { return EnabledModCount > 0; }
        }

        public bool AllReady
        {
            get
            {
                if (EnabledModCount == 0)
                {
                    return true;
                }

                return NeedsAttentionCount == 0 && UnsignedCount == 0 && UncheckedCount == 0;
            }
        }

        public string ToSummaryText()
        {
            if (EnabledModCount == 0)
            {
                return "已启用模组: 0";
            }

            return "已启用 "
                + EnabledModCount
                + "  · 🟢 "
                + ReadyCount
                + "  · 🟡 "
                + NeedsAttentionCount
                + "  · 🔴 "
                + UnsignedCount
                + (UncheckedCount > 0 ? "  · ⚫ " + UncheckedCount : string.Empty);
        }
    }

    public sealed class ModBikeyReadinessService
    {
        private readonly BikeyService bikeyService;

        public ModBikeyReadinessService(BikeyService bikeyService)
        {
            this.bikeyService = bikeyService;
        }

        public ModBikeyReadinessSummary SummarizeEnabledMods(IList<ScannedModRow> rows)
        {
            var summary = new ModBikeyReadinessSummary();
            if (rows == null || rows.Count == 0)
            {
                return summary;
            }

            for (int i = 0; i < rows.Count; i++)
            {
                ScannedModRow row = rows[i];
                if (row == null || !row.IsAnyModSelected)
                {
                    continue;
                }

                summary.EnabledModCount++;
                string status = row.BikeyStatus ?? string.Empty;
                if (status == "🟢")
                {
                    summary.ReadyCount++;
                }
                else if (status == "🟡")
                {
                    summary.NeedsAttentionCount++;
                }
                else if (status == "🔴")
                {
                    summary.UnsignedCount++;
                }
                else if (status == "⚫" || string.IsNullOrEmpty(status) || status == "—")
                {
                    summary.UncheckedCount++;
                }
                else
                {
                    summary.UncheckedCount++;
                }
            }

            return summary;
        }

        public BikeyBulkCopyResult CopyMissingBikeysForEnabledMods(
            ArmaServerConfig config,
            IList<ScannedModRow> rows)
        {
            var modsNeedingCopy = new List<ModsEntity>();
            if (config == null || rows == null)
            {
                return new BikeyBulkCopyResult();
            }

            string serverDir = config.ServerDir;
            for (int i = 0; i < rows.Count; i++)
            {
                ScannedModRow row = rows[i];
                if (row == null || !row.IsAnyModSelected)
                {
                    continue;
                }

                ModBikeyInspectionResult inspection = bikeyService.InspectMod(
                    row.ModPath,
                    row.ModDirName,
                    serverDir);
                if (inspection.HasBisign && inspection.HasBikeyInMod && !inspection.AllCopiedToServer)
                {
                    modsNeedingCopy.Add(ToModsEntity(row));
                }
            }

            return bikeyService.CopyBikeysForAllMods(config, modsNeedingCopy, manualCopy: true);
        }

        private static ModsEntity ToModsEntity(ScannedModRow row)
        {
            return new ModsEntity
            {
                ModPath = row.ModPath,
                ModDirName = row.ModDirName,
                ModName = row.ModName,
                ModId = row.ModId,
                LocalMod = row.LocalMod,
                ServerMod = row.ServerMod,
                HeadlessClientMod = row.HeadlessClientMod,
                InputLocalMod = row.InputLocalMod,
            };
        }
    }
}
