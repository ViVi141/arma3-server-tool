using System.Collections.Generic;
using System.IO;
using System.Text;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdService : ISteamCmdService
    {
        private const int Arma3DedicatedAppId = 233780;
        private const int Arma3WorkshopAppId = 107410;

        private readonly IAppPaths paths;
        private readonly ISteamCmdConfigProvider configProvider;
        private readonly ProcessManagement.IProcessRunner processRunner;
        private readonly SteamCmdToolsDownloadService toolsDownloadService;

        public SteamCmdService(
            IAppPaths paths,
            ISteamCmdConfigProvider configProvider,
            ProcessManagement.IProcessRunner processRunner)
        {
            this.paths = paths;
            this.configProvider = configProvider;
            this.processRunner = processRunner;
            toolsDownloadService = new SteamCmdToolsDownloadService(paths);
        }

        public OperationResult EnsureSteamCmdAvailable(bool downloadIfMissing)
        {
            string executablePath = ResolveSteamCmdExecutable();
            if (!string.IsNullOrEmpty(executablePath))
            {
                return OperationResult.Ok();
            }

            if (downloadIfMissing)
            {
                OperationResult downloadResult = SteamCmdBootstrapper.DownloadBundledSteamCmd(paths);
                if (!downloadResult.Success)
                {
                    return downloadResult;
                }

                executablePath = ResolveSteamCmdExecutable();
                if (!string.IsNullOrEmpty(executablePath))
                {
                    return downloadResult;
                }
            }

            string bundledPath = SteamCmdBootstrapper.GetBundledExecutablePath(paths);
            return OperationResult.Fail(
                "找不到 steamcmd.exe。" + System.Environment.NewLine
                + "应放置于: " + bundledPath + System.Environment.NewLine
                + "或在 SteamCMD 设置的 Workshop 根目录中安装 steamcmd.exe。");
        }

        public OperationResult InstallDedicatedServer(string installDir)
        {
            OperationResult validation = EnsureSteamCmdAvailable(false);
            if (!validation.Success)
            {
                return validation;
            }

            SteamcmdEntity settings = configProvider.GetSettings();
            if (settings == null || string.IsNullOrEmpty(settings.u))
            {
                return OperationResult.Fail("SteamCMD 账号未配置。");
            }

            string arguments = "+force_install_dir \"" + installDir + "\" "
                + "+login " + settings.u + " " + settings.p
                + " +app_update " + Arma3DedicatedAppId + " -beta creatordlc validate";

            return StartSteamCmd(arguments);
        }

        public OperationResult UpdateWorkshopMods(IEnumerable<ulong> modIds)
        {
            OperationResult validation = EnsureSteamCmdAvailable(false);
            if (!validation.Success)
            {
                return validation;
            }

            SteamcmdEntity settings = configProvider.GetSettings();
            if (settings == null || string.IsNullOrEmpty(settings.u))
            {
                return OperationResult.Fail("SteamCMD 账号未配置。");
            }

            if (string.IsNullOrEmpty(settings.d))
            {
                return OperationResult.Fail("SteamCMD Workshop 根目录未配置。");
            }

            EnsureSteamCmdCopiedToWorkshopRoot(settings);

            var builder = new StringBuilder();
            builder.Append("+login ").Append(settings.u).Append(" ").Append(settings.p);
            foreach (ulong modId in modIds)
            {
                builder.Append(" +workshop_download_item ")
                    .Append(Arma3WorkshopAppId)
                    .Append(" ")
                    .Append(modId)
                    .Append(" ");
            }

            return StartSteamCmd(builder.ToString(), preferWorkshopRoot: true);
        }

        public OperationResult UpdateWorkshopModsViaTools(IEnumerable<ulong> modIds)
        {
            SteamcmdEntity settings = configProvider.GetSettings();
            if (settings == null)
            {
                return OperationResult.Fail("SteamCMD 未配置。");
            }

            return toolsDownloadService.DownloadMods(settings.d, settings.u, settings.p, modIds);
        }

        public bool IsSteamCmdToolsAvailable()
        {
            return toolsDownloadService.IsToolsAvailable();
        }

        private string ResolveSteamCmdExecutable()
        {
            string bundledPath = SteamCmdBootstrapper.GetBundledExecutablePath(paths);
            if (File.Exists(bundledPath))
            {
                return bundledPath;
            }

            SteamcmdEntity settings = configProvider.GetSettings();
            if (settings != null && !string.IsNullOrEmpty(settings.d))
            {
                string workshopPath = Path.Combine(settings.d, "steamcmd.exe");
                if (File.Exists(workshopPath))
                {
                    return workshopPath;
                }
            }

            return null;
        }

        private void EnsureSteamCmdCopiedToWorkshopRoot(SteamcmdEntity settings)
        {
            string bundledPath = SteamCmdBootstrapper.GetBundledExecutablePath(paths);
            if (!File.Exists(bundledPath))
            {
                return;
            }

            string targetPath = Path.Combine(settings.d, "steamcmd.exe");
            if (File.Exists(targetPath))
            {
                return;
            }

            try
            {
                Directory.CreateDirectory(settings.d);
                File.Copy(bundledPath, targetPath, true);
            }
            catch
            {
                // 复制失败时仍尝试使用 bundled 路径。
            }
        }

        private OperationResult StartSteamCmd(string arguments)
        {
            return StartSteamCmd(arguments, preferWorkshopRoot: false);
        }

        private OperationResult StartSteamCmd(string arguments, bool preferWorkshopRoot)
        {
            string executablePath = ResolveSteamCmdExecutable();
            if (preferWorkshopRoot)
            {
                SteamcmdEntity settings = configProvider.GetSettings();
                if (settings != null && !string.IsNullOrEmpty(settings.d))
                {
                    string workshopPath = Path.Combine(settings.d, "steamcmd.exe");
                    if (File.Exists(workshopPath))
                    {
                        executablePath = workshopPath;
                    }
                }
            }

            if (string.IsNullOrEmpty(executablePath))
            {
                return OperationResult.Fail("找不到 steamcmd.exe。");
            }

            ProcessManagement.ProcessStartResult result = processRunner.Start(executablePath, arguments);
            if (!result.Success)
            {
                return OperationResult.Fail(result.Message);
            }

            return OperationResult.Ok("SteamCMD 已启动，请在控制台窗口中完成 Steam Guard 验证。");
        }
    }
}
