using System;
using System.IO;

namespace Arma3ServerTools.TestSupport
{
    public static class AutomatedTestWorkspace
    {
        public static string CreateRoot(string prefix)
        {
            string path = Path.Combine(Path.GetTempPath(), prefix + "-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            Directory.CreateDirectory(Path.Combine(path, "config"));
            return path;
        }

        public static void DeleteRoot(string path)
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }

        public static string FindSqlSchemaPath()
        {
            string[] candidates = new[]
            {
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "sql", "destiny_statistics.sql")),
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "sql", "destiny_statistics.sql")),
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                if (File.Exists(candidates[i]))
                {
                    return candidates[i];
                }
            }

            return candidates[0];
        }

        public static void CopySqlSchema(string root)
        {
            string sqlSource = FindSqlSchemaPath();
            if (!File.Exists(sqlSource))
            {
                return;
            }

            string sqlDestDir = Path.Combine(root, "sql");
            Directory.CreateDirectory(sqlDestDir);
            File.Copy(sqlSource, Path.Combine(sqlDestDir, "destiny_statistics.sql"), true);
        }

        public static void CreateFakeDedicatedServer(string serverDir)
        {
            Directory.CreateDirectory(serverDir);
            File.WriteAllText(Path.Combine(serverDir, "arma3server_x64.exe"), string.Empty);
        }

        public static void CreateBundledSteamCmd(string root)
        {
            string extensionDir = Path.Combine(root, "extension");
            Directory.CreateDirectory(extensionDir);
            File.WriteAllText(Path.Combine(extensionDir, "steamcmd.exe"), string.Empty);
        }

        public static void CopyPlayersSchema(string root)
        {
            string source = Path.Combine(Path.GetDirectoryName(FindSqlSchemaPath()), "destiny_players.sql");
            string destDir = Path.Combine(root, "sql");
            Directory.CreateDirectory(destDir);
            File.Copy(source, Path.Combine(destDir, "destiny_players.sql"), true);
        }

        public static void CreateSampleMod(string modPath, string name, long publishedId)
        {
            Directory.CreateDirectory(Path.Combine(modPath, "addons"));
            string meta = "name = \"" + name + "\";" + Environment.NewLine
                + "publishedid = " + publishedId + ";" + Environment.NewLine
                + "timestamp = " + DateTime.Now.ToBinary() + ";";
            File.WriteAllText(Path.Combine(modPath, "meta.cpp"), meta);
        }
    }
}
