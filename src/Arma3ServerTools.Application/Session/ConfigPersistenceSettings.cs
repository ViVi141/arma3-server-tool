namespace Arma3ServerTools.Application.Session
{
    public sealed class ConfigPersistenceSettings
    {
        public AutoSnapshotMode AutoSnapshotMode { get; set; } = AutoSnapshotMode.BeforeWrite;

        public bool AutoSnapshotAsync { get; set; } = true;
    }
}
