using System;
using System.Reflection;

namespace Arma3ServerTools.App.WinForms
{
    internal static class AppVersion
    {
        public static string GetDisplayVersion()
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();
            if (informational != null && !string.IsNullOrWhiteSpace(informational.InformationalVersion))
            {
                string value = informational.InformationalVersion;
                int plusIndex = value.IndexOf('+');
                if (plusIndex > 0)
                {
                    return value.Substring(0, plusIndex);
                }

                return value;
            }

            Version version = assembly.GetName().Version;
            if (version == null)
            {
                return "未知";
            }

            return version.ToString();
        }
    }
}
