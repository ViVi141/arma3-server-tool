using System.Collections.Generic;

namespace Arma3ServerTools.Application.Automation
{
    public sealed class AgentApiCatalogData
    {
        public List<AgentApiActionEntry> TaskActions { get; set; } = new List<AgentApiActionEntry>();

        public List<AgentApiEndpointEntry> RestEndpoints { get; set; } = new List<AgentApiEndpointEntry>();

        public List<AgentApiEndpointEntry> FileUploads { get; set; } = new List<AgentApiEndpointEntry>();

        public List<string> Deprecated { get; set; } = new List<string>();
    }

    public sealed class AgentApiActionEntry
    {
        public string Name { get; set; }

        public string Summary { get; set; }
    }

    public sealed class AgentApiEndpointEntry
    {
        public string Method { get; set; }

        public string Path { get; set; }

        public bool LegacyShape { get; set; }
    }

    public static class AgentApiCatalog
    {
        public static AgentApiCatalogData Build()
        {
            var data = new AgentApiCatalogData();
            data.TaskActions.AddRange(GetTaskActions());
            data.RestEndpoints.AddRange(GetRestEndpoints());
            data.FileUploads.AddRange(GetFileUploads());
            data.Deprecated.Add(
                "不存在 rename、list_details、get_config、config_set、read_config 等 task action；"
                + "请使用 REST（如 PUT /api/v1/servers/{uuid}/config）或 GET /api/v1/servers/{uuid}/config。");
            return data;
        }

        private static IEnumerable<AgentApiActionEntry> GetTaskActions()
        {
            yield return Entry("status", "查询运行态");
            yield return Entry("stop", "停止进程");
            yield return Entry("start", "启动（需游戏目录已有 cfg）");
            yield return Entry("restart", "停服 → 写 cfg → 启服");
            yield return Entry("write_cfg", "仅写入游戏目录 cfg（不写工具配置包）");
            yield return Entry("apply", "同 write_cfg");
            yield return Entry("switch_mission", "切换任务列表首项");
            yield return Entry("rcon_mission", "RCon 热加载任务");
            yield return Entry(
                "download_mods",
                "一次 SteamCMD 下载全部 modIds（默认捕获 steamCmdLog）；勿拆多条");
            yield return Entry(
                "import_mods_html",
                "一次解析完整 HTML 并下载/启用；勿拆 import 后再 download_mods");
            yield return Entry("update_server", "更新专用服务器文件");
            yield return Entry("save", "仅保存 A3ST 配置包");
            yield return Entry("help", "帮助文本");
            yield return Entry("ensure_steamcmd", "确保 steamcmd 可用");
            yield return Entry("stop_steamcmd", "强制终止 steamcmd.exe 并释放占用锁（别名 kill_steamcmd）");
            yield return Entry("steamcmd_status", "查询 SteamCMD 进程与工具锁状态");
            yield return Entry("install_dedicated_server", "安装/更新专用服务器");
            yield return Entry("create_server", "新建服务器配置");
            yield return Entry("preflight", "启动前检查");
            yield return Entry("first_server_setup", "首服组合流程");
            yield return Entry("scan_mods", "扫描模组目录");
            yield return Entry("enable_mods", "按 modId 启用模组");
            yield return Entry("rcon_players", "RCon 玩家列表");
            yield return Entry("rcon_kick", "RCon 踢人");
            yield return Entry("rcon_ban", "RCon 封禁");
            yield return Entry("rcon_broadcast", "RCon 全服公告");
            yield return Entry("rcon_lock", "RCon 锁定服务器");
            yield return Entry("rcon_unlock", "RCon 解锁服务器");
            yield return Entry("sync_cron_jobs", "同步定时任务");
            yield return Entry("local_ban_add", "添加本地封禁");
            yield return Entry("local_ban_remove", "移除本地封禁");
            yield return Entry("read_logs", "读取游戏日志（RPT / BattlEye 等，尾部行）");
            yield return Entry("read_rpt", "同 read_logs，固定 kind=rpt");
        }

        private static IEnumerable<AgentApiEndpointEntry> GetRestEndpoints()
        {
            yield return Endpoint("GET", "/api/v1/health", true);
            yield return Endpoint("GET", "/api/v1/actions", false);
            yield return Endpoint("GET", "/api/v1/servers", true);
            yield return Endpoint("GET", "/api/v1/servers/{uuid}/status", true);
            yield return Endpoint("POST", "/api/v1/task", false);
            yield return Endpoint("GET", "/api/v1/tasks/{taskId}", false);
            yield return Endpoint("GET", "/api/v1/servers/{uuid}/config", false);
            yield return Endpoint("PUT", "/api/v1/servers/{uuid}/config", false);
            yield return Endpoint("POST", "/api/v1/servers", false);
            yield return Endpoint("POST", "/api/v1/servers/{uuid}/clone", false);
            yield return Endpoint("DELETE", "/api/v1/servers/{uuid}", false);
            yield return Endpoint("PUT", "/api/v1/servers/{uuid}/rename", false);
            yield return Endpoint("GET", "/api/v1/settings/steamcmd", false);
            yield return Endpoint("PUT", "/api/v1/settings/steamcmd", false);
            yield return Endpoint("GET", "/api/v1/steamcmd/log", false);
            yield return Endpoint("GET", "/api/v1/steamcmd/status", false);
            yield return Endpoint("POST", "/api/v1/steamcmd/stop", false);
            yield return Endpoint("GET", "/api/v1/servers/{uuid}/preflight", false);
            yield return Endpoint("GET", "/api/v1/servers/{uuid}/rpt", false);
            yield return Endpoint("GET", "/api/v1/servers/{uuid}/logs", false);
            yield return Endpoint("GET", "/api/v1/servers/{uuid}/logs/read", false);
            yield return Endpoint("GET", "/api/v1/servers/{uuid}/monitoring/summary", false);
            yield return Endpoint("GET", "/api/v1/openapi.json", false);
        }

        private static IEnumerable<AgentApiEndpointEntry> GetFileUploads()
        {
            yield return Endpoint("POST", "/api/v1/servers/{uuid}/files/mod-list-html", false);
            yield return Endpoint("POST", "/api/v1/servers/{uuid}/files/mission-pbo", false);
        }

        private static AgentApiActionEntry Entry(string name, string summary)
        {
            return new AgentApiActionEntry { Name = name, Summary = summary };
        }

        private static AgentApiEndpointEntry Endpoint(string method, string path, bool legacyShape)
        {
            return new AgentApiEndpointEntry
            {
                Method = method,
                Path = path,
                LegacyShape = legacyShape,
            };
        }
    }
}
