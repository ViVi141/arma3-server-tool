using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class RptLogService
    {
        private const int TailReadWindowBytes = 256 * 1024;

        private static readonly string[] BattlEyeLogPatterns = { "*.log", "*.txt" };

        private static readonly HashSet<string> BattlEyeExcludedFileNames = new HashSet<string>(
            StringComparer.OrdinalIgnoreCase)
        {
            "bans.txt",
            "BEServer_x64.cfg",
            "BEServer.cfg",
        };

        public string FindLatestRptPath(ArmaServerConfig config)
        {
            GameLogFileEntry latest = FindLatestEntry(config, GameLogKinds.Rpt);
            if (latest == null)
            {
                return null;
            }

            return latest.Path;
        }

        public string FindLatestBattlEyeLogPath(ArmaServerConfig config)
        {
            GameLogFileEntry latest = FindLatestEntry(config, GameLogKinds.BattlEye);
            if (latest == null)
            {
                return null;
            }

            return latest.Path;
        }

        public IReadOnlyList<GameLogFileEntry> ListLogFiles(ArmaServerConfig config, string kind)
        {
            if (config == null || string.IsNullOrWhiteSpace(config.ServerDir))
            {
                return Array.Empty<GameLogFileEntry>();
            }

            string normalizedKind = NormalizeKind(kind);
            var entries = new List<GameLogFileEntry>();
            if (normalizedKind == GameLogKinds.Rpt || normalizedKind == GameLogKinds.All)
            {
                CollectRptFiles(config, entries);
            }

            if (normalizedKind == GameLogKinds.BattlEye || normalizedKind == GameLogKinds.All)
            {
                CollectBattlEyeLogFiles(config, entries);
            }

            entries.Sort(CompareEntriesByTimeDesc);
            return entries;
        }

        public GameLogReadResult ReadGameLog(
            ArmaServerConfig config,
            string kind,
            int tailLines,
            string fileName)
        {
            string requestedKind = string.IsNullOrWhiteSpace(kind)
                ? GameLogKinds.Rpt
                : kind.Trim().ToLowerInvariant();
            var result = new GameLogReadResult
            {
                Kind = requestedKind,
                TailLines = tailLines < 1 ? 200 : tailLines,
                AvailableFiles = ListLogFiles(config, GameLogKinds.All),
            };

            if (config == null || string.IsNullOrWhiteSpace(config.ServerDir))
            {
                result.Found = false;
                result.Content = string.Empty;
                return result;
            }

            string path = null;
            if (!string.IsNullOrWhiteSpace(fileName))
            {
                if (!TryResolveAllowedLogPath(config, fileName.Trim(), out path))
                {
                    result.Found = false;
                    result.Content = "不允许读取该路径的日志（仅允许服务器目录下的日志文件名）。";
                    return result;
                }
            }
            else if (requestedKind == GameLogKinds.All || requestedKind == "latest")
            {
                IReadOnlyList<GameLogFileEntry> allEntries = ListLogFiles(config, GameLogKinds.All);
                if (allEntries.Count > 0)
                {
                    path = allEntries[0].Path;
                    result.Kind = allEntries[0].Kind;
                }
            }
            else
            {
                GameLogFileEntry latest = FindLatestEntry(config, NormalizeKind(requestedKind));
                if (latest != null)
                {
                    path = latest.Path;
                    result.Kind = latest.Kind;
                }
            }

            if (string.IsNullOrEmpty(path))
            {
                result.Found = false;
                result.Path = string.Empty;
                result.Content = string.Empty;
                return result;
            }

            result.Found = true;
            result.Path = path;
            result.Content = ReadTail(path, result.TailLines);
            return result;
        }

        public string ReadTail(string filePath, int maxLines)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                return string.Empty;
            }

            if (maxLines < 1)
            {
                maxLines = 200;
            }

            var lines = new List<string>();
            using (var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                long startOffset = 0;
                if (stream.Length > TailReadWindowBytes)
                {
                    startOffset = stream.Length - TailReadWindowBytes;
                }

                stream.Seek(startOffset, SeekOrigin.Begin);
                using (var reader = new StreamReader(stream))
                {
                    if (startOffset > 0)
                    {
                        reader.ReadLine();
                    }

                    string line;
                    while ((line = reader.ReadLine()) != null)
                    {
                        lines.Add(line);
                        if (lines.Count > maxLines)
                        {
                            lines.RemoveAt(0);
                        }
                    }
                }
            }

            return string.Join(Environment.NewLine, lines);
        }

        public string ReadDelta(string filePath, ref long lastPosition)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                lastPosition = 0;
                return string.Empty;
            }

            using (var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                if (lastPosition < 0 || lastPosition > stream.Length)
                {
                    lastPosition = 0;
                }

                stream.Seek(lastPosition, SeekOrigin.Begin);
                using (var reader = new StreamReader(stream))
                {
                    string content = reader.ReadToEnd();
                    lastPosition = stream.Position;
                    return content;
                }
            }
        }

        public bool TryResolveAllowedLogPath(ArmaServerConfig config, string fileName, out string fullPath)
        {
            fullPath = null;
            if (config == null || string.IsNullOrWhiteSpace(config.ServerDir) || string.IsNullOrWhiteSpace(fileName))
            {
                return false;
            }

            if (fileName.IndexOf("..", StringComparison.Ordinal) >= 0)
            {
                return false;
            }

            string candidate = fileName;
            if (!Path.IsPathRooted(fileName))
            {
                IReadOnlyList<GameLogFileEntry> entries = ListLogFiles(config, GameLogKinds.All);
                for (int i = 0; i < entries.Count; i++)
                {
                    if (string.Equals(entries[i].FileName, fileName, StringComparison.OrdinalIgnoreCase))
                    {
                        fullPath = entries[i].Path;
                        return IsPathUnderAllowedRoots(config, fullPath);
                    }
                }

                return false;
            }

            try
            {
                candidate = Path.GetFullPath(fileName);
            }
            catch
            {
                return false;
            }

            if (!IsPathUnderAllowedRoots(config, candidate))
            {
                return false;
            }

            if (!File.Exists(candidate))
            {
                return false;
            }

            fullPath = candidate;
            return true;
        }

        private GameLogFileEntry FindLatestEntry(ArmaServerConfig config, string kind)
        {
            string listKind = NormalizeKind(kind);
            if (listKind == GameLogKinds.All)
            {
                listKind = GameLogKinds.Rpt;
            }

            IReadOnlyList<GameLogFileEntry> entries = ListLogFiles(config, listKind);
            if (entries.Count == 0)
            {
                return null;
            }

            return entries[0];
        }

        private static void CollectRptFiles(ArmaServerConfig config, List<GameLogFileEntry> entries)
        {
            foreach (string directory in GetProfileSearchDirectories(config))
            {
                TryCollectFiles(directory, "*.rpt", GameLogKinds.Rpt, entries, null);
            }
        }

        private static void CollectBattlEyeLogFiles(ArmaServerConfig config, List<GameLogFileEntry> entries)
        {
            foreach (string directory in GetBattlEyeSearchDirectories(config))
            {
                for (int i = 0; i < BattlEyeLogPatterns.Length; i++)
                {
                    TryCollectFiles(
                        directory,
                        BattlEyeLogPatterns[i],
                        GameLogKinds.BattlEye,
                        entries,
                        IsBattlEyeLogFileName);
                }
            }
        }

        private static bool IsBattlEyeLogFileName(string fileName)
        {
            if (BattlEyeExcludedFileNames.Contains(fileName))
            {
                return false;
            }

            if (fileName.StartsWith("BEServer", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            return true;
        }

        private static void TryCollectFiles(
            string directory,
            string pattern,
            string kind,
            List<GameLogFileEntry> entries,
            Func<string, bool> fileNameFilter)
        {
            if (!Directory.Exists(directory))
            {
                return;
            }

            string[] files;
            try
            {
                files = Directory.GetFiles(directory, pattern, SearchOption.TopDirectoryOnly);
            }
            catch
            {
                return;
            }

            for (int i = 0; i < files.Length; i++)
            {
                string fileName = Path.GetFileName(files[i]);
                if (fileNameFilter != null && !fileNameFilter(fileName))
                {
                    continue;
                }

                try
                {
                    FileInfo info = new FileInfo(files[i]);
                    entries.Add(new GameLogFileEntry
                    {
                        Kind = kind,
                        Path = files[i],
                        FileName = fileName,
                        LastWriteUtc = info.LastWriteTimeUtc,
                        SizeBytes = info.Length,
                    });
                }
                catch
                {
                }
            }
        }

        private static int CompareEntriesByTimeDesc(GameLogFileEntry left, GameLogFileEntry right)
        {
            int timeCompare = right.LastWriteUtc.CompareTo(left.LastWriteUtc);
            if (timeCompare != 0)
            {
                return timeCompare;
            }

            return string.Compare(left.Path, right.Path, StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeKind(string kind)
        {
            if (string.IsNullOrWhiteSpace(kind))
            {
                return GameLogKinds.Rpt;
            }

            string normalized = kind.Trim().ToLowerInvariant();
            if (normalized == GameLogKinds.BattlEye || normalized == "be")
            {
                return GameLogKinds.BattlEye;
            }

            if (normalized == GameLogKinds.All || normalized == "latest")
            {
                return GameLogKinds.All;
            }

            if (normalized == GameLogKinds.Rpt)
            {
                return GameLogKinds.Rpt;
            }

            return GameLogKinds.Rpt;
        }

        private static bool IsPathUnderAllowedRoots(ArmaServerConfig config, string fullPath)
        {
            if (string.IsNullOrWhiteSpace(fullPath))
            {
                return false;
            }

            string normalizedPath;
            try
            {
                normalizedPath = Path.GetFullPath(fullPath);
            }
            catch
            {
                return false;
            }

            foreach (string root in GetAllowedLogRoots(config))
            {
                string normalizedRoot;
                try
                {
                    normalizedRoot = Path.GetFullPath(root).TrimEnd(
                        Path.DirectorySeparatorChar,
                        Path.AltDirectorySeparatorChar);
                }
                catch
                {
                    continue;
                }

                if (normalizedPath.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(normalizedPath, normalizedRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static IEnumerable<string> GetAllowedLogRoots(ArmaServerConfig config)
        {
            foreach (string directory in GetProfileSearchDirectories(config))
            {
                yield return directory;
            }

            foreach (string directory in GetBattlEyeSearchDirectories(config))
            {
                yield return directory;
            }
        }

        private static IEnumerable<string> GetProfileSearchDirectories(ArmaServerConfig config)
        {
            return GetSearchDirectories(config);
        }

        private static IEnumerable<string> GetBattlEyeSearchDirectories(ArmaServerConfig config)
        {
            yield return Path.Combine(config.ServerDir, "BattlEye");
            if (!string.IsNullOrEmpty(config.ServerUUID))
            {
                string profileRoot = Path.Combine(
                    config.ServerDir,
                    ToolConstants.ServerConfigFolderName,
                    config.ServerUUID);
                yield return Path.Combine(profileRoot, "BattlEye");
                yield return Path.Combine(profileRoot, "Users", config.ServerUUID, "BattlEye");
            }
        }

        private static IEnumerable<string> GetSearchDirectories(ArmaServerConfig config)
        {
            yield return config.ServerDir;
            if (!string.IsNullOrEmpty(config.ServerUUID))
            {
                yield return Path.Combine(
                    config.ServerDir,
                    ToolConstants.ServerConfigFolderName,
                    config.ServerUUID,
                    "Users",
                    config.ServerUUID);
                yield return Path.Combine(
                    config.ServerDir,
                    ToolConstants.ServerConfigFolderName,
                    config.ServerUUID);
            }
        }
    }
}
