using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Validation;

namespace Arma3ServerTools.App.WinForms
{
    internal static class WizardPathValidation
    {
        public static bool HasInvalidToolPaths(IAppPaths paths)
        {
            if (paths == null)
            {
                return false;
            }

            if (PathValidation.ContainsChinese(paths.ApplicationBase))
            {
                return true;
            }

            if (PathValidation.ContainsChinese(paths.UserDataDirectory))
            {
                return true;
            }

            return false;
        }
    }
}
