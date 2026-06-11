namespace Arma3ServerTools.Application.Session
{
    /// <summary>
    /// In-memory session persistence state (distinct from UI-only ConfigSyncState).
    /// </summary>
    public enum SessionSyncState
    {
        Saved = 0,
        Unsaved = 1,
        Saving = 2,
        Error = 3,
    }
}
