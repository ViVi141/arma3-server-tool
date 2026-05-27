using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamWorkshopApiService
    {
        public const string PublishedFileDetailsUrl =
            "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";

        private static readonly HttpClient HttpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(15),
        };

        public List<SteamWorkshopModInfo> FetchModDetails(IEnumerable<ulong> modIds)
        {
            return FetchModDetailsAsync(modIds, CancellationToken.None).GetAwaiter().GetResult();
        }

        public async Task<List<SteamWorkshopModInfo>> FetchModDetailsAsync(
            IEnumerable<ulong> modIds,
            CancellationToken cancellationToken)
        {
            var ids = new List<ulong>();
            foreach (ulong modId in modIds)
            {
                if (modId > 0)
                {
                    ids.Add(modId);
                }
            }

            if (ids.Count == 0)
            {
                return new List<SteamWorkshopModInfo>();
            }

            try
            {
                string responseBody = await PostDetailsRequestAsync(ids, cancellationToken).ConfigureAwait(false);
                return ParseModDetails(responseBody, ids);
            }
            catch
            {
                return BuildFallbackDetails(ids);
            }
        }

        private static async Task<string> PostDetailsRequestAsync(List<ulong> ids, CancellationToken cancellationToken)
        {
            var builder = new StringBuilder();
            builder.Append("itemcount=").Append(ids.Count);
            for (int i = 0; i < ids.Count; i++)
            {
                builder.Append("&publishedfileids[").Append(i).Append("]=").Append(ids[i]);
            }

            using (var content = new StringContent(
                builder.ToString(),
                Encoding.UTF8,
                "application/x-www-form-urlencoded"))
            {
                using (HttpResponseMessage response = await HttpClient
                    .PostAsync(PublishedFileDetailsUrl, content, cancellationToken)
                    .ConfigureAwait(false))
                {
                    response.EnsureSuccessStatusCode();
                    return await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                }
            }
        }

        public static List<SteamWorkshopModInfo> ParseModDetails(string json, List<ulong> requestedIds)
        {
            var result = new List<SteamWorkshopModInfo>();
            if (string.IsNullOrWhiteSpace(json))
            {
                return BuildFallbackDetails(requestedIds);
            }

            foreach (ulong modId in requestedIds)
            {
                string idToken = "\"publishedfileid\": \"" + modId + "\"";
                string idTokenAlt = "\"publishedfileid\":" + modId;
                int index = json.IndexOf(idToken, StringComparison.OrdinalIgnoreCase);
                if (index < 0)
                {
                    index = json.IndexOf(idTokenAlt, StringComparison.OrdinalIgnoreCase);
                }

                if (index < 0)
                {
                    continue;
                }

                int start = Math.Max(0, index - 200);
                int length = Math.Min(json.Length - start, 4000);
                string segment = json.Substring(start, length);
                if (segment.Contains("creator_app_id") && !segment.Contains("107410"))
                {
                    continue;
                }

                var info = new SteamWorkshopModInfo
                {
                    ModId = modId,
                    Title = ExtractJsonString(segment, "title"),
                    Description = ExtractJsonString(segment, "description"),
                    FileSizeMb = FormatFileSize(ExtractJsonString(segment, "file_size")),
                    Selected = true,
                };

                if (string.IsNullOrEmpty(info.Title))
                {
                    info.Title = "Workshop " + modId;
                }

                result.Add(info);
            }

            if (result.Count == 0)
            {
                return BuildFallbackDetails(requestedIds);
            }

            return result;
        }

        private static List<SteamWorkshopModInfo> BuildFallbackDetails(List<ulong> ids)
        {
            var result = new List<SteamWorkshopModInfo>();
            foreach (ulong modId in ids)
            {
                result.Add(new SteamWorkshopModInfo
                {
                    ModId = modId,
                    Title = "Workshop " + modId,
                    Description = "无法从 Steam API 加载详情，仍可继续下载。",
                    FileSizeMb = "-",
                    Selected = true,
                });
            }

            return result;
        }

        private static string ExtractJsonString(string json, string fieldName)
        {
            Match match = Regex.Match(
                json,
                "\\\"" + fieldName + "\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\\\\\"])*)\\\"",
                RegexOptions.IgnoreCase);
            if (!match.Success)
            {
                return string.Empty;
            }

            return UnescapeJson(match.Groups[1].Value);
        }

        private static string UnescapeJson(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return value
                .Replace("\\\"", "\"")
                .Replace("\\n", " ")
                .Replace("\\r", " ")
                .Replace("\\t", " ");
        }

        private static string FormatFileSize(string rawSize)
        {
            long bytes;
            if (!long.TryParse(rawSize, out bytes) || bytes <= 0)
            {
                return "-";
            }

            double megabytes = bytes / 1024d / 1024d;
            return Math.Round(megabytes, 2).ToString() + " MB";
        }
    }

    public sealed class SteamWorkshopModInfo
    {
        public ulong ModId { get; set; }

        public string Title { get; set; }

        public string Description { get; set; }

        public string FileSizeMb { get; set; }

        public bool Selected { get; set; }
    }
}
