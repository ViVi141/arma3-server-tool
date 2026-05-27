using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms
{
    internal static class FirstServerGuideOpener
    {
        public static string ResolveGuideFilePath()
        {
            string baseDir = AppContext.BaseDirectory;
            string[] candidates = new string[]
            {
                Path.Combine(baseDir, "docs", "first-server-guide.txt"),
                Path.Combine(baseDir, "docs", "first-server-guide.md"),
                Path.Combine(baseDir, "first-server-guide.txt"),
                Path.Combine(baseDir, "first-server-guide.md"),
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                if (File.Exists(candidates[i]))
                {
                    return candidates[i];
                }
            }

            return string.Empty;
        }

        public static void OpenGuide(IWin32Window owner)
        {
            string path = ResolveGuideFilePath();
            if (!string.IsNullOrEmpty(path))
            {
                if (!TryOpenWithNotepad(path))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = path,
                        UseShellExecute = true,
                    });
                }

                return;
            }

            string url = "https://github.com/ViVi141/arma3-server-tool/blob/main/docs/first-server-guide.md";
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true,
                });
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(
                    owner,
                    "未找到本地开服指南，且无法打开浏览器。" + Environment.NewLine + ex.Message
                        + Environment.NewLine + url,
                    "开服指南");
            }
        }

        private static bool TryOpenWithNotepad(string filePath)
        {
            string notepadPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Windows),
                "notepad.exe");
            if (!File.Exists(notepadPath))
            {
                return false;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = notepadPath,
                Arguments = "\"" + filePath + "\"",
                UseShellExecute = false,
            });
            return true;
        }
    }
}
