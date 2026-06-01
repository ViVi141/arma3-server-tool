using System.Collections.Generic;
using System.IO;
using System.Linq;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Arma3ServerTools.Core.Validation;

namespace Arma3ServerTools.Application.Services
{
    /// <summary>
    /// Broader pre-launch diagnostics: preflight checks plus SteamCMD, mods, keys, and command line.
    /// </summary>
    public sealed class ServerDiagnosticsService
    {
        private const int WindowsCommandLineLimit = 8191;

        private readonly ServerPreflightChecker preflightChecker;
        private readonly IGameConfigWriter configWriter;
        private readonly ModuleScanPathRepository scanPathRepository;
        private readonly BikeyService bikeyService;
        private readonly ISteamCmdConfigProvider steamCmdConfigProvider;
        private readonly IServerProcessService processService;

        public ServerDiagnosticsService(
            ServerPreflightChecker preflightChecker,
            IGameConfigWriter configWriter,
            ModuleScanPathRepository scanPathRepository,
            BikeyService bikeyService,
            ISteamCmdConfigProvider steamCmdConfigProvider,
            IServerProcessService processService)
        {
            this.preflightChecker = preflightChecker;
            this.configWriter = configWriter;
            this.scanPathRepository = scanPathRepository;
            this.bikeyService = bikeyService;
            this.steamCmdConfigProvider = steamCmdConfigProvider;
            this.processService = processService;
        }

        public IReadOnlyList<PreflightCheckItem> RunFullDiagnostics(ArmaServerConfig config)
        {
            ServerRunState runState = ServerRunState.Stopped;
            if (config != null)
            {
                runState = processService.GetState(config);
            }

            var items = new List<PreflightCheckItem>(preflightChecker.Check(config, runState));
            if (config == null)
            {
                return items;
            }

            CheckSteamCmd(items);
            CheckModScanPaths(items);
            CheckEnabledModBikeys(config, items);
            CheckStartCommandLine(config, items);
            CheckKeysDirectory(config, items);
            return items;
        }

