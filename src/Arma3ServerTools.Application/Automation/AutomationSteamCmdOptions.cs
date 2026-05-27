namespace Arma3ServerTools.Application.Automation
{
    internal static class AutomationSteamCmdOptions
    {
        public static bool ResolveCaptureOutput(AutomationTaskDocument task, AutomationCommand command)
        {
            if (command != null && command.CaptureSteamCmdOutput.HasValue)
            {
                return command.CaptureSteamCmdOutput.Value;
            }

            if (task != null && task.CaptureSteamCmdOutput.HasValue)
            {
                return task.CaptureSteamCmdOutput.Value;
            }

            return true;
        }

        public static int ResolveTimeoutSeconds(AutomationTaskDocument task, AutomationCommand command)
        {
            if (command != null && command.SteamCmdTimeoutSeconds > 0)
            {
                return command.SteamCmdTimeoutSeconds;
            }

            if (task != null && task.SteamCmdTimeoutSeconds > 0)
            {
                return task.SteamCmdTimeoutSeconds;
            }

            return 3600;
        }
    }
}
