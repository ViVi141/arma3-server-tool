import { getAllTabs } from "@/config/tab-registry";
import { modeForTab } from "@/config/console-modes";
import type { ServerSummary } from "@a3st/api-client";

export type CommandGroup = "tab" | "setting" | "server" | "action";

export interface CommandPaletteItem {
  id: string;
  group: CommandGroup;
  groupLabel: string;
  title: string;
  subtitle: string;
  icon: string;
  badge?: string;
  disabled?: boolean;
  tab?: string;
  highlight?: string;
  /** 备用 needle：首选项在目标视图里找不到对应行时按顺序重试（中文标签优先） */
  highlightAliases?: string[];
  serverUuid?: string;
  actionId?: string;
}

interface SettingIndexEntry {
  id: string;
  label: string;
  section: string;
  tab: string;
  icon: string;
  keywords: string[];
  advancedOnly?: boolean;
}

const MODE_LABELS: Record<string, string> = {
  overview: "概览",
  deploy: "部署",
  workshop: "工坊",
  logs: "日志",
  config: "配置",
  system: "系统",
};

const SETTING_ENTRIES: SettingIndexEntry[] = [
  // BasicSettings
  { id: "s-config-name", label: "配置名称", section: "基本设置 · 基础", tab: "basic", icon: "tune", keywords: ["configName", "配置名称", "实例名"] },
  { id: "s-server-dir", label: "服务器目录", section: "基本设置 · 路径", tab: "basic", icon: "folder_open", keywords: ["serverDir", "服务器目录", "路径"] },
  { id: "s-executable", label: "可执行文件 / x64", section: "基本设置 · 路径", tab: "basic", icon: "tune", keywords: ["executable", "x64", "arma3server", "可执行文件"] },
  { id: "s-hostname", label: "服务器名 (hostname)", section: "基本设置 · 联机", tab: "basic", icon: "dns", keywords: ["hostname", "服务器名", "名称"] },
  { id: "s-max-players", label: "最大玩家 (maxPlayers)", section: "基本设置 · 联机", tab: "basic", icon: "tune", keywords: ["maxPlayers", "最大玩家", "人数上限"] },
  { id: "s-port", label: "端口 (port)", section: "基本设置 · 联机", tab: "basic", icon: "lan", keywords: ["port", "端口", "2302", "UDP"] },
  { id: "s-password", label: "连接密码 / 管理员密码", section: "基本设置 · 密码", tab: "basic", icon: "shield", keywords: ["password", "passwordAdmin", "密码", "管理员密码"] },
  { id: "s-motd", label: "欢迎语 (MOTD)", section: "基本设置 · 公告", tab: "basic", icon: "article", keywords: ["motd", "motdInterval", "欢迎语", "公告"] },
  { id: "s-von", label: "语音 (VoN / 编码)", section: "基本设置 · 语音", tab: "basic", icon: "tune", keywords: ["disableVoN", "vonCodecQuality", "vonCodec", "SPEEX", "OPUS", "语音", "VoN"] },
  { id: "s-hc", label: "无头客户端 (Headless Client)", section: "基本设置 · HC", tab: "basic", icon: "dns", keywords: ["enableHeadlessClient", "headlessClients", "localClient", "HC", "无头客户端"] },
  { id: "s-rules", label: "持久化 / 自动初始化 / 跳过大厅 / 地图绘图 / 飞行模型 / 反作弊", section: "基本设置 · 选项", tab: "basic", icon: "tune", keywords: ["persistent", "autoInit", "skipLobby", "drawingInMap", "statisticsEnabled", "forceRotorLibSimulation", "battlEye", "跳过大厅", "地图绘图", "飞行模型"] },
  { id: "s-timeouts", label: "投票与超时设置", section: "基本设置 · 超时", tab: "basic", icon: "schedule", keywords: ["voteThreshold", "votingTimeout", "roleTimeout", "briefingTimeout", "debriefingTimeout", "lobbyIdleTimeout", "voteMissionPlayers", "投票阈值"] },
  { id: "s-extra-args", label: "额外启动参数与文件", section: "基本设置 · 启动参数", tab: "basic", icon: "code", keywords: ["pidFile", "rankingFile", "serverCfgArgs", "basicCfgArgs", "startArgs", "profileArgs", "PID 文件"] },

  // PerformanceView
  { id: "s-cpu", label: "CPU 核心数 / 额外线程 / 超线程", section: "性能设置", tab: "performance", icon: "speed", advancedOnly: true, keywords: ["cpuCount", "exThreads", "enableHT", "CPU", "线程", "超线程"] },
  { id: "s-mem", label: "最大内存 / 大页内存 (hugepages)", section: "性能设置", tab: "performance", icon: "speed", advancedOnly: true, keywords: ["maxMem", "hugepages", "最大内存", "大页内存"] },
  { id: "s-fps", label: "帧率上限 / 视距 / 地形网格", section: "性能设置", tab: "performance", icon: "speed", advancedOnly: true, keywords: ["limitFps", "viewDistance", "terrainGrid", "帧率", "视距", "地形网格"] },
  { id: "s-perf-flags", label: "任务预加载 / 性能开关", section: "性能设置", tab: "performance", icon: "speed", advancedOnly: true, keywords: ["loadMissionToMemory", "disableServerThread", "logObjectNotFound", "skipDescriptionParsing", "ignoreMissionLoadErrors", "queueSizeLogG"] },

  // NetworkView
  { id: "s-bandwidth", label: "带宽上下限 / 带宽算法", section: "网络设置", tab: "network", icon: "lan", advancedOnly: true, keywords: ["minBandwidth", "maxBandwidth", "bandwidthAlg", "带宽"] },
  { id: "s-packets", label: "消息队列与包大小", section: "网络设置", tab: "network", icon: "lan", advancedOnly: true, keywords: ["maxMsgSend", "maxSizeGuaranteed", "maxSizeNonguaranteed", "minErrorToSend", "minErrorToSendNear", "maxPacketSize", "maxCustomFileSize"] },
  { id: "s-net-limits", label: "断线超时 / 最大延迟 / 最大丢包 / UPnP", section: "网络设置", tab: "network", icon: "lan", advancedOnly: true, keywords: ["disconnectTimeout", "maxDesync", "maxPing", "maxPacketLoss", "upnp", "loopback", "断线超时", "丢包"] },

  // SecurityView
  { id: "s-sig", label: "签名验证 (verifySignatures) / 踢出重复", section: "安全设置", tab: "security", icon: "shield", advancedOnly: true, keywords: ["verifySignatures", "kickDuplicate", "battlEye", "签名验证", "踢出重复"] },
  { id: "s-rcon", label: "RCon 地址 / 端口 / 密码", section: "安全设置 · RCon", tab: "security", icon: "shield", advancedOnly: true, keywords: ["rconPassword", "rconPort", "rconHost", "RCon", "远程控制"] },
  { id: "s-admins", label: "管理员 UID / 指挥密码", section: "安全设置", tab: "security", icon: "shield", advancedOnly: true, keywords: ["admins", "serverCommandPassword", "doubleIdDetected", "管理员"] },
  { id: "s-file-patch", label: "文件修补与脚本校验", section: "安全设置", tab: "security", icon: "shield", advancedOnly: true, keywords: ["allowedFilePatching", "filePatchingExceptions", "beMaxPing", "allowedLoadFile", "allowedPreprocess", "allowedHtmlLoad", "allowedHtmlUri", "maxCreateVehicleCount", "maxSetPosCount", "onUserConnected", "onUserDisconnected", "onUserKicked", "regularCheck", "onHackedData", "onDifferentData", "onUnsignedData", "允许文件修补"] },

  // DifficultyView
  { id: "s-ai", label: "AI 技能与精度", section: "难度设置", tab: "difficulty", icon: "gamepad", advancedOnly: true, keywords: ["skillAi", "precisionAi", "AI", "难度"] },
  { id: "s-hud", label: "准星 / HUD / 地图标记 / 第三人称", section: "难度设置", tab: "difficulty", icon: "gamepad", advancedOnly: true, keywords: ["weaponCrosshair", "groupIndicators", "friendlyTags", "enemyTags", "detectedMines", "commands", "waypoints", "weaponInfo", "stanceIndicator", "tacticalPing", "staminaBar", "visionAid", "cameraShake", "scoreTable", "deathMessages", "vonId", "mapContent", "reducedDamage", "autoReport", "multipleSaves", "准星"] },

  // LogSettingsView
  { id: "s-log-opts", label: "RPT / NetLog / 时间戳格式", section: "日志选项", tab: "log", icon: "receipt_long", advancedOnly: true, keywords: ["noLogs", "netLog", "logFile", "timeStampFormat", "callExtReportLimit", "-noLogs", "-netlog"] },

  // ConfigEditor
  { id: "s-config-pkg", label: "崩溃重启 / 原始 JSON / 启动参数", section: "配置包", tab: "config", icon: "code", advancedOnly: true, keywords: ["restartOnCrash", "parameters", "enabledIds", "serverModIds", "JSON", "崩溃重启"] },

  // ModsView & SteamCmdView
  { id: "s-mods-workflow", label: "扫描模组 / 检查更新 / Bikey / HTML 导入 / DLC", section: "模组管理", tab: "mods", icon: "extension", keywords: ["bikey", "mods", "DLC", "Contact", "GM", "CSLA", "Western Sahara", "S.O.G.", "扫描", "更新", "HTML"] },
  { id: "s-steamcmd", label: "SteamCMD 账号 / 工坊目录 / 服务端安装路径", section: "SteamCMD", tab: "steamcmd", icon: "cloud_download", advancedOnly: true, keywords: ["steamUser", "loginMode", "workshopRoot", "serverInstallPath", "SteamCMD"] },

  // Missions, Scheduler, Snapshots, Preflight, Logs, RCon, Bans, Statistics
  { id: "s-missions", label: "任务列表 / 上传 PBO / 强制难度", section: "地图任务", tab: "missions", icon: "map", advancedOnly: true, keywords: ["MPMissions", "PBO", "forcedDifficulty", "autoSelectMission", "randomMissionOrder", "missionParamsText"] },
  { id: "s-scheduler", label: "定时重启 Cron / 监控采集 / 禁更窗", section: "定时任务", tab: "scheduler", icon: "schedule", advancedOnly: true, keywords: ["restartCron", "monitoringCron", "quietHours", "cron", "定时重启", "禁更窗"] },
  { id: "s-snapshots", label: "创建快照 / 恢复配置快照", section: "配置快照", tab: "snapshots", icon: "history", keywords: ["snapshot", "快照", "恢复"] },
  { id: "s-preflight", label: "开服检查 / 全量体检", section: "部署检查", tab: "preflight", icon: "fact_check", keywords: ["preflight", "diagnostics", "开服检查", "体检"] },
  { id: "s-logs-view", label: "查看 Console / RPT / BattlEye 日志", section: "日志查看", tab: "logs", icon: "description", keywords: ["rpt", "battleye", "console", "日志"] },
  { id: "s-rcon-view", label: "在线玩家 / 踢出封禁 / 全员广播 / 锁服", section: "RCon 控制台", tab: "rcon", icon: "terminal", keywords: ["rcon", "kick", "ban", "broadcast", "lock", "广播", "锁服"] },
  { id: "s-bans-view", label: "本地 bans.txt 封禁管理", section: "本地封禁", tab: "bans", icon: "gavel", keywords: ["bans.txt", "ban", "guid", "封禁"] },
  { id: "s-stats-view", label: "在线人数与 FPS 趋势 / 启用监控 / CSV 导出", section: "运行统计", tab: "statistics", icon: "monitoring", advancedOnly: true, keywords: ["monitoringEnabled", "FPS", "CSV", "HTML", "启用监控", "趋势"] },
];

