using System.Collections.Generic;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public interface IServerConfigService
    {
        IReadOnlyList<ServerListItem> List();

        ArmaServerConfig Get(string serverUuid);

        void Save(ArmaServerConfig config);

        void Delete(string serverUuid);

        ArmaServerConfig Create(string name, string serverDir);

        ArmaServerConfig Clone(string sourceServerUuid, string newName, string newServerDir);
    }

    public interface IServerProcessService
    {
        OperationResult Start(string serverUuid);

        OperationResult Stop(string serverUuid);

        ServerRunState GetState(string serverUuid);

        ServerRunState SyncState(string serverUuid);

        OperationResult StartHeadlessClient(string serverUuid);

        OperationResult DetectRestart(string serverUuid);
    }

    public interface IGameConfigWriter
    {
        OperationResult WriteAll(ArmaServerConfig config);

        string BuildStartCommandLine(ArmaServerConfig config);

        string BuildHeadlessClientCommandLine(ArmaServerConfig config);
    }

    public interface IRconService : System.IDisposable
    {
        System.Threading.Tasks.Task ConnectAsync(string host, int port, string password, System.Threading.CancellationToken cancellationToken);

        System.Threading.Tasks.Task<System.Collections.Generic.IReadOnlyList<BytexDigital.BattlEye.Rcon.Domain.Player>> GetPlayersAsync();

        System.Threading.Tasks.Task KickAsync(int playerId, string reason);

        System.Threading.Tasks.Task<System.Collections.Generic.IReadOnlyList<BytexDigital.BattlEye.Rcon.Domain.PlayerBan>> GetBansAsync();

        System.Threading.Tasks.Task BanGuidAsync(string guid, string reason, System.TimeSpan duration);

        System.Threading.Tasks.Task BanGuidPermanentAsync(string guid, string reason);

        System.Threading.Tasks.Task BanOnlinePlayerAsync(string guid, string reason, System.TimeSpan duration);

        System.Threading.Tasks.Task BanOnlinePlayerPermanentAsync(string guid, string reason);

        System.Threading.Tasks.Task RemoveBanAsync(int banId);

        System.Threading.Tasks.Task LoadBansAsync();

        System.Threading.Tasks.Task SaveBansAsync();

        System.Threading.Tasks.Task SendMessageAsync(string message);

        System.Threading.Tasks.Task SendMessageToPlayerAsync(int playerId, string message);

        System.Threading.Tasks.Task<System.Collections.Generic.IReadOnlyList<BytexDigital.BattlEye.Rcon.Domain.Mission>> GetMissionsAsync();

        System.Threading.Tasks.Task RestartMissionAsync();

        System.Threading.Tasks.Task LoadMissionAsync(string missionName);

        System.Threading.Tasks.Task LockServerAsync();

        System.Threading.Tasks.Task UnlockServerAsync();
    }

    public interface ISchedulerService
    {
        System.Threading.Tasks.Task SyncJobsAsync(string serverUuid, IDictionary<string, CronEntity> crons);

        System.Threading.Tasks.Task StartAsync();

        System.Threading.Tasks.Task StopAsync();
    }

    public interface ISteamCmdService
    {
        OperationResult EnsureSteamCmdAvailable(bool downloadIfMissing);

        OperationResult InstallDedicatedServer(string installDir);

        void InvalidateExecutableCache();
    }

    public interface IMonitoringIngestService
    {
        void Ingest(string rawMessage);
    }

    public interface ISteamCmdConfigProvider
    {
        SteamcmdEntity GetSettings();

        void SaveSettings(SteamcmdEntity settings);
    }
}
