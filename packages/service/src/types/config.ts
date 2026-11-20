import type { LocalModEntry } from "./mods.js";
import type { HealthConfigSection } from "./health.js";
import type { MaintenancePolicy } from "./maintenance.js";

export interface ModRoleEntry {
  path: string;
  dirName: string;
  workshopId: number;
  isClientMod: boolean;
  isServerMod: boolean;
  isHcMod: boolean;
}

export interface ServerConfigPackage {
  formatVersion: number;
  server?: ServerConfigSection;
  startup?: StartupConfigSection;
  mods?: ModsConfigSection;
  basic?: BasicConfigSection;
  profile?: ProfileConfigSection;
  battleye?: BattlEyeConfigSection;
  tasks?: TaskListSection;
  missionParams?: MissionParamsSection;
  scheduler?: SchedulerConfigSection;
  monitoring?: MonitoringConfigSection;
  health?: HealthConfigSection;
  maintenance?: MaintenancePolicy;
}

export interface ServerConfigSection {
  configName?: string;
  serverDir?: string;
  executable?: string;
  x64?: boolean;
  modPaths?: string[];
}

export interface StartupConfigSection {
  parameters?: string;
  restartOnCrash?: boolean;
  restartDelay?: number;
  port?: number;
  autoInit?: boolean;
  cpuCount?: number;
  exThreads?: number;
  maxMem?: number;
  limitFps?: number;
  viewDistance?: number;
  terrainGrid?: number;
  enableHT?: boolean;
  hugepages?: boolean;
  loadMissionToMemory?: boolean;
  disableServerThread?: boolean;
  logObjectNotFound?: boolean;
  skipDescriptionParsing?: boolean;
  ignoreMissionLoadErrors?: boolean;
  queueSizeLogG?: number;
  startArgs?: string;
  startConfigArgs?: string;
  /** Windows: keep the dedicated server console window visible (default true). */
  showServerWindow?: boolean;
  [key: string]: unknown;
}

export interface ModsConfigSection {
  enabledIds?: number[];
  serverModIds?: number[];
  clientModIds?: number[];
  hcModIds?: number[];
  roleEntries?: ModRoleEntry[];
  autoCopyBikey?: boolean;
  modPaths?: string[];
  localMods?: LocalModEntry[];
  enabledLocalPaths?: string[];
}

export interface BasicConfigSection {
  hostname?: string;
  password?: string;
  passwordAdmin?: string;
  maxPlayers?: number;
  port?: number;
  [key: string]: unknown;
}

export interface ProfileConfigSection {
  name?: string;
}

export interface BattlEyeConfigSection {
  rconHost?: string;
  rconPort?: number;
  rconPassword?: string;
}

export interface MissionEntry {
  template: string;
  difficulty?: number;
  whiteList?: boolean;
  choose?: boolean;
}

export interface TaskListSection {
  missions?: MissionEntry[];
  forcedDifficulty?: string;
  autoSelectMission?: boolean;
  randomMissionOrder?: boolean;
  enableHeadlessClient?: boolean;
  processById?: number;
}

export interface CronJobEntry {
  taskId: string;
  cron: string;
  action?: number | string;
  actionText?: string;
  remark?: string;
  enabled?: boolean;
  status?: number;
  /** 禁更窗开始 HH:mm（含）；与 quietHoursEnd 同时配置时生效 */
  quietHoursStart?: string;
  /** 禁更窗结束 HH:mm；跨午夜时 start > end */
  quietHoursEnd?: string;
}

export interface MissionParamsSection {
  params?: Record<string, string | number | boolean>;
  byTemplate?: Record<string, string>;
}

export interface SchedulerConfigSection {
  restartCron?: string;
  monitoringCron?: string;
  cronJobs?: Record<string, CronJobEntry>;
}

export interface MonitoringConfigSection {
  enabled?: boolean;
  modEnabled?: boolean;
  [key: string]: unknown;
}
