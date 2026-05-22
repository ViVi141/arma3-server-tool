using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Arma3ServerTools.Application.Services
{
    public sealed class LauncherHtmlModEntry
    {
        public ulong ModId { get; set; }

        public string DisplayName { get; set; }

        public bool Selected { get; set; }
    }

    public static class LauncherHtmlModParser
    {
        private static readonly Regex ModContainerRowPattern = new Regex(
            "<tr[^>]*data-type\\s*=\\s*[\"']ModContainer[\"'][^>]*>[\\s\\S]*?</tr>",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex DisplayNamePattern = new Regex(
            "data-type\\s*=\\s*[\"']DisplayName[\"'][^>]*>([^<]+)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex WorkshopUrlPattern = new Regex(
            "filedetails/\\?id=(\\d{5,12})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex LegacyIdPattern = new Regex(
            "\\bid\\s*=\\s*(\\d{5,12})\\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static List<LauncherHtmlModEntry> Parse(string html)
        {
            var result = new List<LauncherHtmlModEntry>();
            if (string.IsNullOrWhiteSpace(html))
            {
                return result;
            }

            var seen = new HashSet<ulong>();
            MatchCollection rows = ModContainerRowPattern.Matches(html);
            for (int i = 0; i < rows.Count; i++)
            {
                string rowHtml = rows[i].Value;
                ulong modId = ExtractWorkshopId(rowHtml);
                if (modId == 0 || !seen.Add(modId))
                {
                    continue;
                }

                string displayName = ExtractDisplayName(rowHtml);
                result.Add(new LauncherHtmlModEntry
                {
                    ModId = modId,
                    DisplayName = displayName,
                    Selected = true,
                });
            }

            if (result.Count > 0)
            {
                return result;
            }

            AddFromPattern(html, WorkshopUrlPattern, seen, result, true);
            if (result.Count > 0)
            {
                return result;
            }

            AddFromPattern(html, LegacyIdPattern, seen, result, false);
            return result;
        }

        private static void AddFromPattern(
            string html,
            Regex pattern,
            HashSet<ulong> seen,
            List<LauncherHtmlModEntry> result,
            bool useGroupOne)
        {
            MatchCollection matches = pattern.Matches(html);
            for (int i = 0; i < matches.Count; i++)
            {
                string idText = useGroupOne ? matches[i].Groups[1].Value : matches[i].Groups[1].Value;
                ulong modId;
                if (!ulong.TryParse(idText, out modId) || modId == 0 || !seen.Add(modId))
                {
                    continue;
                }

                result.Add(new LauncherHtmlModEntry
                {
                    ModId = modId,
                    DisplayName = "Workshop " + modId,
                    Selected = true,
                });
            }
        }

        private static ulong ExtractWorkshopId(string rowHtml)
        {
            Match match = WorkshopUrlPattern.Match(rowHtml);
            if (!match.Success)
            {
                match = LegacyIdPattern.Match(rowHtml);
            }

            if (!match.Success)
            {
                return 0;
            }

            ulong modId;
            if (ulong.TryParse(match.Groups[1].Value, out modId))
            {
                return modId;
            }

            return 0;
        }

        private static string ExtractDisplayName(string rowHtml)
        {
            Match match = DisplayNamePattern.Match(rowHtml);
            if (!match.Success)
            {
                return string.Empty;
            }

            return DecodeHtmlText(match.Groups[1].Value);
        }

        private static string DecodeHtmlText(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return string.Empty;
            }

            return value
                .Replace("&amp;", "&")
                .Replace("&lt;", "<")
                .Replace("&gt;", ">")
                .Replace("&quot;", "\"")
                .Replace("&#39;", "'")
                .Trim();
        }
    }
}
