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
}

export interface ServerConfigSection {
  configName?: string;
  serverDir?: string;
  executable?: string;
  modPaths?: string[];
}

export interface StartupConfigSection {
  parameters?: string;
  restartOnCrash?: boolean;
  restartDelay?: number;
}

export interface ModsConfigSection {
  enabledIds?: number[];  // Workshop IDs
  serverModIds?: number[];
  autoCopyBikey?: boolean;
}

export interface BasicConfigSection {
  hostname?: string;
  password?: string;
  passwordAdmin?: string;
  maxPlayers?: number;
}

export interface ProfileConfigSection {
  name?: string;
}

export interface BattlEyeConfigSection {
  rconPort?: number;
  rconPassword?: string;
}

export interface TaskListSection {
  missions?: { template: string; difficulty?: number }[];
}

export interface MissionParamsSection {
  params?: Record<string, string | number | boolean>;
}
