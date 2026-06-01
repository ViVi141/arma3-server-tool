using System.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Config
{
    public static class GameConfigPaths
    {
        public static string GetServerConfigRoot(ArmaServerConfig config)
        {
            if (config == null || string.IsNullOrEmpty(config.ServerDir) || string.IsNullOrEmpty(config.ServerUUID))
            {
                return string.Empty;
            }

            return Path.Combine(config.ServerDir, ToolConstants.ServerConfigFolderName, config.ServerUUID);
        }

        public static string GetServerCfgPath(ArmaServerConfig config)
        {
            string root = GetServerConfigRoot(config);
            if (string.IsNullOrEmpty(root))
            {
                return string.Empty;
            }

            return Path.Combine(root, "server.cfg");
        }

        public static bool ServerCfgExists(ArmaServerConfig config)
        {
            string path = GetServerCfgPath(config);
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            return File.Exists(path);
        }
    }
}
