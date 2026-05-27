using System.Collections.Generic;
using System.IO;
using System.Text;
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

        private const int Arma3WorkshopAppId = 107410;

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
                + "+login " + QuoteSteamCmdArgument(settings.u) + " " + QuoteSteamCmdArgument(settings.p)
                + " +app_update " + Arma3DedicatedAppId + " -beta creatordlc validate";

            return StartSteamCmd(arguments);
        }

        public OperationResult DownloadWorkshopItems(IList<ulong> modIds)
        {
            OperationResult validation = EnsureSteamCmdAvailable(false);
            if (!validation.Success)
            {
                return validation;
            }

            SteamcmdEntity settings = configProvider.GetSettings();
            if (settings == null || string.IsNullOrEmpty(settings.u))
            {
                return OperationResult.Fail("SteamCMD 账号未配置。请在「工具 → SteamCMD 设置」中填写账号。");
            }

            if (modIds == null || modIds.Count == 0)
            {
                return OperationResult.Fail("没有要下载的 Workshop 模组 ID。");
            }

            string workshopRoot = SteamCmdPathHelper.NormalizeWorkshopRoot(paths, settings.d);
            if (string.IsNullOrWhiteSpace(workshopRoot))
            {
                return OperationResult.Fail("Workshop 根目录未配置。请在「工具 → SteamCMD 设置」中填写。");
            }

            EnsureWorkshopContentDirectory(workshopRoot);

            string arguments = BuildWorkshopDownloadArguments(settings, workshopRoot, modIds);
            OperationResult startResult = StartSteamCmd(arguments);
            if (!startResult.Success)
            {
                return startResult;
            }

            int downloadCount = CountDistinctModIds(modIds);
            return OperationResult.Ok(
                "SteamCMD 已启动，将下载 " + downloadCount + " 个 Workshop 模组。"
                + System.Environment.NewLine
                + "下载目录: "
                + Path.Combine(workshopRoot, ModEnablerService.WorkshopContentRelativePath)
                + System.Environment.NewLine
                + "请在控制台窗口中完成 Steam Guard 验证，待下载完成后关闭窗口并刷新模组列表。");
        }

        private static string BuildWorkshopDownloadArguments(
            SteamcmdEntity settings,
            string workshopRoot,
            IList<ulong> modIds)
        {
            var builder = new StringBuilder();
            builder.Append("+force_install_dir \"")
                .Append(workshopRoot)
                .Append("\" +login ")
                .Append(QuoteSteamCmdArgument(settings.u))
                .Append(' ')
                .Append(QuoteSteamCmdArgument(settings.p));

            var seen = new HashSet<ulong>();
            for (int i = 0; i < modIds.Count; i++)
            {
                ulong modId = modIds[i];
                if (modId == 0 || !seen.Add(modId))
                {
                    continue;
                }

                builder.Append(" +workshop_download_item ")
                    .Append(Arma3WorkshopAppId)
                    .Append(' ')
                    .Append(modId);
            }

            builder.Append(" +quit");
            return builder.ToString();
        }

        private static int CountDistinctModIds(IList<ulong> modIds)
        {
            var seen = new HashSet<ulong>();
            for (int i = 0; i < modIds.Count; i++)
            {
                ulong modId = modIds[i];
                if (modId != 0)
                {
                    seen.Add(modId);
                }
            }

            return seen.Count;
        }

        private static string QuoteSteamCmdArgument(string value)
        {
            if (value == null)
            {
                return "\"\"";
            }

            string escaped = value.Replace("\\", "\\\\").Replace("\"", "\\\"");
            return "\"" + escaped + "\"";
        }

        private static void EnsureWorkshopContentDirectory(string workshopRoot)
        {
            try
            {
                Directory.CreateDirectory(
                    Path.Combine(workshopRoot, ModEnablerService.WorkshopContentRelativePath));
            }
            catch
            {
                // Best effort.
            }
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
