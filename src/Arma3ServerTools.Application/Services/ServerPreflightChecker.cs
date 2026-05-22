using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;

namespace Arma3ServerTools.Application.Services
{
    public sealed class PreflightCheckItem
    {
        public string Title { get; set; } = string.Empty;

        public string Detail { get; set; } = string.Empty;

        public bool IsError { get; set; }

        public bool IsWarning { get; set; }
    }

    public sealed class ServerPreflightChecker
    {
        private readonly MonitoringDeploymentService monitoringDeploymentService;

        public ServerPreflightChecker(MonitoringDeploymentService monitoringDeploymentService)
        {
            this.monitoringDeploymentService = monitoringDeploymentService;
        }

        public IReadOnlyList<PreflightCheckItem> Check(ArmaServerConfig config, ServerRunState runState)
        {
            var items = new List<PreflightCheckItem>();
            if (config == null)
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "服务器配置",
                    Detail = "未选择有效配置。",
                    IsError = true,
                });
                return items;
            }

            CheckServerDirectory(config, items);
            CheckExecutable(config, items);
            CheckConfigFiles(config, items);
            CheckPort(config, runState, items);
            CheckBasicSettings(config, items);
            CheckBattlEye(config, items);
            CheckMonitoringAssets(config, items);
            return items;
        }

        public bool HasBlockingErrors(IReadOnlyList<PreflightCheckItem> items)
        {
            foreach (PreflightCheckItem item in items)
            {
                if (item.IsError)
                {
                    return true;
                }
            }

            return false;
        }

        public bool HasBlockingWarnings(IReadOnlyList<PreflightCheckItem> items)
        {
            foreach (PreflightCheckItem item in items)
            {
                if (item.IsWarning)
                {
                    return true;
                }
            }

            return false;
        }

        private static void CheckServerDirectory(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (string.IsNullOrWhiteSpace(config.ServerDir))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "服务器目录",
                    Detail = "未配置服务器安装目录。",
                    IsError = true,
                });
                return;
            }

            if (PathValidation.ContainsChinese(config.ServerDir))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "服务器目录",
                    Detail = "路径包含中文，Arma 3 专用服务器可能无法正常运行。",
                    IsError = true,
                });
            }

            if (!Directory.Exists(config.ServerDir))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "服务器目录",
                    Detail = "目录不存在: " + config.ServerDir,
                    IsError = true,
                });
                return;
            }

            items.Add(new PreflightCheckItem
            {
                Title = "服务器目录",
                Detail = "目录存在。",
                IsError = false,
            });
        }

        private static void CheckExecutable(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (string.IsNullOrWhiteSpace(config.ServerDir))
            {
                return;
            }

            string fileName;
            if (config.x64)
            {
                fileName = "arma3server_x64.exe";
            }
            else
            {
                fileName = "arma3server.exe";
            }

            string executablePath = Path.Combine(config.ServerDir, fileName);
            if (File.Exists(executablePath))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "服务器程序",
                    Detail = fileName + " 已找到。",
                    IsError = false,
                });
            }
            else
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "服务器程序",
                    Detail = "找不到: " + executablePath + "，请先安装专用服务器。",
                    IsError = true,
                });
            }
        }

        private static void CheckConfigFiles(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (string.IsNullOrWhiteSpace(config.ServerDir) || string.IsNullOrEmpty(config.ServerUUID))
            {
                return;
            }

            string serverCfg = Path.Combine(
                config.ServerDir,
                ToolConstants.ServerConfigFolderName,
                config.ServerUUID,
                "server.cfg");
            if (File.Exists(serverCfg))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "server.cfg",
                    Detail = "配置文件已存在。",
                    IsError = false,
                });
            }
            else
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "server.cfg",
                    Detail = "尚未写入 cfg；启动时会自动写入。",
                    IsError = false,
                });
            }
        }

        private static void CheckPort(ArmaServerConfig config, ServerRunState runState, List<PreflightCheckItem> items)
        {
            int port = config.StartupParameters.Port;
            if (port <= 0 || port > 65535)
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "游戏端口",
                    Detail = "端口无效: " + port,
                    IsError = true,
                });
                return;
            }

            if (runState == ServerRunState.Running)
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "游戏端口",
                    Detail = "服务器已在运行 (UDP " + port + ")。",
                    IsError = false,
                });
                return;
            }

            if (GameConfigWriter.IsPortInUse(port))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "游戏端口",
                    Detail = "UDP " + port + " 已被占用，可能与其他程序冲突。",
                    IsError = true,
                });
            }
            else
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "游戏端口",
                    Detail = "UDP " + port + " 当前可用。",
                    IsError = false,
                });
            }
        }

        private static void CheckBasicSettings(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (string.IsNullOrWhiteSpace(config.ServerConfig.HostName))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "主机名",
                    Detail = "未设置服务器主机名。",
                    IsError = false,
                });
            }
            else
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "主机名",
                    Detail = config.ServerConfig.HostName,
                    IsError = false,
                });
            }
        }

        private static void CheckBattlEye(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (!config.ServerConfig.BattlEye)
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "BattlEye",
                    Detail = "未启用 BattlEye 反作弊。",
                    IsError = false,
                });
                return;
            }

            if (string.IsNullOrWhiteSpace(config.BattlEyeConfig.RConPassword))
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "RCon 密码",
                    Detail = "BattlEye 已启用但未设置 RCon 密码；远程控制与部分管理功能将不可用。",
                    IsError = false,
                    IsWarning = true,
                });
            }
            else
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "RCon",
                    Detail = "端口 " + config.BattlEyeConfig.RConPort + "，密码已配置。",
                    IsError = false,
                });
            }
        }

        private void CheckMonitoringAssets(ArmaServerConfig config, List<PreflightCheckItem> items)
        {
            if (config == null || !config.ServerTaskManagement.EnableMonitor)
            {
                return;
            }

            if (monitoringDeploymentService.HasBundledAssets())
            {
                items.Add(new PreflightCheckItem
                {
                    Title = "监控组件",
                    Detail = "启动/写入配置时将自动部署 "
                        + ToolConstants.MonitoringExtensionDllFileName
                        + " 与 "
                        + ToolConstants.MonitoringServerModToken
                        + "。",
                    IsError = false,
                });
                return;
            }

            items.Add(new PreflightCheckItem
            {
                Title = "监控组件",
                Detail = "已启用监控模组，但主程序目录缺少 monitoring-server\\"
                    + ToolConstants.MonitoringExtensionDllFileName
                    + " 或 mod\\"
                    + ToolConstants.MonitoringServerModToken
                    + "。",
                IsError = true,
            });
        }
    }
}
