using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.IO;
using Newtonsoft.Json.Linq;

namespace Arma3ServerTools.Application.Services
{
    public sealed class ServerConfigSnapshotInfo
    {
        public string SnapshotId { get; set; } = string.Empty;

        public string ServerUuid { get; set; } = string.Empty;

        public DateTime CreatedAtUtc { get; set; }

        public string Reason { get; set; } = string.Empty;

        public string DisplayLabel { get; set; } = string.Empty;
    }

    /// <summary>
    /// Copies config/{uuid}/ packages to config-snapshots/{uuid}/{id}/ for backup and rollback.
    /// </summary>
    public sealed class ServerConfigSnapshotService
    {
        private const int MaxSnapshotsPerServer = 30;
        private const string SnapshotMetaFileName = "snapshot-meta.json";

        private readonly IAppPaths paths;

        public ServerConfigSnapshotService(IAppPaths paths)
        {
            this.paths = paths ?? throw new ArgumentNullException(nameof(paths));
        }

        public bool TryCreateAutoSnapshot(string serverUuid, string reason)
        {
            if (string.IsNullOrWhiteSpace(serverUuid))
            {
                return false;
            }

            string packageDir = GetPackageDirectory(serverUuid);
            if (!Directory.Exists(packageDir))
            {
                return false;
            }

            CreateSnapshot(serverUuid, reason);
            return true;
        }

        public ServerConfigSnapshotInfo CreateSnapshot(string serverUuid, string reason)
        {
            if (string.IsNullOrWhiteSpace(serverUuid))
            {
                throw new ArgumentException("服务器 UUID 不能为空。", nameof(serverUuid));
            }

            string packageDir = GetPackageDirectory(serverUuid);
            if (!Directory.Exists(packageDir))
            {
                throw new InvalidOperationException("配置包不存在，无法创建快照: " + serverUuid);
            }

            DateTime createdAtUtc = DateTime.UtcNow;
            string snapshotId = createdAtUtc.ToString("yyyyMMdd-HHmmss-fff");
            string snapshotDir = GetSnapshotDirectory(serverUuid, snapshotId);
            if (Directory.Exists(snapshotDir))
            {
                snapshotId = snapshotId + "-" + Guid.NewGuid().ToString("N").Substring(0, 6);
                snapshotDir = GetSnapshotDirectory(serverUuid, snapshotId);
            }

            Directory.CreateDirectory(snapshotDir);
            CopyDirectory(packageDir, snapshotDir);
            WriteMeta(snapshotDir, serverUuid, snapshotId, createdAtUtc, reason);

            PruneOldSnapshots(serverUuid);

            return BuildInfo(serverUuid, snapshotId, createdAtUtc, reason);
        }

        public IReadOnlyList<ServerConfigSnapshotInfo> ListSnapshots(string serverUuid)
        {
            var result = new List<ServerConfigSnapshotInfo>();
            if (string.IsNullOrWhiteSpace(serverUuid))
            {
                return result;
            }

            string serverRoot = GetServerSnapshotsRoot(serverUuid);
            if (!Directory.Exists(serverRoot))
            {
                return result;
            }

            foreach (string directory in Directory.GetDirectories(serverRoot))
            {
                string snapshotId = Path.GetFileName(directory);
                ServerConfigSnapshotInfo info = TryReadMeta(directory, serverUuid, snapshotId);
                if (info != null)
                {
                    result.Add(info);
                }
            }

            result.Sort((left, right) => right.CreatedAtUtc.CompareTo(left.CreatedAtUtc));
            return result;
        }

        public void RestoreSnapshot(string serverUuid, string snapshotId)
        {
            if (string.IsNullOrWhiteSpace(serverUuid))
            {
                throw new ArgumentException("服务器 UUID 不能为空。", nameof(serverUuid));
            }

            if (string.IsNullOrWhiteSpace(snapshotId))
            {
                throw new ArgumentException("快照 ID 不能为空。", nameof(snapshotId));
            }

            string snapshotDir = GetSnapshotDirectory(serverUuid, snapshotId);
            if (!Directory.Exists(snapshotDir))
            {
                throw new FileNotFoundException("找不到配置快照: " + snapshotId, snapshotDir);
            }

            string packageDir = GetPackageDirectory(serverUuid);
            if (Directory.Exists(packageDir))
            {
                Directory.Delete(packageDir, true);
            }

            Directory.CreateDirectory(Path.GetDirectoryName(packageDir) ?? paths.ConfigDirectory);
            CopyDirectory(snapshotDir, packageDir);

            string metaInPackage = Path.Combine(packageDir, SnapshotMetaFileName);
            if (File.Exists(metaInPackage))
            {
                File.Delete(metaInPackage);
            }

            string legacyPath = Path.Combine(paths.ConfigDirectory, serverUuid + ToolConstants.LegacyConfigFileExtension);
            if (File.Exists(legacyPath))
            {
                File.Delete(legacyPath);
            }
        }

