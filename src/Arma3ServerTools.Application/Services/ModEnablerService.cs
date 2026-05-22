using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public enum ModApplyTarget
    {
        Client = 0,
        Server = 1,
        Headless = 2,
        All = 3,
    }

    public sealed class ModEnableApplyResult
    {
        public int AppliedCount { get; set; }

        public List<LauncherHtmlModEntry> MissingOnDisk { get; set; } = new List<LauncherHtmlModEntry>();
    }

    public sealed class ModEnablerService
    {
        public const string WorkshopContentRelativePath = @"steamapps\workshop\content\107410";

        public string ResolveWorkshopModPath(string workshopRoot, ulong modId)
        {
            if (string.IsNullOrWhiteSpace(workshopRoot) || modId == 0)
            {
                return string.Empty;
            }

            return Path.Combine(workshopRoot, WorkshopContentRelativePath, modId.ToString());
        }

        public bool IsModInstalled(string workshopRoot, ulong modId)
        {
            string path = ResolveWorkshopModPath(workshopRoot, modId);
            return !string.IsNullOrEmpty(path) && Directory.Exists(path);
        }

        public ModEnableApplyResult ApplyHtmlMods(
            ArmaServerConfig config,
            string workshopRoot,
            IList<LauncherHtmlModEntry> entries,
            ModApplyTarget target)
        {
            var result = new ModEnableApplyResult();
            if (config == null || entries == null || entries.Count == 0)
            {
                return result;
            }

            if (config.StartupParameters.modsEntities == null)
            {
                config.StartupParameters.modsEntities = new List<ModsEntity>();
            }

            foreach (LauncherHtmlModEntry entry in entries)
            {
                if (entry == null || !entry.Selected || entry.ModId == 0)
                {
                    continue;
                }

                string modPath = ResolveWorkshopModPath(workshopRoot, entry.ModId);
                if (!Directory.Exists(modPath))
                {
                    result.MissingOnDisk.Add(entry);
                    continue;
                }

                ModsEntity entity = FindByModId(config, entry.ModId);
                if (entity == null)
                {
                    entity = FindByPath(config, modPath);
                }

                if (entity == null)
                {
                    string dirName = ModFileTools.GetDirectoryName(modPath);
                    string modName = entry.DisplayName;
                    if (string.IsNullOrWhiteSpace(modName))
                    {
                        modName = dirName;
                    }

                    entity = new ModsEntity(
                        modPath,
                        dirName,
                        modName,
                        (long)entry.ModId,
                        false,
                        false,
                        false,
                        false);
                    config.StartupParameters.modsEntities.Add(entity);
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(entity.ModPath))
                    {
                        entity.ModPath = modPath;
                    }

                    if (!string.IsNullOrWhiteSpace(entry.DisplayName))
                    {
                        entity.ModName = entry.DisplayName;
                    }

                    if (entity.ModId == 0)
                    {
                        entity.ModId = (long)entry.ModId;
                    }
                }

                ApplyTargetFlags(entity, target);
                result.AppliedCount++;
            }

            return result;
        }

        public static void ApplyTargetFlags(ModsEntity entity, ModApplyTarget target)
        {
            if (entity == null)
            {
                return;
            }

            if (target == ModApplyTarget.Client)
            {
                entity.LocalMod = true;
                entity.ServerMod = false;
                entity.HeadlessClientMod = false;
                return;
            }

            if (target == ModApplyTarget.Server)
            {
                entity.LocalMod = false;
                entity.ServerMod = true;
                entity.HeadlessClientMod = false;
                return;
            }

            if (target == ModApplyTarget.Headless)
            {
                entity.LocalMod = false;
                entity.ServerMod = false;
                entity.HeadlessClientMod = true;
                return;
            }

            entity.LocalMod = true;
            entity.ServerMod = true;
            entity.HeadlessClientMod = true;
        }

        private static ModsEntity FindByModId(ArmaServerConfig config, ulong modId)
        {
            foreach (ModsEntity entity in config.StartupParameters.modsEntities)
            {
                if (entity.ModId == (long)modId)
                {
                    return entity;
                }
            }

            return null;
        }

        private static ModsEntity FindByPath(ArmaServerConfig config, string modPath)
        {
            foreach (ModsEntity entity in config.StartupParameters.modsEntities)
            {
                if (string.Equals(entity.ModPath, modPath, StringComparison.OrdinalIgnoreCase))
                {
                    return entity;
                }
            }

            return null;
        }
    }
}
