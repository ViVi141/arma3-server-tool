using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Repositories
{
    public sealed class ModuleScanPathRepository
    {
        private readonly IAppPaths paths;

        public ModuleScanPathRepository(IAppPaths paths)
        {
            this.paths = paths;
        }

        public List<ModuleScanPathEntity> Load()
        {
            string filePath = Path.Combine(paths.UserDataDirectory, "moduleScanPath.json");
            if (!File.Exists(filePath))
            {
                return new List<ModuleScanPathEntity>();
            }

            try
            {
                string json = File.ReadAllText(filePath, GameConfigFormat.Utf8NoBom);
                List<ModuleScanPathEntity> list = JsonSerializer.FromJson<List<ModuleScanPathEntity>>(json);
                if (list == null)
                {
                    return new List<ModuleScanPathEntity>();
                }

                return list;
            }
            catch
            {
                return new List<ModuleScanPathEntity>();
            }
        }

        public void Save(IList<ModuleScanPathEntity> pathsList)
        {
            string json = JsonSerializer.ToJson(pathsList ?? new List<ModuleScanPathEntity>());
            string filePath = Path.Combine(paths.UserDataDirectory, "moduleScanPath.json");
            File.WriteAllText(filePath, json, GameConfigFormat.Utf8NoBom);
        }
    }
}
