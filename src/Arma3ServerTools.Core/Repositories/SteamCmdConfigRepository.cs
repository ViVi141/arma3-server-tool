using System;
using System.IO;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Security;

namespace Arma3ServerTools.Core.Repositories
{
    public sealed class SteamCmdConfigRepository
    {
        private readonly IAppPaths paths;

        public SteamCmdConfigRepository(IAppPaths paths)
        {
            this.paths = paths;
        }

        public SteamcmdEntity Load()
        {
            string filePath = GetFilePath();
            if (!File.Exists(filePath))
            {
                return new SteamcmdEntity();
            }

            try
            {
                string stored = File.ReadAllText(filePath, GameConfigFormat.Utf8NoBom);
                string json = SecretProtector.Unprotect(stored);
                SteamcmdEntity entity = JsonSerializer.FromJson<SteamcmdEntity>(json);
                if (entity == null)
                {
                    return new SteamcmdEntity();
                }

                if (SecretProtector.UsesLegacyFormat(stored))
                {
                    Save(entity);
                }

                return entity;
            }
            catch (Exception)
            {
                return new SteamcmdEntity();
            }
        }

        public void Save(SteamcmdEntity settings)
        {
            if (settings == null)
            {
                throw new ArgumentNullException(nameof(settings));
            }

            string json = JsonSerializer.ToJson(settings);
            string protectedText = SecretProtector.Protect(json);
            File.WriteAllText(GetFilePath(), protectedText, GameConfigFormat.Utf8NoBom);

            if (!string.IsNullOrEmpty(settings.d))
            {
                try
                {
                    Directory.CreateDirectory(Path.Combine(settings.d, @"steamapps\workshop\content\107410"));
                }
                catch (Exception)
                {
                    // Best effort.
                }
            }
        }

        private string GetFilePath()
        {
            return Path.Combine(paths.ApplicationBase, "data.json");
        }
    }
}
