using System.IO;
using System.Threading;
using System.Threading.Tasks;
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
        private bool executablePathCached;
        private string cachedExecutablePath;

        public SteamCmdService(
            IAppPaths paths,
            ISteamCmdConfigProvider configProvider,
            ProcessManagement.IProcessRunner processRunner)
        {
            this.paths = paths;
            this.configProvider = configProvider;
            this.processRunner = processRunner;
        }

        public void InvalidateExecutableCache()
        {
            executablePathCached = false;
            cachedExecutablePath = null;
        }

        public OperationResult EnsureSteamCmdAvailable(bool downloadIfMissing)
        {
            return EnsureSteamCmdAvailableAsync(downloadIfMissing, CancellationToken.None)
                .GetAwaiter()
                .GetResult();
        }

        public async Task<OperationResult> EnsureSteamCmdAvailableAsync(
            bool downloadIfMissing,
            CancellationToken cancellationToken)
        {
            string executablePath = ResolveSteamCmdExecutable();
            if (!string.IsNullOrEmpty(executablePath))
            {
                return OperationResult.Ok();
            }

            if (downloadIfMissing)
            {
                OperationResult downloadResult = await SteamCmdBootstrapper
                    .DownloadBundledSteamCmdAsync(paths, cancellationToken)
                    .ConfigureAwait(false);
                if (!downloadResult.Success)
                {
                    return downloadResult;
                }

                InvalidateExecutableCache();
                executablePath = ResolveSteamCmdExecutable();
                if (!string.IsNullOrEmpty(executablePath))
                {
                    return downloadResult;
                }
            }

            return BuildMissingSteamCmdResult();
        }

        private OperationResult BuildMissingSteamCmdResult()
        {
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
            if (executablePathCached)
            {
                return cachedExecutablePath;
            }

            string bundledDirectory = SteamCmdBootstrapper.GetBundledDirectory(paths);
            string bundledPath = Path.Combine(bundledDirectory, "steamcmd.exe");
            if (IsUsableExecutablePath(bundledPath, bundledDirectory))
            {
                CacheExecutablePath(bundledPath);
                return bundledPath;
            }

            SteamcmdEntity settings = configProvider.GetSettings();
            if (settings != null && !string.IsNullOrEmpty(settings.d))
            {
                string workshopPath = Path.Combine(settings.d, "steamcmd.exe");
                if (IsUsableExecutablePath(workshopPath, settings.d))
                {
                    CacheExecutablePath(workshopPath);
                    return workshopPath;
                }
            }

            CacheExecutablePath(null);
            return null;
        }

        private bool IsUsableExecutablePath(string executablePath, string installDirectory)
        {
            if (!SafeFileExists(executablePath))
            {
                return false;
            }

            if (SteamCmdPathHelper.IsBlockedInstallDirectory(paths, installDirectory))
            {
                return false;
            }

            return SteamCmdBootstrapper.IsInstallationComplete(installDirectory);
        }

        private void CacheExecutablePath(string executablePath)
        {
            cachedExecutablePath = executablePath;
            executablePathCached = true;
        }

        private static bool SafeFileExists(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return false;
            }

            try
            {
                return File.Exists(path);
            }
            catch
            {
                return false;
            }
        }

        private OperationResult StartSteamCmd(string arguments)
        {
            string executablePath = ResolveSteamCmdExecutable();
            if (string.IsNullOrEmpty(executablePath))
            {
                return OperationResult.Fail("找不到 steamcmd.exe。");
            }

            string workingDirectory = Path.GetDirectoryName(executablePath);
            ProcessManagement.ProcessStartResult result = processRunner.Start(
                executablePath,
                arguments,
                workingDirectory);
            if (!result.Success)
            {
                return OperationResult.Fail(result.Message);
            }

            return OperationResult.Ok("SteamCMD 已启动，请在控制台窗口中完成 Steam Guard 验证。");
        }
    }
}
