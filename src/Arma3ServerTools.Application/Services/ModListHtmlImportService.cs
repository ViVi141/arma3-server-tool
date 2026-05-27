using System.Collections.Generic;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class ModListHtmlImportResult
    {
        public int ParsedCount { get; set; }

        public int AppliedCount { get; set; }

        public List<ulong> ModIds { get; set; } = new List<ulong>();

        public List<LauncherHtmlModEntry> MissingOnDisk { get; set; } = new List<LauncherHtmlModEntry>();
    }

    public sealed class ModListHtmlImportService
    {
        private readonly IServerConfigService configService;
        private readonly ModWorkshopWorkflowService workshopWorkflow;
        private readonly ModScannerService modScannerService;
        private readonly ISteamCmdConfigProvider steamCmdConfigProvider;

        public ModListHtmlImportService(
            IServerConfigService configService,
            ModWorkshopWorkflowService workshopWorkflow,
            ModScannerService modScannerService,
            ISteamCmdConfigProvider steamCmdConfigProvider)
        {
            this.configService = configService;
            this.workshopWorkflow = workshopWorkflow;
            this.modScannerService = modScannerService;
            this.steamCmdConfigProvider = steamCmdConfigProvider;
        }

        public (OperationResult Result, ModListHtmlImportResult Data) Import(
            string serverUuid,
            string html,
            string mode)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return (OperationResult.Fail("未找到服务器: " + serverUuid), null);
            }

            List<LauncherHtmlModEntry> entries = LauncherHtmlModParser.Parse(html);
            if (entries.Count == 0)
            {
                return (OperationResult.Fail("HTML 中未解析到 Workshop 模组 ID。"), null);
            }

            var modIds = new List<ulong>();
            for (int i = 0; i < entries.Count; i++)
            {
                modIds.Add(entries[i].ModId);
            }

            string normalizedMode = NormalizeMode(mode);
            var data = new ModListHtmlImportResult
            {
                ParsedCount = entries.Count,
                ModIds = modIds,
            };

            if (normalizedMode == "download" || normalizedMode == "download_and_enable")
            {
                OperationResult download = workshopWorkflow.DownloadMods(modIds, true);
                if (!download.Success)
                {
                    return (download, data);
                }
            }

            if (normalizedMode == "enable" || normalizedMode == "download_and_enable")
            {
                OperationResult enableResult = workshopWorkflow.EnableHtmlModsOnServer(config, entries);
                if (!enableResult.Success)
                {
                    return (enableResult, data);
                }

                data.AppliedCount = entries.Count;
                SteamcmdEntity steam = steamCmdConfigProvider.GetSettings();
                modScannerService.Scan(config, steam);
            }

            return (
                OperationResult.Ok(
                    "HTML 导入完成。解析 " + data.ParsedCount + " 个 ID，模式=" + normalizedMode + "。"),
                data);
        }

        private static string NormalizeMode(string mode)
        {
            if (string.IsNullOrWhiteSpace(mode))
            {
                return "download_and_enable";
            }

            string value = mode.Trim().ToLowerInvariant();
            if (value == "download" || value == "enable" || value == "download_and_enable")
            {
                return value;
            }

            return "download_and_enable";
        }
    }
}
