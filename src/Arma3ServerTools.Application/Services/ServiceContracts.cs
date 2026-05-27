using System.Collections.Generic;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public interface IServerConfigService
    {
        IReadOnlyList<ServerListItem> List();

        IReadOnlyDictionary<string, ArmaServerConfig> LoadAll();

        ArmaServerConfig Get(string serverUuid);

        void Save(ArmaServerConfig config);

        void Delete(string serverUuid);

        ArmaServerConfig Create(string name, string serverDir);

        ArmaServerConfig Clone(string sourceServerUuid, string newName, string newServerDir);
    }

    public interface IServerProcessService
    {
        OperationResult Start(string serverUuid);

        OperationResult Start(ArmaServerConfig config);

        OperationResult Stop(string serverUuid);

        OperationResult Stop(ArmaServerConfig config);

        ServerRunState GetState(string serverUuid);

        ServerRunState GetState(ArmaServerConfig config);

        ServerRunState SyncState(string serverUuid);

        ServerRunState SyncState(ArmaServerConfig config);

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

        System.Threading.Tasks.Task ChangeRconPasswordAsync(string newPassword);
    }

    public interface ISchedulerService
    {
        System.Threading.Tasks.Task SyncJobsAsync(string serverUuid, IDictionary<string, CronEntity> crons);

        System.Threading.Tasks.Task<string> GetNextFireSummaryAsync(string serverUuid);

        System.Threading.Tasks.Task StartAsync();

        System.Threading.Tasks.Task StopAsync();
    }

    public interface ISteamCmdService
    {
        OperationResult EnsureSteamCmdAvailable(bool downloadIfMissing);

        System.Threading.Tasks.Task<OperationResult> EnsureSteamCmdAvailableAsync(
            bool downloadIfMissing,
            System.Threading.CancellationToken cancellationToken);

        System.Threading.Tasks.Task<OperationResult> EnsureSteamCmdAvailableAsync(
            bool downloadIfMissing,
            System.Threading.CancellationToken cancellationToken,
            System.IProgress<SteamCmdDownloadProgress> progress);

        OperationResult InstallDedicatedServer(string installDir);

        OperationResult DownloadWorkshopItems(System.Collections.Generic.IList<ulong> modIds);

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

        /// <summary>
        /// When the last <see cref="GetSettings"/> had to fall back due to load/decrypt failure.
        /// </summary>
        string LastLoadWarning { get; }
    }
}
