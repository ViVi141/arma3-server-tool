using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.Application.Services
{
    public sealed class ModScannerService
    {
        private readonly ModuleScanPathRepository scanPathRepository;

        public ModScannerService(ModuleScanPathRepository scanPathRepository)
        {
            this.scanPathRepository = scanPathRepository;
        }

        public IList<ModuleScanPathEntity> GetScanPaths()
        {
            return scanPathRepository.Load();
        }

        public void SaveScanPaths(IList<ModuleScanPathEntity> paths)
        {
            scanPathRepository.Save(paths);
        }

        public void EnsureDefaultWorkshopPath(SteamcmdEntity steamcmd)
        {
            if (steamcmd == null || string.IsNullOrEmpty(steamcmd.d))
            {
                return;
            }

            string workshopPath = Path.Combine(steamcmd.d, @"steamapps\workshop\content\107410");
            if (!Directory.Exists(workshopPath))
            {
                return;
            }

            List<ModuleScanPathEntity> paths = scanPathRepository.Load();
            bool exists = false;
            foreach (ModuleScanPathEntity item in paths)
            {
                if (string.Equals(item.ModulePath, workshopPath, StringComparison.OrdinalIgnoreCase))
                {
                    exists = true;
                    break;
                }
            }

            if (!exists)
            {
                paths.Add(new ModuleScanPathEntity(workshopPath, string.Empty, "自动设置的 SteamCMD 模组路径"));
                scanPathRepository.Save(paths);
            }
        }

        public List<ScannedModRow> Scan(ArmaServerConfig config, SteamcmdEntity steamcmd)
        {
            EnsureDefaultWorkshopPath(steamcmd);
            List<ModuleScanPathEntity> scanPaths = scanPathRepository.Load();
            var directories = new List<string>();
            foreach (ModuleScanPathEntity scanPath in scanPaths)
            {
                if (!Directory.Exists(scanPath.ModulePath))
                {
                    continue;
                }

                directories.AddRange(ModFileTools.GetModDirectories(scanPath.ModulePath, scanPath.Prefix));
            }

            if (config != null)
            {
                foreach (ModsEntity saved in config.StartupParameters.modsEntities)
                {
                    if (!string.IsNullOrEmpty(saved.ModPath)
                        && Directory.Exists(saved.ModPath)
                        && !directories.Contains(saved.ModPath))
                    {
                        directories.Add(saved.ModPath);
                    }
                }
            }

            var rows = new List<ScannedModRow>();
            int scanOrder = 0;
            foreach (string directory in directories)
            {
                ModsEntity saved = FindSavedMod(config, directory);
                ModMeta meta = ModFileTools.ReadModMeta(directory);
                var row = new ScannedModRow();
                row.ModPath = directory;
                row.ModDirName = ModFileTools.GetDirectoryName(directory);
                row.ScanOrder = scanOrder;
                scanOrder++;
                if (saved != null)
                {
                    row.ModName = saved.ModName;
                    row.ModId = saved.ModId;
                    row.LocalMod = saved.LocalMod;
                    row.ServerMod = saved.ServerMod;
                    row.HeadlessClientMod = saved.HeadlessClientMod;
                    row.InputLocalMod = saved.InputLocalMod;
                }
                else
                {
                    row.LocalMod = false;
                    row.ServerMod = false;
                    row.HeadlessClientMod = false;
                    row.InputLocalMod = false;
                }

                if (IsWorkshopModPath(directory, steamcmd))
                {
                    row.InputLocalMod = false;
                }

                if (meta != null)
                {
                    if (!string.IsNullOrEmpty(meta.Name))
                    {
                        row.ModName = meta.Name;
                    }

                    if (meta.PublishedId != 0)
                    {
                        row.ModId = meta.PublishedId;
                    }

                    if (meta.TimeStamp != 0)
                    {
                        row.UpdatedAt = DateTime.FromBinary(meta.TimeStamp);
                        row.UpdatedTime = row.UpdatedAt.Value.ToString();
                    }
                }

                if (string.IsNullOrEmpty(row.ModName))
                {
                    row.ModName = row.ModDirName;
                }

                rows.Add(row);
            }

            return rows;
        }

        internal static bool IsWorkshopModPath(string modPath, SteamcmdEntity steamcmd)
        {
            if (string.IsNullOrEmpty(modPath))
            {
                return false;
            }

            if (steamcmd != null && !string.IsNullOrEmpty(steamcmd.d))
            {
                string workshopRoot = Path.Combine(steamcmd.d, @"steamapps\workshop\content\107410");
                if (modPath.StartsWith(workshopRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return modPath.IndexOf(@"workshop\content\107410", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static ModsEntity FindSavedMod(ArmaServerConfig config, string modPath)
        {
            if (config == null)
            {
                return null;
            }

            foreach (ModsEntity mod in config.StartupParameters.modsEntities)
            {
                if (string.Equals(mod.ModPath, modPath, StringComparison.OrdinalIgnoreCase))
                {
                    return mod;
                }
            }

            return null;
        }
    }

    public sealed class ScannedModRow
    {
        public int RowIndex { get; set; }

        public int ScanOrder { get; set; }

        public bool UpdateSelected { get; set; }

        public string ModDirName { get; set; }

        public string ModName { get; set; }

        public long ModId { get; set; }

        public bool LocalMod { get; set; }

        public bool ServerMod { get; set; }

        public bool HeadlessClientMod { get; set; }

        public bool InputLocalMod { get; set; }

        public string InputLocalModLabel
        {
            get
            {
                if (InputLocalMod)
                {
                    return "是";
                }

                return "否";
            }
        }

        public bool IsAnyModSelected
        {
            get { return LocalMod || ServerMod || HeadlessClientMod; }
        }

        public string ModPath { get; set; }

        public string UpdatedTime { get; set; }

        public DateTime? UpdatedAt { get; set; }
    }
}
