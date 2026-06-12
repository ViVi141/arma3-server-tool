/** 控制台侧栏 Tab 注册（名称与 ServerConsoleView 内视图一致） */

export interface TabEntry {
  name: string;
  label: string;
  advancedOnly?: boolean;
}

export interface NavGroup {
  label?: string;
  tabs: TabEntry[];
}

const DEFAULT_TAB = "dashboard";

const MAIN_TABS: TabEntry[] = [
  { name: "dashboard", label: "概览" },
  { name: "basic", label: "基本" },
  { name: "mods", label: "模组" },
  { name: "missions", label: "任务", advancedOnly: true },
  { name: "rcon", label: "远程控制" },
  { name: "bans", label: "封禁" },
  { name: "steamcmd", label: "SteamCMD", advancedOnly: true },
];

const SETTINGS_TABS: TabEntry[] = [
  { name: "performance", label: "性能", advancedOnly: true },
  { name: "network", label: "网络", advancedOnly: true },
  { name: "security", label: "安全", advancedOnly: true },
  { name: "difficulty", label: "难度", advancedOnly: true },
  { name: "log", label: "日志", advancedOnly: true },
];

const TOOL_TABS: TabEntry[] = [
  { name: "statistics", label: "统计", advancedOnly: true },
  { name: "scheduler", label: "定时", advancedOnly: true },
  { name: "snapshots", label: "快照" },
  { name: "logs", label: "RPT 日志" },
  { name: "preflight", label: "开服检查" },
  { name: "wizard", label: "向导" },
  { name: "config", label: "配置包", advancedOnly: true },
  { name: "about", label: "关于" },
];

const ALL_TAB_ENTRIES: TabEntry[] = [...MAIN_TABS, ...SETTINGS_TABS, ...TOOL_TABS];

const TAB_NAMES = new Set(ALL_TAB_ENTRIES.map((t) => t.name));

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