        public void DeleteSnapshot(string serverUuid, string snapshotId)
        {
            string snapshotDir = GetSnapshotDirectory(serverUuid, snapshotId);
            if (Directory.Exists(snapshotDir))
            {
                Directory.Delete(snapshotDir, true);
            }
        }

        private void PruneOldSnapshots(string serverUuid)
        {
            IReadOnlyList<ServerConfigSnapshotInfo> snapshots = ListSnapshots(serverUuid);
            for (int i = MaxSnapshotsPerServer; i < snapshots.Count; i++)
            {
                DeleteSnapshot(serverUuid, snapshots[i].SnapshotId);
            }
        }

        private static void WriteMeta(
            string snapshotDir,
            string serverUuid,
            string snapshotId,
            DateTime createdAtUtc,
            string reason)
        {
            var meta = new JObject
            {
                ["serverUuid"] = serverUuid,
                ["snapshotId"] = snapshotId,
                ["createdAtUtc"] = createdAtUtc.ToString("o"),
                ["reason"] = reason ?? string.Empty,
            };
            string metaPath = Path.Combine(snapshotDir, SnapshotMetaFileName);
            File.WriteAllText(metaPath, meta.ToString(), Encoding.UTF8);
        }

        private static ServerConfigSnapshotInfo TryReadMeta(
            string snapshotDir,
            string serverUuid,
            string snapshotId)
        {
            string metaPath = Path.Combine(snapshotDir, SnapshotMetaFileName);
            DateTime createdAtUtc = Directory.GetCreationTimeUtc(snapshotDir);
            string reason = string.Empty;
            if (File.Exists(metaPath))
            {
                try
                {
                    JObject meta = JObject.Parse(File.ReadAllText(metaPath, Encoding.UTF8));
                    string createdText = meta.Value<string>("createdAtUtc");
                    if (!string.IsNullOrEmpty(createdText))
                    {
                        createdAtUtc = DateTime.Parse(createdText, null, System.Globalization.DateTimeStyles.RoundtripKind);
                    }

                    string reasonText = meta.Value<string>("reason");
                    if (!string.IsNullOrEmpty(reasonText))
                    {
                        reason = reasonText;
                    }
                }
                catch
                {
                }
            }

            return BuildInfo(serverUuid, snapshotId, createdAtUtc, reason);
        }

        private static ServerConfigSnapshotInfo BuildInfo(
            string serverUuid,
            string snapshotId,
            DateTime createdAtUtc,
            string reason)
        {
            DateTime localTime = createdAtUtc.ToLocalTime();
            string label = localTime.ToString("yyyy-MM-dd HH:mm:ss");
            if (!string.IsNullOrWhiteSpace(reason))
            {
                label = label + " · " + reason;
            }

            return new ServerConfigSnapshotInfo
            {
                ServerUuid = serverUuid,
                SnapshotId = snapshotId,
                CreatedAtUtc = createdAtUtc,
                Reason = reason ?? string.Empty,
                DisplayLabel = label,
            };
        }

        private string GetPackageDirectory(string serverUuid)
        {
            return Path.Combine(paths.ConfigDirectory, serverUuid);
        }

        private string GetServerSnapshotsRoot(string serverUuid)
        {
            return Path.Combine(paths.UserDataDirectory, "config-snapshots", serverUuid);
        }

        private string GetSnapshotDirectory(string serverUuid, string snapshotId)
        {
            return Path.Combine(GetServerSnapshotsRoot(serverUuid), snapshotId);
        }

        private static void CopyDirectory(string sourcePath, string targetPath)
        {
            Directory.CreateDirectory(targetPath);
            foreach (string filePath in Directory.GetFiles(sourcePath, "*", SearchOption.AllDirectories))
            {
                string relativePath = filePath.Substring(sourcePath.Length).TrimStart(
                    Path.DirectorySeparatorChar,
                    Path.AltDirectorySeparatorChar);
                string destinationPath = Path.Combine(targetPath, relativePath);
                string destinationDirectory = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(destinationDirectory))
                {
                    Directory.CreateDirectory(destinationDirectory);
                }

                File.Copy(filePath, destinationPath, true);
            }
        }
    }
}
