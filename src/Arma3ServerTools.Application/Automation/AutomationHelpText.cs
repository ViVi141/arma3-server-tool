namespace Arma3ServerTools.Application.Automation
{
    internal static class AutomationHelpText
    {
        public static string GetText()
        {
            return "命令: status | stop | start | restart | write_cfg | switch_mission | download_mods | "
                + "read_logs | read_rpt | ensure_steamcmd | stop_steamcmd | create_server | first_server_setup | import_mods_html | "
                + "REST: GET /api/v1/actions；日志 GET /api/v1/servers/{uuid}/logs 与 /logs/read";
        }
    }
}
