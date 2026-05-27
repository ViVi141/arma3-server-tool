using System;
using System.Collections.Generic;
using System.Net;

namespace Arma3ServerTools.Agent.Host.Configuration
{
    internal static class AgentCallerAllowlist
    {
        public static bool IsCallerAllowed(AgentHttpSettings http, IPAddress remoteAddress)
        {
            if (http == null)
            {
                return false;
            }

            if (remoteAddress == null)
            {
                return !http.RemoteAccessEnabled;
            }

            if (IsLoopback(remoteAddress))
            {
                return true;
            }

            if (!http.RemoteAccessEnabled)
            {
                return false;
            }

            if (http.AllowedCallerIps == null || http.AllowedCallerIps.Count == 0)
            {
                return true;
            }

            string remoteText = remoteAddress.ToString();
            if (remoteAddress.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6
                && remoteAddress.IsIPv4MappedToIPv6)
            {
                remoteText = remoteAddress.MapToIPv4().ToString();
            }

            for (int i = 0; i < http.AllowedCallerIps.Count; i++)
            {
                string allowed = http.AllowedCallerIps[i];
                if (string.IsNullOrWhiteSpace(allowed))
                {
                    continue;
                }

                if (string.Equals(allowed.Trim(), remoteText, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool IsLoopback(IPAddress address)
        {
            if (IPAddress.IsLoopback(address))
            {
                return true;
            }

            if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6
                && address.IsIPv4MappedToIPv6)
            {
                return IPAddress.IsLoopback(address.MapToIPv4());
            }

            return false;
        }
    }
}
