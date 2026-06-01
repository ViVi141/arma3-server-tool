using System.Collections.Generic;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Repositories
{
    /// <summary>
    /// Loads and persists per-server tool configs (A3ST package under config/{uuid}/).
    /// </summary>
    public sealed class ServerConfigRepository
    {
        private readonly A3stServerConfigPackageStorage storage;

        public ServerConfigRepository(IAppPaths paths)
        {
            storage = new A3stServerConfigPackageStorage(paths);
        }

        public IReadOnlyList<ServerListItem> List()
        {
            return storage.List();
        }

        public IReadOnlyDictionary<string, ArmaServerConfig> LoadAll()
        {
            return storage.LoadAll();
        }

        public ArmaServerConfig Get(string serverUuid)
        {
            return storage.Get(serverUuid);
        }

        public void Save(ArmaServerConfig config)
        {
            storage.Save(config);
        }

        public void Delete(string serverUuid)
        {
            storage.Delete(serverUuid);
        }

        public bool Exists(string serverUuid)
        {
            return storage.Exists(serverUuid);
        }

        public bool TryPatchProcessId(string serverUuid, int processId)
        {
            return storage.TryPatchProcessId(serverUuid, processId);
        }
    }
}
