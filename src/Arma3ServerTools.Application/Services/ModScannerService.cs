using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.Application.Services
{
    public sealed class ModScannerService
    {
        private readonly object metaCacheLock = new object();
        private readonly Dictionary<string, MetaCacheEntry> metaCache =
            new Dictionary<string, MetaCacheEntry>(StringComparer.OrdinalIgnoreCase);
        private readonly ModuleScanPathRepository scanPathRepository;
        private readonly BikeyService bikeyService;

        public ModScannerService(ModuleScanPathRepository scanPathRepository)
            : this(scanPathRepository, new BikeyService())
        {
        }

        public ModScannerService(ModuleScanPathRepository scanPathRepository, BikeyService bikeyService)
        {
            this.scanPathRepository = scanPathRepository;
            this.bikeyService = bikeyService ?? new BikeyService();
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

        public ModScanResult Scan(ArmaServerConfig config, SteamcmdEntity steamcmd)
        {
            return Scan(config, steamcmd, includeBikeyStatus: false);
        }

        public ModScanResult Scan(ArmaServerConfig config, SteamcmdEntity steamcmd, bool includeBikeyStatus)
        {
            EnsureDefaultWorkshopPath(steamcmd);
            var scanResult = new ModScanResult();
            List<ModuleScanPathEntity> scanPaths = scanPathRepository.Load();
            var directories = new List<string>();
            var directoryLookup = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (ModuleScanPathEntity scanPath in scanPaths)
            {
                if (string.IsNullOrWhiteSpace(scanPath.ModulePath))
                {
                    continue;
                }

                if (!Directory.Exists(scanPath.ModulePath))
                {
                    continue;
                }

                ModDirectoryScanResult pathScan = ModFileTools.GetModDirectories(
                    scanPath.ModulePath,
                    scanPath.Prefix);
                if (pathScan.RootAccessDenied && pathScan.Directories.Count == 0)
                {
                    scanResult.InaccessiblePaths.Add(scanPath.ModulePath);
                }

                foreach (string directory in pathScan.Directories)
                {
                    if (directoryLookup.Add(directory))
                    {
                        directories.Add(directory);
                    }
                }
            }

            Dictionary<string, ModsEntity> savedByPath = BuildSavedModsByPath(config);
            if (config != null && config.StartupParameters != null && config.StartupParameters.modsEntities != null)
            {
                foreach (ModsEntity saved in config.StartupParameters.modsEntities)
                {
                    if (!string.IsNullOrEmpty(saved.ModPath)
                        && Directory.Exists(saved.ModPath)
                        && directoryLookup.Add(saved.ModPath))
                    {
                        directories.Add(saved.ModPath);
                    }
                }
            }

            var rows = new List<ScannedModRow>();
            int scanOrder = 0;
            foreach (string directory in directories)
            {
                ModsEntity saved;
                if (!savedByPath.TryGetValue(directory, out saved))
                {
                    saved = null;
                }
                ModMeta meta = ReadModMetaCached(directory);
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

                if (includeBikeyStatus)
                {
                    DetectBikeyStatus(row, config);
                }
                else
                {
                    row.HasBikeyFile = false;
                    row.BikeyStatus = "—";
                }

                rows.Add(row);
            }

            CleanupMetaCache(directories);
            scanResult.Rows = rows;
            return scanResult;
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

        private void DetectBikeyStatus(ScannedModRow row, ArmaServerConfig config)
        {
            row.HasBikeyFile = false;
            row.BikeyStatus = "未签名";

            string serverDir = config != null ? config.ServerDir : null;
            ModBikeyInspectionResult inspection = bikeyService.InspectMod(
                row.ModPath,
                row.ModDirName,
                serverDir);
            row.HasBikeyFile = inspection.HasBikeyInMod;
            row.BikeyStatus = inspection.StatusText;
        }

        private static Dictionary<string, ModsEntity> BuildSavedModsByPath(ArmaServerConfig config)
        {
            var result = new Dictionary<string, ModsEntity>(StringComparer.OrdinalIgnoreCase);
            if (config == null || config.StartupParameters == null || config.StartupParameters.modsEntities == null)
            {
                return result;
            }

            foreach (ModsEntity mod in config.StartupParameters.modsEntities)
            {
                if (mod == null || string.IsNullOrEmpty(mod.ModPath))
                {
                    continue;
                }

                if (!result.ContainsKey(mod.ModPath))
                {
                    result.Add(mod.ModPath, mod);
                }
            }

            return result;
        }

        private ModMeta ReadModMetaCached(string modPath)
        {
            string metaPath = Path.Combine(modPath, "meta.cpp");
            if (!File.Exists(metaPath))
            {
                lock (metaCacheLock)
                {
                    if (metaCache.ContainsKey(modPath))
                    {
                        metaCache.Remove(modPath);
                    }
                }

                return null;
            }

            // 机械硬盘优化：先检查缓存是否未过期，避免不必要的文件时间戳查询
            lock (metaCacheLock)
            {
                MetaCacheEntry cached;
                if (metaCache.TryGetValue(modPath, out cached) && !cached.IsExpired())
                {
                    return CloneMeta(cached.Meta);
                }
            }

            // 缓存过期或不存在，需要检查文件时间戳
            long lastWriteTicks = 0;
            try
            {
                lastWriteTicks = File.GetLastWriteTimeUtc(metaPath).Ticks;
            }
            catch
            {
                return ModFileTools.ReadModMeta(modPath);
            }

            lock (metaCacheLock)
            {
                MetaCacheEntry cached;
                if (metaCache.TryGetValue(modPath, out cached))
                {
                    if (cached.LastWriteTicks == lastWriteTicks)
                    {
                        // 更新缓存时间戳，延长有效期
                        metaCache[modPath] = new MetaCacheEntry(lastWriteTicks, cached.Meta);
                        return CloneMeta(cached.Meta);
                    }
                }
            }

            ModMeta readMeta = ModFileTools.ReadModMeta(modPath);
            lock (metaCacheLock)
            {
                metaCache[modPath] = new MetaCacheEntry(lastWriteTicks, CloneMeta(readMeta));
            }

            return readMeta;
        }

        private void CleanupMetaCache(List<string> activeDirectories)
        {
            var activeSet = new HashSet<string>(activeDirectories, StringComparer.OrdinalIgnoreCase);
            lock (metaCacheLock)
            {
                var staleKeys = new List<string>();
                foreach (string key in metaCache.Keys)
                {
                    if (!activeSet.Contains(key))
                    {
                        staleKeys.Add(key);
                    }
                }

                foreach (string staleKey in staleKeys)
                {
                    metaCache.Remove(staleKey);
                }
            }
        }

        private static ModMeta CloneMeta(ModMeta meta)
        {
            if (meta == null)
            {
                return null;
            }

            return new ModMeta
            {
                Name = meta.Name,
                PublishedId = meta.PublishedId,
                TimeStamp = meta.TimeStamp,
            };
        }

        // Async concurrent scan method
        public async System.Threading.Tasks.Task<ModScanResult> ScanAsync(
            ArmaServerConfig config,
            SteamcmdEntity steamcmd,
            bool includeBikeyStatus = false,
            System.Threading.CancellationToken cancellationToken = default)
        {
            return await System.Threading.Tasks.Task.Run(() => Scan(config, steamcmd, includeBikeyStatus), cancellationToken);
        }
    }

    internal sealed class MetaCacheEntry
    {
        // 缓存有效期：5分钟（机械硬盘优化）
        private static readonly long CacheValidityTicks = TimeSpan.FromMinutes(5).Ticks;

        public MetaCacheEntry(long lastWriteTicks, ModMeta meta)
        {
            LastWriteTicks = lastWriteTicks;
            Meta = meta;
            CachedAtTicks = DateTime.UtcNow.Ticks;
        }

        public long LastWriteTicks { get; private set; }

        public ModMeta Meta { get; private set; }

        public long CachedAtTicks { get; private set; }

        public bool IsExpired()
        {
            long elapsedTicks = DateTime.UtcNow.Ticks - CachedAtTicks;
            return elapsedTicks > CacheValidityTicks;
        }
    }

    public sealed class ModScanResult
    {
        public List<ScannedModRow> Rows { get; set; } = new List<ScannedModRow>();

        public List<string> InaccessiblePaths { get; } = new List<string>();
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

        public bool HasBikeyFile { get; set; }

        public string BikeyStatus { get; set; }
    }
}
