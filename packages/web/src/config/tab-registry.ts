/** 控制台侧栏 Tab 注册（名称与 ServerConsoleView 内视图一致） */

export interface TabEntry {
  name: string;
  label: string;
  icon?: string;
  advancedOnly?: boolean;
}

export interface NavGroup {
  label?: string;
  tabs: TabEntry[];
}

const DEFAULT_TAB = "dashboard";

const MAIN_TABS: TabEntry[] = [
  { name: "dashboard", label: "概览", icon: "dashboard" },
  { name: "basic", label: "基本", icon: "tune" },
  { name: "mods", label: "模组", icon: "extension" },
  { name: "missions", label: "地图任务", icon: "map", advancedOnly: true },
  { name: "rcon", label: "远程控制", icon: "terminal" },
  { name: "bans", label: "本地封禁", icon: "gavel" },
  { name: "steamcmd", label: "SteamCMD", icon: "cloud_download", advancedOnly: true },
];

const SETTINGS_TABS: TabEntry[] = [
  { name: "performance", label: "性能", icon: "speed", advancedOnly: true },
  { name: "network", label: "网络", icon: "lan", advancedOnly: true },
  { name: "security", label: "安全", icon: "shield", advancedOnly: true },
  { name: "difficulty", label: "难度", icon: "gamepad", advancedOnly: true },
  { name: "log", label: "日志选项", icon: "receipt_long", advancedOnly: true },
];

const TOOL_TABS: TabEntry[] = [
  { name: "statistics", label: "统计", icon: "monitoring", advancedOnly: true },
  { name: "scheduler", label: "定时", icon: "schedule", advancedOnly: true },
  { name: "snapshots", label: "快照", icon: "history" },
  { name: "logs", label: "RPT 日志", icon: "description" },
  { name: "preflight", label: "开服检查", icon: "fact_check" },
  { name: "config", label: "配置包", icon: "code", advancedOnly: true },
  { name: "about", label: "关于", icon: "info" },
];

const ALL_TAB_ENTRIES: TabEntry[] = [...MAIN_TABS, ...SETTINGS_TABS, ...TOOL_TABS];

export function getAllTabs(): TabEntry[] {
  return ALL_TAB_ENTRIES;
}

const TAB_NAMES = new Set(ALL_TAB_ENTRIES.map((t) => t.name));

const TAB_BY_NAME = new Map(ALL_TAB_ENTRIES.map((t) => [t.name, t]));

export function getTabEntry(name: string): TabEntry | undefined {
  return TAB_BY_NAME.get(name);
}

function filterVisibleTabs(tabs: TabEntry[], showAdvanced: boolean): TabEntry[] {
  const visible: TabEntry[] = [];
  for (const tab of tabs) {
    if (tab.advancedOnly && !showAdvanced) {
      continue;
    }
    visible.push(tab);
  }
  return visible;
}

/** 按「显示高级设置」生成侧栏导航分组 */
export function navGroups(showAdvanced: boolean): NavGroup[] {
  const groups: NavGroup[] = [];

  const main = filterVisibleTabs(MAIN_TABS, showAdvanced);
  if (main.length > 0) {
    groups.push({ tabs: main });
  }

  const settings = filterVisibleTabs(SETTINGS_TABS, showAdvanced);
  if (settings.length > 0) {
    groups.push({ label: "设置", tabs: settings });
  }

  const tools = filterVisibleTabs(TOOL_TABS, showAdvanced);
  if (tools.length > 0) {
    groups.push({ label: "工具", tabs: tools });
  }

  return groups;
}

/** 将路由 tab 参数规范为合法 Tab 名 */
export function resolveTabName(tab: unknown): string {
  let raw = "";
  if (Array.isArray(tab)) {
    if (tab[0] !== undefined && tab[0] !== null) {
      raw = String(tab[0]);
    }
  } else if (typeof tab === "string") {
    raw = tab;
  }

  if (TAB_NAMES.has(raw)) {
    return raw;
  }
  return DEFAULT_TAB;
}
