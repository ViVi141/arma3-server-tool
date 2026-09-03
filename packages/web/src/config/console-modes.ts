import { getTabEntry, type TabEntry } from "@/config/tab-registry";

export interface ConsoleMode {
  id: string;
  index: string;
  code: string;
  label: string;
  tabs: TabEntry[];
}

/** 模式 → 路由 tab 名（顺序即默认子页） */
const MODE_TAB_NAMES: Record<string, string[]> = {
  overview: ["dashboard"],
  deploy: ["preflight", "snapshots", "scheduler"],
  workshop: ["mods", "steamcmd", "missions"],
  logs: ["logs", "rcon", "statistics"],
  config: ["basic", "performance", "network", "security", "difficulty", "log", "config"],
  system: ["bans", "about"],
};

const MODE_META: Array<Omit<ConsoleMode, "tabs">> = [
  { id: "overview", index: "01", code: "INDEX", label: "概览" },
  { id: "deploy", index: "02", code: "DEPLOY", label: "部署" },
  { id: "workshop", index: "03", code: "WORKSHOP", label: "工坊" },
  { id: "logs", index: "04", code: "LOGS", label: "日志" },
  { id: "config", index: "05", code: "CONFIG", label: "配置" },
  { id: "system", index: "06", code: "SYSTEM", label: "系统" },
];

function filterTab(name: string, showAdvanced: boolean): TabEntry | null {
  const tab = getTabEntry(name);
  if (!tab) {
    return null;
  }
  if (tab.advancedOnly && !showAdvanced) {
    return null;
  }
  return tab;
}

export function consoleModes(showAdvanced: boolean): ConsoleMode[] {
  const modes: ConsoleMode[] = [];
  for (const meta of MODE_META) {
    const names = MODE_TAB_NAMES[meta.id] ?? [];
    const tabs: TabEntry[] = [];
    for (const name of names) {
      const tab = filterTab(name, showAdvanced);
      if (tab) {
        tabs.push(tab);
      }
    }
    if (tabs.length > 0) {
      modes.push({ ...meta, tabs });
    }
  }
  return modes;
}

export function modeForTab(tabName: string): string {
  for (const [modeId, names] of Object.entries(MODE_TAB_NAMES)) {
    if (names.includes(tabName)) {
      return modeId;
    }
  }
  return "overview";
}

export function defaultTabForMode(modeId: string, showAdvanced: boolean): string {
  const mode = consoleModes(showAdvanced).find((m) => m.id === modeId);
  if (mode && mode.tabs.length > 0) {
    return mode.tabs[0].name;
  }
  return "dashboard";
}

export function subTabsForMode(modeId: string, showAdvanced: boolean): TabEntry[] {
  const mode = consoleModes(showAdvanced).find((m) => m.id === modeId);
  if (mode) {
    return mode.tabs;
  }
  return [];
}

export function modeShowsProcActions(modeId: string): boolean {
  return modeId === "overview" || modeId === "deploy";
}

export function modeShowsCfgActions(modeId: string): boolean {
  return (
    modeId === "overview" ||
    modeId === "deploy" ||
    modeId === "config" ||
    modeId === "workshop"
  );
}
