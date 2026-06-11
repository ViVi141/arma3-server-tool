using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public interface IAgentServerAdminService
    {
        ArmaServerConfig GetConfig(string serverUuid);

        OperationResult PutConfig(string serverUuid, ArmaServerConfig config);

        OperationResult PatchConfig(string serverUuid, string patchJson);

        OperationResult CreateServer(string name, string serverDir);

        OperationResult CloneServer(string sourceUuid, string newName, string newServerDir);

        OperationResult DeleteServer(string serverUuid);

        OperationResult RenameServer(string serverUuid, string newName);
    }
}