        private void CheckSteamCmd(List<PreflightCheckItem> items)
        {
            SteamcmdEntity settings = steamCmdConfigProvider.GetSettings();
            if (settings == null || string.IsNullOrWhiteSpace(settings.d))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "SteamCMD",
                    Detail = "未配置 SteamCMD 目录；模组下载与专用服务器安装将不可用。",
                    IsWarning = true,
                });
                return;
            }

            if (PathValidation.ContainsChinese(settings.d))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "SteamCMD 路径",
                    Detail = "路径包含中文: " + settings.d,
                    IsWarning = true,
                });
                return;
            }

            string steamCmdExe = Path.Combine(settings.d, "steamcmd.exe");
            if (File.Exists(steamCmdExe))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "SteamCMD",
                    Detail = "已安装: " + settings.d,
                    IsError = false,
                });
            }
            else
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "SteamCMD",
                    Detail = "目录已配置但未找到 steamcmd.exe，请在「SteamCMD」页下载。",
                    IsWarning = true,
                });
            }
        }

        private void CheckModScanPaths(List<PreflightCheckItem> items)
        {
            IList<ModuleScanPathEntity> paths = scanPathRepository.Load();
            int existingCount = 0;
            int missingCount = 0;
            for (int i = 0; i < paths.Count; i++)
            {
                ModuleScanPathEntity path = paths[i];
                if (path == null || string.IsNullOrWhiteSpace(path.ModulePath))
                {
                    continue;
                }

                if (Directory.Exists(path.ModulePath))
                {
                    existingCount++;
                }
                else
                {
                    missingCount++;
                }
            }

            if (paths.Count == 0)
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "模组扫描路径",
                    Detail = "未配置任何扫描路径；请在「模组」页添加 Workshop 或本地模组目录。",
                    IsWarning = true,
                });
                return;
            }

            string detail = "共 " + paths.Count + " 条路径，有效 " + existingCount + " 条";
            if (missingCount > 0)
            {
                detail = detail + "，缺失 " + missingCount + " 条";
            }

            items.Add(new PreflightCheckItem
            {
                Title = "模组扫描路径",
                Detail = detail,
                IsError = false,
                IsWarning = missingCount > 0,
            });
        }

        private void CheckEnabledModBikeys(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (config.StartupParameters == null || config.StartupParameters.modsEntities == null)
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "已启用模组",
                    Detail = "未配置任何模组。",
                    IsError = false,
                });
                return;
            }

            int enabledCount = 0;
            int readyCount = 0;
            int needsCopyCount = 0;
            int unsignedCount = 0;
            string serverDir = config.ServerDir;
            foreach (ModsEntity mod in config.StartupParameters.modsEntities)
            {
                if (mod == null || (!mod.LocalMod && !mod.ServerMod && !mod.HeadlessClientMod))
                {
                    continue;
                }

                enabledCount++;
                if (string.IsNullOrEmpty(mod.ModPath) || !Directory.Exists(mod.ModPath))
                {
                    needsCopyCount++;
                    continue;
                }

                ModBikeyInspectionResult inspection = bikeyService.InspectMod(
                    mod.ModPath,
                    mod.ModDirName,
                    serverDir);
                if (!inspection.HasBisign)
                {
                    unsignedCount++;
                }
                else if (inspection.AllCopiedToServer)
                {
                    readyCount++;
                }
                else if (inspection.HasBikeyInMod)
                {
                    needsCopyCount++;
                }
                else
                {
                    needsCopyCount++;
                }
            }

            if (enabledCount == 0)
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "已启用模组",
                    Detail = "无已勾选的客户端/服务器/无头客户端模组。",
                    IsError = false,
                });
                return;
            }

            string detail = enabledCount + " 个已启用 · 🟢 " + readyCount + " · 🟡 " + needsCopyCount + " · 🔴 " + unsignedCount;
            bool hasWarning = needsCopyCount > 0;
            items.Add(new PreflightCheckItem
            {
                Title = "模组 Bikey 就绪",
                Detail = detail + "（可在「模组」页使用「复制缺失 Bikey」）",
                IsError = false,
                IsWarning = hasWarning,
            });
        }

        private void CheckStartCommandLine(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (string.IsNullOrWhiteSpace(config.ServerDir))
            {
                return;
            }

            try
            {
                string commandLine = configWriter.BuildStartCommandLine(config);
                int length = commandLine != null ? commandLine.Length : 0;
                int warnThreshold = (int)(WindowsCommandLineLimit * 0.85);
                if (length > WindowsCommandLineLimit)
                {
                    items.Add(new PreflightCheckItem
                    {
                        Title = "启动命令行长度",
                        Detail = length + " 字符，超过 Windows 限制 " + WindowsCommandLineLimit + "。请减少模组或缩短路径。",
                        IsError = true,
                    });
                }
                else if (length > warnThreshold)
                {
                    items.Add(new PreflightCheckItem
                    {
                        Title = "启动命令行长度",
                        Detail = length + " / " + WindowsCommandLineLimit + " 字符（接近上限，建议精简模组）。",
                        IsWarning = true,
                    });
                }
                else
                {
                    items.Add(new PreflightCheckItem
                    {
                        Title = "启动命令行长度",
                        Detail = length + " / " + WindowsCommandLineLimit + " 字符。",
                        IsError = false,
                    });
                }
            }
            catch (ConfigException ex)
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "启动命令行",
                    Detail = ex.Message,
                    IsError = true,
                });
            }
        }

        private static void CheckKeysDirectory(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (string.IsNullOrWhiteSpace(config.ServerDir))
            {
                return;
            }

            string keysDir = BikeyService.GetServerKeysDirectory(config.ServerDir);
            if (!Directory.Exists(keysDir))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "Keys 目录",
                    Detail = "不存在，写入配置或复制 Bikey 时将自动创建。",
                    IsError = false,
                });
                return;
            }

            int keyCount = Directory.GetFiles(keysDir, "*.bikey", SearchOption.TopDirectoryOnly).Length;
            items.Add(new PreflightCheckItem
            {
                Title = "Keys 目录",
                Detail = keysDir + "（" + keyCount + " 个 .bikey 文件）",
                IsError = false,
            });
        }
    }
}
