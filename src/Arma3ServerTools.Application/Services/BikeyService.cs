using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class ModBikeyInspectionResult
    {
        public bool HasBisign { get; set; }

        public bool HasBikeyInMod { get; set; }

        public bool AllCopiedToServer { get; set; }

        public string StatusText { get; set; } = "未签名";
    }

    public sealed class BikeyBulkCopyResult
    {
        public int ModsWithKeys { get; set; }

        public int KeyFileCount { get; set; }

        public int SkippedModCount { get; set; }

        public int FailedModCount { get; set; }

        public List<string> Errors { get; } = new List<string>();
    }

    public sealed class BikeyService
    {
        public OperationResult CopyBikeysForMod(ArmaServerConfig config, ModsEntity mod)
        {
            return CopyBikeysForMod(config, mod, manualCopy: false);
        }

        public OperationResult CopyBikeysForMod(ArmaServerConfig config, ModsEntity mod, bool manualCopy)
        {
            if (config == null || mod == null || (!config.AutoCopyBikey && !manualCopy))
            {
                return OperationResult.Ok();
            }

            if (!Directory.Exists(mod.ModPath))
            {
                return OperationResult.Fail("模组目录不存在: " + mod.ModPath);
            }

            List<FileInfo> bikeys = FindModBikeys(mod.ModPath);
            string keysDirectory = GetServerKeysDirectory(config.ServerDir);
            Directory.CreateDirectory(keysDirectory);
            foreach (FileInfo bikey in bikeys)
            {
                string targetPath = GetCopiedBikeyPath(keysDirectory, mod.ModDirName, bikey);
                try
                {
                    File.Copy(bikey.FullName, targetPath, true);
                }
                catch
                {
                    // Best effort per key file.
                }
            }

            return OperationResult.Ok();
        }

        public BikeyBulkCopyResult CopyBikeysForAllMods(ArmaServerConfig config, IList<ModsEntity> mods)
        {
            return CopyBikeysForAllMods(config, mods, manualCopy: true);
        }

        public BikeyBulkCopyResult CopyBikeysForAllMods(
            ArmaServerConfig config,
            IList<ModsEntity> mods,
            bool manualCopy)
        {
            var result = new BikeyBulkCopyResult();
            if (config == null || mods == null || mods.Count == 0)
            {
                return result;
            }

            for (int i = 0; i < mods.Count; i++)
            {
                ModsEntity mod = mods[i];
                if (mod == null || string.IsNullOrEmpty(mod.ModPath))
                {
                    continue;
                }

                List<FileInfo> bikeys = FindModBikeys(mod.ModPath);
                if (bikeys.Count == 0)
                {
                    result.SkippedModCount++;
                    continue;
                }

                OperationResult copyResult = CopyBikeysForMod(config, mod, manualCopy);
                if (!copyResult.Success)
                {
                    result.FailedModCount++;
                    result.Errors.Add(mod.ModDirName + ": " + copyResult.Message);
                    continue;
                }

                result.ModsWithKeys++;
                result.KeyFileCount += bikeys.Count;
            }

            return result;
        }

        public ModBikeyInspectionResult InspectMod(string modPath, string modDirName, string serverDir)
        {
            var result = new ModBikeyInspectionResult();
            if (string.IsNullOrEmpty(modPath) || !Directory.Exists(modPath))
            {
                return result;
            }

            try
            {
                if (!HasBisignFiles(modPath))
                {
                    return result;
                }

                result.HasBisign = true;
                List<FileInfo> modBikeys = FindModBikeys(modPath);
                if (modBikeys.Count == 0)
                {
                    result.StatusText = "已签名，无密钥";
                    return result;
                }

                result.HasBikeyInMod = true;
                result.StatusText = "已签名，密钥未复制";

                if (string.IsNullOrEmpty(serverDir))
                {
                    return result;
                }

                string keysDirectory = GetServerKeysDirectory(serverDir);
                if (AreAllModBikeysOnServer(keysDirectory, modDirName, modBikeys))
                {
                    result.AllCopiedToServer = true;
                    result.StatusText = "已签名，密钥已复制";
                }
            }
            catch (UnauthorizedAccessException)
            {
            }
            catch (IOException)
            {
            }

            return result;
        }

        public List<string> ListServerBikeys(string serverDir)
        {
            var result = new List<string>();
            string keysDirectory = GetServerKeysDirectory(serverDir);
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

        public static string GetServerKeysDirectory(string serverDir)
        {
            return Path.Combine(serverDir, "Keys");
        }

        public static string GetCopiedBikeyFileName(string modDirName, FileInfo bikey)
        {
            if (bikey == null)
            {
                return string.Empty;
            }

            string safeDirName = NormalizeBikeyToken(modDirName);
            string safeName = NormalizeBikeyToken(
                bikey.Name.Replace(" ", "_", StringComparison.Ordinal));
            safeName = safeName.Replace("bikey", string.Empty, StringComparison.OrdinalIgnoreCase);
            safeName = safeName.Replace(".", string.Empty, StringComparison.Ordinal);
            return safeDirName + "-" + safeName + bikey.Extension;
        }

        public static string GetCopiedBikeyPath(string serverKeysDirectory, string modDirName, FileInfo bikey)
        {
            return Path.Combine(serverKeysDirectory, GetCopiedBikeyFileName(modDirName, bikey));
        }

        public static bool AreAllModBikeysOnServer(
            string serverKeysDirectory,
            string modDirName,
            IList<FileInfo> modBikeys)
        {
            if (modBikeys == null || modBikeys.Count == 0)
            {
                return false;
            }

            if (!Directory.Exists(serverKeysDirectory))
            {
                return false;
            }

            for (int i = 0; i < modBikeys.Count; i++)
            {
                FileInfo bikey = modBikeys[i];
                if (bikey == null)
                {
                    return false;
                }

                if (IsBikeyPresentOnServer(serverKeysDirectory, modDirName, bikey))
                {
                    continue;
                }

                return false;
            }

            return true;
        }

        public static bool IsBikeyPresentOnServer(string serverKeysDirectory, string modDirName, FileInfo bikey)
        {
            if (bikey == null)
            {
                return false;
            }

            string copiedPath = GetCopiedBikeyPath(serverKeysDirectory, modDirName, bikey);
            if (File.Exists(copiedPath))
            {
                return true;
            }

            string originalPath = Path.Combine(serverKeysDirectory, bikey.Name);
            return File.Exists(originalPath);
        }

        public static List<FileInfo> FindModBikeys(string modPath)
        {
            var result = new List<FileInfo>();
            CollectBikeys(new DirectoryInfo(modPath), result);
            return result;
        }

        private static bool HasBisignFiles(string modPath)
        {
            if (Directory.GetFiles(modPath, "*.bisign", SearchOption.TopDirectoryOnly).Length > 0)
            {
                return true;
            }

            string addonsPath = Path.Combine(modPath, "addons");
            if (Directory.Exists(addonsPath)
                && Directory.GetFiles(addonsPath, "*.bisign", SearchOption.TopDirectoryOnly).Length > 0)
            {
                return true;
            }

            return false;
        }

        private static string NormalizeBikeyToken(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return value.Replace(" ", "_", StringComparison.Ordinal)
                .Replace("@", string.Empty, StringComparison.Ordinal);
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
