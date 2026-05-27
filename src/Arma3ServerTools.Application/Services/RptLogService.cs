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

        public string FindLatestRptPath(ArmaServerConfig config)
        {
            if (config == null || string.IsNullOrWhiteSpace(config.ServerDir))
            {
                return null;
            }

            string bestPath = null;
            DateTime bestTime = DateTime.MinValue;
            foreach (string directory in GetSearchDirectories(config))
            {
                if (!Directory.Exists(directory))
                {
                    continue;
                }

                string[] files;
                try
                {
                    files = Directory.GetFiles(directory, "*.rpt", SearchOption.TopDirectoryOnly);
                }
                catch
                {
                    continue;
                }

                for (int i = 0; i < files.Length; i++)
                {
                    DateTime writeTime;
                    try
                    {
                        writeTime = File.GetLastWriteTimeUtc(files[i]);
                    }
                    catch
                    {
                        continue;
                    }

                    if (writeTime >= bestTime)
                    {
                        bestTime = writeTime;
                        bestPath = files[i];
                    }
                }
            }

            return bestPath;
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
