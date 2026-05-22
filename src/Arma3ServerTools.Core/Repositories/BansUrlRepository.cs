using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Repositories
{
    public sealed class BansUrlRepository
    {
        private readonly IAppPaths paths;

        public BansUrlRepository(IAppPaths paths)
        {
            this.paths = paths;
        }

        public List<BansUrlEntity> Load()
        {
            string filePath = Path.Combine(paths.ApplicationBase, "bans.json");
            if (!File.Exists(filePath))
            {
                return new List<BansUrlEntity>
                {
                    new BansUrlEntity("http://tools.destiny.cool/arma3_server_tools/bans.txt", true),
                };
            }

            try
            {
                string json = File.ReadAllText(filePath, GameConfigFormat.Utf8NoBom);
                List<BansUrlEntity> list = JsonSerializer.FromJson<List<BansUrlEntity>>(json);
                if (list == null || list.Count == 0)
                {
                    return new List<BansUrlEntity>
                    {
                        new BansUrlEntity("http://tools.destiny.cool/arma3_server_tools/bans.txt", true),
                    };
                }

                return list;
            }
            catch
            {
                return new List<BansUrlEntity>
                {
                    new BansUrlEntity("http://tools.destiny.cool/arma3_server_tools/bans.txt", true),
                };
            }
        }

        public void Save(IList<BansUrlEntity> urls)
        {
            string json = JsonSerializer.ToJson(urls ?? new List<BansUrlEntity>());
            string filePath = Path.Combine(paths.ApplicationBase, "bans.json");
            File.WriteAllText(filePath, json, GameConfigFormat.Utf8NoBom);
        }
    }
}
