using System;
using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Session
{
    public sealed class ServerConfigSession
    {
        private readonly object gate = new object();
        private ArmaServerConfig model;
        private string fingerprint;
        private string persistedFingerprint;
        private long revision;
        private long persistedRevision;
        private SessionSyncState syncState = SessionSyncState.Saved;
        private string lastError = string.Empty;

        public ServerConfigSession(ArmaServerConfig source)
        {
            if (source == null)
            {
                throw new ArgumentNullException(nameof(source));
            }

            if (string.IsNullOrEmpty(source.ServerUUID))
            {
                throw new ArgumentException("服务器 UUID 不能为空。", nameof(source));
            }

            model = CloneConfig(source);
            fingerprint = ServerConfigSnapshotTracker.SerializeForCompare(model);
            persistedFingerprint = fingerprint;
        }

        public event EventHandler SessionChanged;

        public string ServerUuid
        {
            get
            {
                lock (gate)
                {
                    return model.ServerUUID;
                }
            }
        }

        public ArmaServerConfig Model
        {
            get
            {
                lock (gate)
                {
                    return model;
                }
            }
        }

        public long Revision
        {
            get
            {
                lock (gate)
                {
                    return revision;
                }
            }
        }

        public long PersistedRevision
        {
            get
            {
                lock (gate)
                {
                    return persistedRevision;
                }
            }
        }

        public SessionSyncState SyncState
        {
            get
            {
                lock (gate)
                {
                    return syncState;
                }
            }
        }

        public string Fingerprint
        {
            get
            {
                lock (gate)
                {
                    return fingerprint;
                }
            }
        }

        public string PersistedFingerprint
        {
            get
            {
                lock (gate)
                {
                    return persistedFingerprint;
                }
            }
        }

        public string LastError
        {
            get
            {
                lock (gate)
                {
                    return lastError;
                }
            }
        }

        public bool HasUnsavedChanges
        {
            get
            {
                lock (gate)
                {
                    if (syncState == SessionSyncState.Unsaved)
                    {
                        return true;
                    }

                    return revision != persistedRevision;
                }
            }
        }

        public void Patch(Action<ArmaServerConfig> mutate)
        {
            if (mutate == null)
            {
                throw new ArgumentNullException(nameof(mutate));
            }

            lock (gate)
            {
                mutate(model);
                revision++;
                fingerprint = ServerConfigSnapshotTracker.SerializeForCompare(model);
                if (syncState != SessionSyncState.Saving)
                {
                    syncState = SessionSyncState.Unsaved;
                }

                lastError = string.Empty;
            }

            RaiseSessionChanged();
        }

        public void ReplaceModel(ArmaServerConfig source, bool markSaved)
        {
            if (source == null)
            {
                throw new ArgumentNullException(nameof(source));
            }

            lock (gate)
            {
                model = CloneConfig(source);
                fingerprint = ServerConfigSnapshotTracker.SerializeForCompare(model);
                revision++;
                if (markSaved)
                {
                    persistedRevision = revision;
                    persistedFingerprint = fingerprint;
                    syncState = SessionSyncState.Saved;
                }
                else
                {
                    syncState = SessionSyncState.Unsaved;
                }

                lastError = string.Empty;
            }

            RaiseSessionChanged();
        }

        internal void SetSaving()
        {
            lock (gate)
            {
                syncState = SessionSyncState.Saving;
                lastError = string.Empty;
            }

            RaiseSessionChanged();
        }

        internal void MarkPersisted()
        {
            lock (gate)
            {
                persistedRevision = revision;
                persistedFingerprint = fingerprint;
                syncState = SessionSyncState.Saved;
                lastError = string.Empty;
            }

            RaiseSessionChanged();
        }

        internal void MarkError(string message)
        {
            lock (gate)
            {
                if (revision == persistedRevision)
                {
                    syncState = SessionSyncState.Saved;
                }
                else
                {
                    syncState = SessionSyncState.Unsaved;
                }

                if (string.IsNullOrEmpty(message))
                {
                    lastError = "操作失败。";
                }
                else
                {
                    lastError = message;
                }
            }

            RaiseSessionChanged();
        }

        private void RaiseSessionChanged()
        {
            EventHandler handler = SessionChanged;
            if (handler != null)
            {
                handler(this, EventArgs.Empty);
            }
        }

        private static ArmaServerConfig CloneConfig(ArmaServerConfig source)
        {
            string json = JsonSerializer.ToJson(source);
            ArmaServerConfig clone = JsonSerializer.FromJson<ArmaServerConfig>(json);
            if (clone == null)
            {
                throw new InvalidOperationException("无法复制服务器配置。");
            }

            return clone;
        }
    }
}
