using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class BikeyService
    {
        public OperationResult CopyBikeysForMod(ArmaServerConfig config, ModsEntity mod)
        {
            if (config == null || mod == null || !config.AutoCopyBikey)
            {
                return OperationResult.Ok();
            }

            if (!Directory.Exists(mod.ModPath))
            {
                return OperationResult.Fail("模组目录不存在: " + mod.ModPath);
            }

            List<FileInfo> bikeys = FindBikeys(mod.ModPath);
            string keysDirectory = Path.Combine(config.ServerDir, "Keys");
            Directory.CreateDirectory(keysDirectory);
            foreach (FileInfo bikey in bikeys)
            {
                string safeDirName = mod.ModDirName.Replace(" ", "_").Replace("@", string.Empty);
                string safeName = bikey.Name.Replace(" ", "_").Replace("bikey", string.Empty).Replace(".", string.Empty);
                string targetPath = Path.Combine(keysDirectory, safeDirName + "-" + safeName + bikey.Extension);
                try
                {
                    if (mod.LocalMod)
                    {
                        File.Copy(bikey.FullName, targetPath, true);
                    }
                    else if (File.Exists(targetPath))
                    {
                        File.Delete(targetPath);
                    }
                }
                catch
                {
                    // Best effort per key file.
                }
            }

            return OperationResult.Ok();
        }

        public List<string> ListServerBikeys(string serverDir)
        {
            var result = new List<string>();
            string keysDirectory = Path.Combine(serverDir, "Keys");
            if (!Directory.Exists(keysDirectory))
            {
                return result;
            }

            foreach (FileInfo file in new DirectoryInfo(keysDirectory).GetFiles("*.bikey"))
            {
                result.Add(file.FullName);
            }

            return result;
        }

        private static List<FileInfo> FindBikeys(string root)
        {
            var result = new List<FileInfo>();
            CollectBikeys(new DirectoryInfo(root), result);
            return result;
        }

        private static void CollectBikeys(DirectoryInfo directory, List<FileInfo> result)
        {
            if (directory == null || !directory.Exists)
            {
                return;
            }

            foreach (FileInfo file in directory.GetFiles("*.bikey"))
            {
                result.Add(file);
            }

            foreach (DirectoryInfo child in directory.GetDirectories())
            {
                CollectBikeys(child, result);
            }
        }
    }
}
