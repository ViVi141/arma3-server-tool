using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class MonitoringHealthItem
    {
        public string Title { get; set; } = string.Empty;

        public string Detail { get; set; } = string.Empty;

        public bool IsOk { get; set; }
    }

    public sealed class MonitoringHealthChecker
    {
        private const string MonitoringHostExeName = "Arma3ServerTools.MonitoringHost.exe";
        private const string MonitoringFolderName = "monitoring";

        private readonly MonitoringDeploymentService deploymentService;
        private readonly IAppPaths paths;

        public MonitoringHealthChecker(MonitoringDeploymentService deploymentService, IAppPaths paths)
        {
            this.deploymentService = deploymentService;
            this.paths = paths;
        }

        public IReadOnlyList<MonitoringHealthItem> Check(ArmaServerConfig config)
        {
            var items = new List<MonitoringHealthItem>();

            string bundledDllPath = deploymentService.GetBundledDllPath();
            if (File.Exists(bundledDllPath))
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "监控扩展 DLL（发布包）",
                    Detail = bundledDllPath,
                    IsOk = true,
                });
            }
            else
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "监控扩展 DLL（发布包）",
                    Detail = "未找到 "
                        + ToolConstants.MonitoringBundledFolderName
                        + "\\"
                        + ToolConstants.MonitoringExtensionDllFileName,
                    IsOk = false,
                });
            }

            string bundledModPath = deploymentService.GetBundledModPath();
            if (Directory.Exists(bundledModPath))
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "监控模组（发布包）",
                    Detail = bundledModPath,
                    IsOk = true,
                });
            }
            else
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "监控模组（发布包）",
                    Detail = "未找到 mod\\" + ToolConstants.MonitoringServerModToken,
                    IsOk = false,
                });
            }

            string hostExe = Path.Combine(paths.ApplicationBase, MonitoringFolderName, MonitoringHostExeName);
            if (File.Exists(hostExe))
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "统计入库宿主",
                    Detail = hostExe,
                    IsOk = true,
                });
            }
            else
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "统计入库宿主",
                    Detail = "未找到 monitoring\\" + MonitoringHostExeName,
                    IsOk = false,
                });
            }

            if (config == null || !config.ServerTaskManagement.EnableMonitor)
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "服务器目录部署",
                    Detail = "当前未启用监控模组，跳过服务器目录检查。",
                    IsOk = true,
                });
                return items;
            }

            if (string.IsNullOrWhiteSpace(config.ServerDir) || !Directory.Exists(config.ServerDir))
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "服务器目录部署",
                    Detail = "未配置有效的服务器目录，无法检查已部署文件。",
                    IsOk = false,
                });
                return items;
            }

            string deployedDll = Path.Combine(config.ServerDir, ToolConstants.MonitoringExtensionDllFileName);
            if (File.Exists(deployedDll))
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "服务器目录 · 监控 DLL",
                    Detail = deployedDll,
                    IsOk = true,
                });
            }
            else
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "服务器目录 · 监控 DLL",
                    Detail = "尚未部署；请点击「应用到服务器目录」或启动服务器时自动部署。",
                    IsOk = false,
                });
            }

            string deployedMod = Path.Combine(config.ServerDir, ToolConstants.MonitoringServerModToken);
            if (Directory.Exists(deployedMod))
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "服务器目录 · 监控模组",
                    Detail = deployedMod,
                    IsOk = true,
                });
            }
            else
            {
                items.Add(new MonitoringHealthItem
                {
                    Title = "服务器目录 · 监控模组",
                    Detail = "尚未部署；请点击「应用到服务器目录」或启动服务器时自动部署。",
                    IsOk = false,
                });
            }

            return items;
        }
    }
}
