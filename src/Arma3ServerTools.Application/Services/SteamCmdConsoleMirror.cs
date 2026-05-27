using System;

namespace Arma3ServerTools.Application.Services
{
    /// <summary>
    /// When enabled and stdout is an interactive console, mirrors captured SteamCMD lines to Console.Out
    /// (e.g. Agent started in PowerShell on the game server machine).
    /// </summary>
    public static class SteamCmdConsoleMirror
    {
        public static bool Enabled { get; set; } = true;

        public static void WriteStartBanner()
        {
            WriteLine("--- SteamCMD 开始（捕获模式，输出同步到本控制台）---");
        }

        public static void WriteEndBanner(string message)
        {
            if (string.IsNullOrWhiteSpace(message))
            {
                WriteLine("--- SteamCMD 结束 ---");
            }
            else
            {
                WriteLine("--- SteamCMD 结束: " + message + " ---");
            }
        }

        public static void WriteLine(string line)
        {
            if (!ShouldMirror() || string.IsNullOrEmpty(line))
            {
                return;
            }

            try
            {
                Console.Out.WriteLine("[SteamCMD] " + line);
            }
            catch (Exception)
            {
            }
        }

        public static bool ShouldMirror()
        {
            if (!Enabled)
            {
                return false;
            }

            try
            {
                return !Console.IsOutputRedirected;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }
}
