using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Application.Session;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class ServerConfigSessionTests
    {
        [Fact]
        public void Patch_IncrementsRevisionAndMarksUnsaved()
        {
            var session = new ServerConfigSession(CreateConfig("patch-test"));

            long revisionBefore = session.Revision;
            session.Patch(config => config.ServerConfig.HostName = "Changed");

            Assert.Equal(revisionBefore + 1, session.Revision);
            Assert.Equal(SessionSyncState.Unsaved, session.SyncState);
            Assert.Equal("Changed", session.Model.ServerConfig.HostName);
            Assert.NotEqual(session.PersistedFingerprint, session.Fingerprint);
        }

        [Fact]
        public async Task SavePackageAsync_MarksSessionSaved()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3st-session-mark");
            try
            {
                var paths = new SessionTestPaths(root);
                var repository = new ServerConfigRepository(paths);
                var configService = new ServerConfigService(repository);
                ArmaServerConfig config = configService.Create("PersistTest", @"C:\server");
                var session = new ServerConfigSession(config);
                session.Patch(c => c.ServerConfig.MaxPlayers = 32);

                var persistence = SessionTestSupport.BuildPersistence(configService, paths);
                OperationResult result = await persistence.SavePackageAsync(session).ConfigureAwait(true);

                Assert.True(result.Success);
                Assert.Equal(SessionSyncState.Saved, session.SyncState);
                Assert.False(session.HasUnsavedChanges);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void Fingerprint_MatchesSnapshotTracker()
        {
            var config = CreateConfig("fingerprint-test");
            config.ServerConfig.HostName = "Host-A";
            var session = new ServerConfigSession(config);

            string expected = Application.Sync.ServerConfigSnapshotTracker.SerializeForCompare(session.Model);

            Assert.Equal(expected, session.Fingerprint);
        }

        [Fact]
        public void ReplaceModel_ResetsSavedStateWhenRequested()
        {
            var session = new ServerConfigSession(CreateConfig("replace-test"));
            session.Patch(config => config.ServerConfig.HostName = "Dirty");
            var reloaded = CreateConfig("replace-test");
            reloaded.ServerConfig.HostName = "FromDisk";

            session.ReplaceModel(reloaded, markSaved: true);

            Assert.Equal("FromDisk", session.Model.ServerConfig.HostName);
            Assert.Equal(SessionSyncState.Saved, session.SyncState);
        }

        private static ArmaServerConfig CreateConfig(string serverUuid)
        {
            return new ArmaServerConfig
            {
                ServerUUID = serverUuid,
                ConfigName = "Test",
                ServerDir = @"C:\Arma3Server",
            };
        }
    }

    public sealed class ConfigPersistenceServiceTests
    {
        [Fact]
        public async Task SavePackageAsync_WritesConfigPackage()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3st-session-save");
            try
            {
                var paths = new SessionTestPaths(root);
                var repository = new ServerConfigRepository(paths);
                var configService = new ServerConfigService(repository);
                ArmaServerConfig config = configService.Create("SaveTest", @"C:\server");
                config.ServerConfig.HostName = "BeforeSave";
                var session = new ServerConfigSession(config);

                var persistence = SessionTestSupport.BuildPersistence(configService, paths);
                OperationResult result = await persistence.SavePackageAsync(session).ConfigureAwait(true);

                Assert.True(result.Success);
                Assert.Equal(SessionSyncState.Saved, session.SyncState);
                ArmaServerConfig loaded = configService.Get(config.ServerUUID);
                Assert.Equal("BeforeSave", loaded.ServerConfig.HostName);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public async Task SavePackageAsync_ConcurrentCallsOnSameSession_BothSucceed()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3st-session-queue");
            try
            {
                var paths = new SessionTestPaths(root);
                var repository = new ServerConfigRepository(paths);
                var configService = new ServerConfigService(repository);
                ArmaServerConfig config = configService.Create("WriteTest", Path.Combine(root, "server"));
                var session = new ServerConfigSession(config);
                var persistence = SessionTestSupport.BuildPersistence(configService, paths);

                Task<OperationResult> first = persistence.SavePackageAsync(session);
                Task<OperationResult> second = persistence.SavePackageAsync(session);
                OperationResult[] results = await Task.WhenAll(first, second).ConfigureAwait(true);

                Assert.True(results[0].Success);
                Assert.True(results[1].Success);
                Assert.Equal(SessionSyncState.Saved, session.SyncState);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public async Task SavePackageAsync_SkipsSnapshotWhenModeOff()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3st-session-snap-off");
            try
            {
                var paths = new SessionTestPaths(root);
                var repository = new ServerConfigRepository(paths);
                var configService = new ServerConfigService(repository);
                ArmaServerConfig config = configService.Create("SnapOff", @"C:\server");
                await configService.SaveAsync(config).ConfigureAwait(true);
                var session = new ServerConfigSession(configService.Get(config.ServerUUID));

                var settingsProvider = new DefaultConfigPersistenceSettingsProvider();
                settingsProvider.Update(new ConfigPersistenceSettings
                {
                    AutoSnapshotMode = AutoSnapshotMode.Off,
                    AutoSnapshotAsync = false,
                });

                var persistence = SessionTestSupport.BuildPersistence(configService, paths, settingsProvider);
                OperationResult result = await persistence.SavePackageAsync(session).ConfigureAwait(true);

                Assert.True(result.Success);
                string snapshotRoot = Path.Combine(root, "config-snapshots");
                if (Directory.Exists(snapshotRoot))
                {
                    Assert.Empty(Directory.GetDirectories(snapshotRoot));
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        private static ConfigPersistenceService BuildPersistence(
            ServerConfigService configService,
            SessionTestPaths paths,
            DefaultConfigPersistenceSettingsProvider settingsProvider = null)
        {
            return SessionTestSupport.BuildPersistence(configService, paths, settingsProvider);
        }
    }

    internal static class SessionTestSupport
    {
        internal static ConfigPersistenceService BuildPersistence(
            ServerConfigService configService,
            SessionTestPaths paths,
            DefaultConfigPersistenceSettingsProvider settingsProvider = null)
        {
            if (settingsProvider == null)
            {
                settingsProvider = new DefaultConfigPersistenceSettingsProvider();
                settingsProvider.Update(new ConfigPersistenceSettings
                {
                    AutoSnapshotMode = AutoSnapshotMode.Off,
                    AutoSnapshotAsync = false,
                });
            }

            return new ConfigPersistenceService(
                configService,
                new GameConfigWriterAdapter(),
                new ServerConfigSnapshotService(paths),
                new MonitoringDeploymentService(paths),
                settingsProvider,
                AppLogging.CreateLogger("Test"));
        }
    }

    internal sealed class SessionTestPaths : IAppPaths
    {
        public SessionTestPaths(string userDataDirectory)
        {
            UserDataDirectory = userDataDirectory;
            ApplicationBase = userDataDirectory;
            ConfigDirectory = Path.Combine(userDataDirectory, "config");
            LogDirectory = Path.Combine(userDataDirectory, "logs");
        }

        public string ApplicationBase { get; }

        public string UserDataDirectory { get; }

        public string ConfigDirectory { get; }

        public string LogDirectory { get; }
    }
}
