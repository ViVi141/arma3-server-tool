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

        public SteamCmdLoadResult Load()
        {
            string filePath = GetFilePath();
            if (!File.Exists(filePath))
            {
                return SteamCmdLoadResult.MissingFile();
            }

            try
            {
                string stored = File.ReadAllText(filePath, GameConfigFormat.Utf8NoBom);
                string json = SecretProtector.Unprotect(stored);
                SteamcmdEntity entity = JsonSerializer.FromJson<SteamcmdEntity>(json);
                if (entity == null)
                {
                    return SteamCmdLoadResult.Failed("SteamCMD 配置文件解析结果为空: " + filePath);
                }

                if (SecretProtector.UsesLegacyFormat(stored))
                {
                    Save(entity);
                }

                return SteamCmdLoadResult.Ok(entity);
            }
            catch (Exception ex)
            {
                return SteamCmdLoadResult.Failed(
                    "读取 SteamCMD 配置失败，已使用空白配置。文件: " + filePath + "。原因: " + ex.Message);
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
            return Path.Combine(paths.UserDataDirectory, "data.json");
        }
    }
}
