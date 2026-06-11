// ---- Envelopes ----

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error: string | null;
  requestId: string;
}

// Legacy format (compatible with a3st-invoke.ps1)
export interface LegacyTaskResponse {
  success: boolean;
  data: {
    success: boolean;
    message: string;
    steps?: TaskStep[];
  };
}

// ---- Health ----

export interface HealthData {
  service: string;
  version: string;
  remoteAccessEnabled: boolean;
  publicBaseUrl?: string;
}

// ---- Actions (capability discovery) ----

export interface ActionsData {
  taskActions: string[];
  restEndpoints: { method: string; path: string; description?: string }[];
  fileUploads: string[];
}

// ---- Server list ----

export interface ServerSummary {
  uuid: string;
  configName: string;
  serverDir?: string;
  legacyFormat?: boolean;
}

// ---- Server status ----

export interface ServerStatus {
  isRunning: boolean;
  pid?: number;
  activeMissionTemplate?: string;
  serverModCount?: number;
}

// ---- Server config ----

export interface ArmaServerConfig {
  serverUuid?: string;
  configName?: string;
  serverDirectory?: string;
  serverExecutable?: string;
  modPaths?: string[];
  serverModIds?: number[];
  missionList?: MissionEntry[];
  // … more fields as needed; use PATCH for partial updates
  [key: string]: unknown;
}

export interface MissionEntry {
  template: string;
  difficulty?: number;
}

// ---- Task ----

export type TaskAction =
  | "status"
  | "start"
  | "stop"
  | "restart"
  | "save"
  | "write_cfg"
  | "switch_mission"
  | "enable_mods"
  | "disable_mods"
  | "download_mods"
  | "import_mods_html"
  | "scan_mods"
  | "update_server"
  | "preflight"
  | "sync_cron_jobs"
  | "rcon_players"
  | "rcon_kick"
  | "rcon_ban"
  | "rcon_broadcast"
  | "rcon_mission"
  | "rcon_command"
  | "stop_steamcmd"
  | "steamcmd_status"
  | "read_logs"
  | "read_rpt";

export interface AutomationCommand {
  action: TaskAction;
  missionTemplate?: string;
  missionDifficulty?: number;
  writeCfgAfter?: boolean;
  restartAfter?: boolean;
  restartAfterMission?: boolean;
  modIds?: number[];
  enableModsOnServer?: boolean;
  scanModsAfterDownload?: boolean;
  rconMissionName?: string;
  rconCommandText?: string;
  broadcastMessage?: string;
  logKind?: "rpt" | "battleye" | "all";
  playerId?: string;
  playerGuid?: string;
  reason?: string;
}

export interface TaskPayload {
  taskId?: string;
  serverUuid?: string;
  serverName?: string;
  async?: boolean;
  writeCfgAfter?: boolean;
  restartAfter?: boolean;
  captureSteamCmdOutput?: boolean;
  commands: AutomationCommand[];
}

export interface TaskStep {
  action: string;
  success: boolean;
  message?: string;
  output?: string;
  steamCmdLog?: string;
}

export interface TaskData {
  success: boolean;
  message: string;
  steps?: TaskStep[];
}

export interface AsyncTaskResponse {
  taskId: string;
  status?: "Pending" | "Running" | "Succeeded" | "Failed";
}

export interface TaskStatus {
  taskId: string;
  status: "Pending" | "Running" | "Succeeded" | "Failed";
  data?: TaskData;
  error?: string;
  createdAt?: string;
  completedAt?: string;
}

// ---- File upload ----

export interface MissionUploadResult {
  template: string;
  fullPath: string;
  fileName: string;
}

// ---- Mod HTML upload ----

export interface ModHtmlUploadData {
  success: boolean;
  message?: string;
  modCount?: number;
  requiresSteamCmd?: boolean;
  requiresSteamGuard?: boolean;
  steamCmdLog?: string;
}

// ---- Preflight ----

export interface PreflightIssue {
  category: string;
  severity: "ok" | "warning" | "error";
  message: string;
}

export interface PreflightData {
  issues: PreflightIssue[];
}

// ---- Logs ----

export interface LogData {
  lines: string[];
  totalLines: number;
  offset?: number;
}

// ---- SteamCMD ----

export interface SteamCmdStatusData {
  isRunning: boolean;
  isBusy: boolean;
  currentOperation?: string;
}
