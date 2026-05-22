using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class BansService
    {
        public static readonly Encoding Utf8NoBom = new UTF8Encoding(false);

        public IReadOnlyList<LocalBansEntity> LoadLocalBans(string serverDir, string serverUuid)
        {
            var result = new List<LocalBansEntity>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string path in GetBanFilePaths(serverDir, serverUuid))
            {
                if (!File.Exists(path))
                {
                    continue;
                }

                string content = File.ReadAllText(path, Utf8NoBom);
                AppendParsedBans(content, result, seen);
            }

            return result;
        }

        public OperationResult SaveLocalBans(string serverDir, string serverUuid, IEnumerable<LocalBansEntity> bans)
        {
            var builder = new StringBuilder();
            foreach (LocalBansEntity ban in bans)
            {
                if (ban == null || string.IsNullOrWhiteSpace(ban.GUID))
                {
                    continue;
                }

                string expiry = ban.Time;
                if (string.Equals(expiry, "永久封禁", StringComparison.OrdinalIgnoreCase))
                {
                    expiry = "-1";
                }

                builder.Append(ban.GUID).Append(' ').Append(expiry).Append(' ').AppendLine(ban.Reason ?? string.Empty);
            }

            string payload = builder.ToString();
            foreach (string path in GetBanFilePaths(serverDir, serverUuid))
            {
                try
                {
                    string directory = Path.GetDirectoryName(path);
                    if (!string.IsNullOrEmpty(directory))
                    {
                        Directory.CreateDirectory(directory);
                    }

                    File.WriteAllText(path, payload, Utf8NoBom);
                }
                catch (Exception ex)
                {
                    return OperationResult.Fail("保存封禁列表失败 [" + path + "]: " + ex.Message);
                }
            }

            return OperationResult.Ok();
        }

        private static IEnumerable<string> GetBanFilePaths(string serverDir, string serverUuid)
        {
            yield return serverDir + @"\bans.txt";
            yield return serverDir + @"\" + ToolConstants.ServerConfigFolderName + @"\" + serverUuid + @"\BattlEye\bans.txt";
            yield return serverDir + @"\" + ToolConstants.ServerConfigFolderName + @"\" + serverUuid + @"\Users\" + serverUuid + @"\bans.txt";
        }

        private static void AppendParsedBans(
            string data,
            List<LocalBansEntity> target,
            HashSet<string> seen)
        {
            if (string.IsNullOrEmpty(data))
            {
                return;
            }

            string[] lines = data.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string line in lines)
            {
                string[] parts = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 0 || string.IsNullOrWhiteSpace(parts[0]))
                {
                    continue;
                }

                if (!seen.Add(parts[0]))
                {
                    continue;
                }

                string expiry = parts.Length > 1 ? parts[1] : string.Empty;
                if (string.Equals(expiry, "-1", StringComparison.Ordinal))
                {
                    expiry = "永久封禁";
                }

                string reason = parts.Length > 2 ? parts[2] : string.Empty;
                target.Add(new LocalBansEntity(parts[0], expiry, reason, string.Empty, string.Empty));
            }
        }
    }
}
