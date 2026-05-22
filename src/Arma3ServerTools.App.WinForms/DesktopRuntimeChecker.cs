using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms
{
    internal static class DesktopRuntimeChecker
    {
        private const string DesktopRuntimeDownloadUrl =
            "https://dotnet.microsoft.com/download/dotnet/10.0";

        public static bool TryEnsureDesktopRuntime(IWin32Window owner)
        {
            if (IsSelfContainedDeployment())
            {
                return true;
            }

            if (IsDesktopRuntimeInstalled())
            {
                return true;
            }

            string message = "未检测到 .NET 10 Desktop Runtime，无法运行 "
                + UiLabels.AppTitle
                + "。"
                + Environment.NewLine
                + Environment.NewLine
                + "请安装「.NET Desktop Runtime 10.x（x64）」后重新启动。"
                + Environment.NewLine
                + "下载：" + DesktopRuntimeDownloadUrl;

            AntdUI.Modal.open("缺少 .NET 运行时", message, AntdUI.TType.Error);

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = DesktopRuntimeDownloadUrl,
                    UseShellExecute = true,
                });
            }
            catch
            {
            }

            return false;
        }

        private static bool IsSelfContainedDeployment()
        {
            string configPath = Path.Combine(AppContext.BaseDirectory, "Arma3ServerTools.runtimeconfig.json");
            if (!File.Exists(configPath))
            {
                return false;
            }

            string text = File.ReadAllText(configPath);
            return text.IndexOf("includedFrameworks", StringComparison.Ordinal) >= 0;
        }

        private static bool IsDesktopRuntimeInstalled()
        {
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string sharedRoot = Path.Combine(programFiles, "dotnet", "shared", "Microsoft.WindowsDesktop.App");
            if (!Directory.Exists(sharedRoot))
            {
                return TryParseDotNetListRuntimes();
            }

            string[] versionDirs = Directory.GetDirectories(sharedRoot);
            for (int i = 0; i < versionDirs.Length; i++)
            {
                string folderName = Path.GetFileName(versionDirs[i]);
                if (folderName != null && folderName.StartsWith("10.", StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return TryParseDotNetListRuntimes();
        }

        private static bool TryParseDotNetListRuntimes()
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "dotnet",
                    Arguments = "--list-runtimes",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                using (Process process = Process.Start(startInfo))
                {
                    if (process == null)
                    {
                        return false;
                    }

                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit(5000);
                    if (string.IsNullOrEmpty(output))
                    {
                        return false;
                    }

                    string[] lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    for (int i = 0; i < lines.Length; i++)
                    {
                        string line = lines[i];
                        if (line.IndexOf("Microsoft.WindowsDesktop.App", StringComparison.OrdinalIgnoreCase) >= 0
                            && line.IndexOf(" 10.", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            return true;
                        }
                    }
                }
            }
            catch
            {
            }

            return false;
        }
    }
}