/**
 * 配置行在目标视图里渲染成 <label>中文</label>，英文键名（configName / motd 等）
 * 只存在于 v-model 绑定，不会出现在行文本里。若拿英文键名当 needle，
 * 选中配置项后永远定位不到那一行。所以候选 needle 以 label 的中文词优先，
 * 英文关键字只作后备。
 */
function needleCandidates(label: string, keywords: string[]): string[] {
  const out: string[] = [];
  for (const chunk of [label, ...keywords]) {
    const spaced = chunk
      .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
      .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2");
    for (const part of spaced.split(/[\s/、,，()（）·]+/)) {
      const token = part.trim();
      if (token.length >= 2) {
        out.push(token);
      }
    }
  }
  return [...new Set(out)];
}

export function searchCommands(params: {
  query: string;
  servers: ServerSummary[];
  selectedUuid: string;
  showAdvanced: boolean;
}): CommandPaletteItem[] {
  const q = params.query.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const hasServer = Boolean(params.selectedUuid);

  const matches = (fields: string[]): boolean => {
    if (tokens.length === 0) {
      return true;
    }
    const haystack = fields.join(" ").toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  };

  const results: CommandPaletteItem[] = [];

  // 1. Tabs (all 19)
  for (const tab of getAllTabs()) {
    const modeId = modeForTab(tab.name);
    const modeLabel = MODE_LABELS[modeId] ?? modeId;
    if (matches([tab.name, tab.label, modeLabel, tab.advancedOnly ? "高级 advanced" : ""])) {
      results.push({
        id: `tab:${tab.name}`,
        group: "tab",
        groupLabel: "页面",
        title: tab.label,
        subtitle: `${modeLabel} · /${tab.name}`,
        icon: tab.icon ?? "dashboard",
        badge: tab.advancedOnly ? "高级" : undefined,
        disabled: !hasServer && tab.name !== "dashboard",
        tab: tab.name,
      });
    }
  }

  // 2. Settings keywords (show when searching, or top few if query non-empty)
  if (tokens.length > 0) {
    for (const s of SETTING_ENTRIES) {
      if (matches([s.label, s.section, s.tab, ...s.keywords])) {
        const needles = needleCandidates(s.label, s.keywords);
        results.push({
          id: s.id,
          group: "setting",
          groupLabel: "配置项",
          title: s.label,
          subtitle: s.section,
          icon: s.icon,
          badge: s.advancedOnly ? "高级" : undefined,
          disabled: !hasServer,
          tab: s.tab,
          highlight: needles[0] ?? s.label,
          highlightAliases: needles.slice(1),
        });
      }
    }
  }

  // 3. Server instances
  for (const srv of params.servers) {
    if (matches([srv.configName, srv.uuid, srv.serverDir ?? "", "服务器 实例 server"])) {
      const isCurrent = srv.uuid === params.selectedUuid;
      results.push({
        id: `server:${srv.uuid}`,
        group: "server",
        groupLabel: "服务器实例",
        title: srv.configName,
        subtitle: srv.serverDir || srv.uuid,
        icon: "dns",
        badge: isCurrent ? "当前" : undefined,
        serverUuid: srv.uuid,
      });
    }
  }

  // 4. Safe Actions
  const actions: Array<{
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    keywords: string[];
    requiresServer?: boolean;
  }> = [
    { id: "write_cfg", title: "应用更改（写入 cfg）", subtitle: "生成 server.cfg / basic.cfg；运行中需重启后生效", icon: "publish", keywords: ["write_cfg", "写入游戏配置", "应用更改", "cfg"], requiresServer: true },
    { id: "preflight", title: "执行开服检查", subtitle: "体检路径、端口、模组与配置文件", icon: "fact_check", keywords: ["preflight", "开服检查", "体检"], requiresServer: true },
    { id: "save", title: "保存当前页配置", subtitle: "提交当前编辑器的未保存修改", icon: "save", keywords: ["save", "保存"], requiresServer: true },
    { id: "theme_cycle", title: "切换明暗主题", subtitle: "在跟随系统 / 浅色 / 深色之间循环切换", icon: "brightness_auto", keywords: ["theme", "dark", "light", "主题", "明暗"] },
    { id: "open_wizard", title: "打开首服向导", subtitle: "从零创建并配置服务器实例", icon: "auto_fix_high", keywords: ["wizard", "首服向导"] },
    { id: "create_server", title: "新建服务器配置", subtitle: "创建一个新的服务器配置实例", icon: "add", keywords: ["create", "new", "新建服务器"] },
    { id: "nav_connections", title: "切换主机", subtitle: "返回主机连接列表", icon: "logout", keywords: ["connections", "主机连接", "切换主机", "登出", "返回"] },
  ];

  for (const act of actions) {
    if (matches([act.title, act.subtitle, act.id, ...act.keywords])) {
      results.push({
        id: `action:${act.id}`,
        group: "action",
        groupLabel: "快捷操作",
        title: act.title,
        subtitle: act.subtitle,
        icon: act.icon,
        disabled: Boolean(act.requiresServer && !hasServer),
        actionId: act.id,
      });
    }
  }

  return results;
}
