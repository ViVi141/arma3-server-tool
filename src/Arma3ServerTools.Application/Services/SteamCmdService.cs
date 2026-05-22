using System.IO;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdService : ISteamCmdService
    {
        private const int Arma3DedicatedAppId = 233780;

        private readonly IAppPaths paths;
        private readonly ISteamCmdConfigProvider configProvider;
        private readonly ProcessManagement.IProcessRunner processRunner;

        public SteamCmdService(
            IAppPaths paths,
            ISteamCmdConfigProvider configProvider,
            ProcessManagement.IProcessRunner processRunner)
        {
            this.paths = paths;
            this.configProvider = configProvider;
            this.processRunner = processRunner;
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

        private OperationResult StartSteamCmd(string arguments)
        {
            string executablePath = ResolveSteamCmdExecutable();
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
