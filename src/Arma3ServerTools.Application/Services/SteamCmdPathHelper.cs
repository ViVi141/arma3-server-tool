using System;
using System.IO;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.Application.Services
{
    internal static class SteamCmdPathHelper
    {
        public static string NormalizeWorkshopRoot(IAppPaths paths, string workshopRoot)
        {
            if (paths == null)
            {
                return workshopRoot;
            }

            string preferredExtensionDirectory = SteamCmdBootstrapper.GetBundledDirectory(paths);
            if (string.IsNullOrWhiteSpace(workshopRoot))
            {
                return preferredExtensionDirectory;
            }

            string fullWorkshopRoot = Path.GetFullPath(workshopRoot.Trim());
            if (IsBlockedInstallDirectory(paths, fullWorkshopRoot))
            {
                return preferredExtensionDirectory;
            }

            return fullWorkshopRoot;
        }

        public static bool IsBlockedInstallDirectory(IAppPaths paths, string candidatePath)
        {
            if (paths == null || string.IsNullOrWhiteSpace(candidatePath))
            {
                return false;
            }

            if (PathsEqual(paths.ApplicationBase, paths.UserDataDirectory))
            {
                return false;
            }

            return IsUnderDirectory(candidatePath, paths.ApplicationBase);
        }

        public static bool IsUnderDirectory(string candidatePath, string rootDirectory)
        {
            if (string.IsNullOrWhiteSpace(candidatePath) || string.IsNullOrWhiteSpace(rootDirectory))
            {
                return false;
            }

            string normalizedCandidate = Path.GetFullPath(candidatePath)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string normalizedRoot = Path.GetFullPath(rootDirectory)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (string.Equals(normalizedCandidate, normalizedRoot, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            string prefix = normalizedRoot + Path.DirectorySeparatorChar;
            return normalizedCandidate.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
        }

        private static bool PathsEqual(string left, string right)
        {
            if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
            {
                return false;
            }

            return string.Equals(
                Path.GetFullPath(left).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
                Path.GetFullPath(right).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
                StringComparison.OrdinalIgnoreCase);
        }
    }
}
