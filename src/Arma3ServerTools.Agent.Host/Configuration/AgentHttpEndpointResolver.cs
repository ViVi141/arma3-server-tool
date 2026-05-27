using System;
using System.Collections.Generic;

namespace Arma3ServerTools.Agent.Host.Configuration
{
    internal static class AgentHttpEndpointResolver
    {
        public static IList<string> ResolveListenPrefixes(AgentHttpSettings http)
        {
            if (http == null)
            {
                throw new ArgumentNullException(nameof(http));
            }

            if (!string.IsNullOrWhiteSpace(http.ListenPrefix))
            {
                return new List<string> { NormalizePrefix(http.ListenPrefix) };
            }

            string host = ResolveListenHost(http);
            int port = http.ListenPort > 0 ? http.ListenPort : 19580;
            return new List<string> { NormalizePrefix("http://" + host + ":" + port + "/") };
        }

        public static string ResolvePublicBaseUrl(AgentHttpSettings http)
        {
            if (!string.IsNullOrWhiteSpace(http.PublicBaseUrl))
            {
                return http.PublicBaseUrl.TrimEnd('/');
            }

            IList<string> prefixes = ResolveListenPrefixes(http);
            if (prefixes.Count == 0)
            {
                return "http://127.0.0.1:19580";
            }

            string prefix = prefixes[0].TrimEnd('/');
            if (prefix.EndsWith("/", StringComparison.Ordinal))
            {
                prefix = prefix.Substring(0, prefix.Length - 1);
            }

            if (prefix.Contains("+", StringComparison.Ordinal)
                || prefix.Contains("*", StringComparison.Ordinal))
            {
                return "http://<开服机IP>:" + http.ListenPort;
            }

            return prefix;
        }

        private static string ResolveListenHost(AgentHttpSettings http)
        {
            if (!string.IsNullOrWhiteSpace(http.ListenHost))
            {
                return http.ListenHost.Trim();
            }

            if (http.RemoteAccessEnabled)
            {
                return "+";
            }

            return "127.0.0.1";
        }

        private static string NormalizePrefix(string prefix)
        {
            if (string.IsNullOrWhiteSpace(prefix))
            {
                return "http://127.0.0.1:19580/";
            }

            string normalized = prefix.Trim();
            if (!normalized.EndsWith("/", StringComparison.Ordinal))
            {
                normalized += "/";
            }

            return normalized;
        }
    }
}
