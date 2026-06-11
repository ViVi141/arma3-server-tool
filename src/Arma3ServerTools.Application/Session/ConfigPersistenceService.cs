using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Application.Session
{
    public sealed class ConfigPersistenceService
    {
        private readonly IServerConfigService configService;
        private readonly IGameConfigWriter configWriter;
        private readonly ServerConfigSnapshotService snapshotService;
        private readonly MonitoringDeploymentService monitoringDeploymentService;
        private readonly IConfigPersistenceSettingsProvider settingsProvider;
        private readonly ILogger logger;
        private readonly ConcurrentDictionary<string, SemaphoreSlim> locks =
            new ConcurrentDictionary<string, SemaphoreSlim>(StringComparer.Ordinal);

        public ConfigPersistenceService(
            IServerConfigService configService,
            IGameConfigWriter configWriter,
            ServerConfigSnapshotService snapshotService,
            MonitoringDeploymentService monitoringDeploymentService,
            IConfigPersistenceSettingsProvider settingsProvider,
            ILogger logger)
        {
            this.configService = configService ?? throw new ArgumentNullException(nameof(configService));
            this.configWriter = configWriter ?? throw new ArgumentNullException(nameof(configWriter));
            this.snapshotService = snapshotService ?? throw new ArgumentNullException(nameof(snapshotService));
            this.monitoringDeploymentService = monitoringDeploymentService
                ?? throw new ArgumentNullException(nameof(monitoringDeploymentService));
            this.settingsProvider = settingsProvider ?? throw new ArgumentNullException(nameof(settingsProvider));
            this.logger = logger ?? AppLogging.CreateLogger("ConfigPersistence");
        }

        public Task<OperationResult> SavePackageAsync(
            ServerConfigSession session,
            CancellationToken cancellationToken = default)
        {
            return ExecuteAsync(session, cancellationToken, SavePackageCore);
        }

        public Task<OperationResult> WriteGameCfgAsync(
            ServerConfigSession session,
            CancellationToken cancellationToken = default)
        {
            return ExecuteAsync(session, cancellationToken, WriteGameCfgCore);
        }

        public Task<OperationResult> SaveAndWriteAsync(
            ServerConfigSession session,
            CancellationToken cancellationToken = default)
        {
            return ExecuteAsync(session, cancellationToken, SaveAndWriteCore);
        }

        public OperationResult SavePackage(ServerConfigSession session)
        {
            return SavePackageAsync(session, CancellationToken.None).GetAwaiter().GetResult();
        }

        public OperationResult WriteGameCfg(ServerConfigSession session)
        {
            return WriteGameCfgAsync(session, CancellationToken.None).GetAwaiter().GetResult();
        }

        public OperationResult SaveAndWrite(ServerConfigSession session)
        {
            return SaveAndWriteAsync(session, CancellationToken.None).GetAwaiter().GetResult();
        }

        private async Task<OperationResult> ExecuteAsync(
            ServerConfigSession session,
            CancellationToken cancellationToken,
            Func<ServerConfigSession, ConfigPersistenceSettings, CancellationToken, Task<OperationResult>> action)
        {
            if (session == null)
            {
                return OperationResult.Fail("未选择服务器配置。");
            }

            SemaphoreSlim gate = locks.GetOrAdd(session.ServerUuid, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                session.SetSaving();
                ConfigPersistenceSettings settings = settingsProvider.GetSettings();
                OperationResult result = await action(session, settings, cancellationToken).ConfigureAwait(false);
                if (result.Success)
                {
                    session.MarkPersisted();
                }
                else
                {
                    session.MarkError(result.Message);
                }

                return result;
            }
            catch (Exception ex)
            {
                session.MarkError(ex.Message);
                logger.LogError(ex, "Config persistence failed for {ServerUuid}.", session.ServerUuid);
                return OperationResult.Fail("持久化失败: " + ex.Message);
            }
            finally
            {
                gate.Release();
            }
        }

        private async Task<OperationResult> SavePackageCore(
            ServerConfigSession session,
            ConfigPersistenceSettings settings,
            CancellationToken cancellationToken)
        {
            MaybeSnapshot(session.ServerUuid, "保存前", AutoSnapshotMode.BeforeSave, settings);
            session.Model.SetTime();
            await configService.SaveAsync(session.Model, cancellationToken).ConfigureAwait(false);
            return OperationResult.Ok();
        }

        private async Task<OperationResult> WriteGameCfgCore(
            ServerConfigSession session,
            ConfigPersistenceSettings settings,
            CancellationToken cancellationToken)
        {
            MaybeSnapshot(session.ServerUuid, "写入服务器前", AutoSnapshotMode.BeforeWrite, settings);
            OperationResult writeResult = await configWriter
                .WriteAllAsync(session.Model, cancellationToken)
                .ConfigureAwait(false);
            if (!writeResult.Success)
            {
                return writeResult;
            }

            return monitoringDeploymentService.DeployIfEnabled(session.Model);
        }

        private async Task<OperationResult> SaveAndWriteCore(
            ServerConfigSession session,
            ConfigPersistenceSettings settings,
            CancellationToken cancellationToken)
        {
            OperationResult saveResult = await SavePackageCore(session, settings, cancellationToken)
                .ConfigureAwait(false);
            if (!saveResult.Success)
            {
                return saveResult;
            }

            return await WriteGameCfgCore(session, settings, cancellationToken).ConfigureAwait(false);
        }

        private void MaybeSnapshot(
            string serverUuid,
            string reason,
            AutoSnapshotMode requiredMode,
            ConfigPersistenceSettings settings)
        {
            if (settings.AutoSnapshotMode != requiredMode)
            {
                return;
            }

            if (settings.AutoSnapshotAsync)
            {
                Task.Run(() => TrySnapshot(serverUuid, reason));
                return;
            }

            TrySnapshot(serverUuid, reason);
        }

        private void TrySnapshot(string serverUuid, string reason)
        {
            try
            {
                snapshotService.TryCreateAutoSnapshot(serverUuid, reason);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Auto snapshot failed for {ServerUuid} ({Reason}).", serverUuid, reason);
            }
        }
    }
}
