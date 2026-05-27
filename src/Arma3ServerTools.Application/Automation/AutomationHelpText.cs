namespace Arma3ServerTools.Application.Automation
{
    internal static class AutomationHelpText
    {
        public static string GetText()
        {
            return "命令: status | stop [服名] | start [服名] | restart [服名] | mission <模板> | "
                + "mods download <id,id> | update server | write | "
                + "JSON 任务文件见 docs/agent-channels.md";
        }
    }
}
