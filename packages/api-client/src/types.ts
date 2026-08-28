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
  platform?: string;
  defaultServerExecutable?: string;
  defaultServerDir?: string;
  steamCmdBinary?: string;
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
  whiteList?: boolean;
  choose?: boolean;
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
  | "ensure_steamcmd"
  | "install_dedicated_server"
  | "first_server_setup"
  | "create_server"
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
  | "read_rpt"
  | "local_ban_add"
  | "local_ban_remove"
  | "rcon_lock"
  | "rcon_unlock"
  | "help"
  | "copy_bikeys"
  | "start_headless_client"
  | "stop_headless_client";

export interface AutomationCommand {
  action: TaskAction;
  missionTemplate?: string;
  missionDifficulty?: number;
  writeCfgAfter?: boolean;
  restartAfter?: boolean;
  restartAfterMission?: boolean;
  modIds?: number[];
  scope?: "client" | "server" | "hc" | "all";
  enableModsOnServer?: boolean;
  scanModsAfterDownload?: boolean;
  rconMissionName?: string;
  rconCommandText?: string;
  broadcastMessage?: string;
  logKind?: "rpt" | "battleye" | "all";
  playerId?: string;
  playerGuid?: string;
  reason?: string;
  missingOnly?: boolean;
  modPaths?: string[];
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
  steps?: TaskStep[];
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
  severity: "ok" | "warning" | "error" | "info";
  message: string;
}

export interface PreflightData {
  issues: PreflightIssue[];
  hasBlockingErrors?: boolean;
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
  isBusy?: boolean;
  isInstalled?: boolean;
  currentOperation?: string;
}

export interface SteamCmdSettingsData {
  username: string;
  hasPassword: boolean;
  workshopRoot: string;
  serverInstallPath: string;
  steamCmdDir: string;
  workshopModCount: number;
  message?: string;
}

export interface RconPlayerRow {
  num: number;
  guid: string;
  name: string;
}

export interface RconPlayersData {
  players: RconPlayerRow[];
  count: number;
}

export interface BikeySummaryData {
  enabled: number;
  missingBikey: number;
  ready: number;
  notCopied?: number;
  noKey?: number;
  needsAttention?: number;
  unsigned?: number;
  unchecked?: number;
  allValid?: boolean;
}

export interface SteamWorkshopModInfo {
  modId: number;
  title: string;
  description: string;
  fileSizeMb: string;
  selected: boolean;
}

export type ModBikeyStatus = "unsigned" | "no_key" | "not_copied" | "ready";

export interface ModMetaRow {
  workshopId: number;
  name: string;
  dirName?: string;
  path: string;
  enabled: boolean;
  isServerMod: boolean;
  isClientMod?: boolean;
  isHcMod?: boolean;
  isLocalMod?: boolean;
  inputLocalMod?: boolean;
  bikeyPresent?: boolean;
  bikeyStatus?: ModBikeyStatus;
  bikeyLabel?: string;
  scanOrder?: number;
  sizeBytes?: number;
  updatedAt?: string;
  updatedTime?: string;
}

export interface ModScanData {
  mods: ModMetaRow[];
  scanPathCount?: number;
}

export interface BanEntry {
  guid?: string;
  ip?: string;
  reason?: string;
  date?: string;
  time?: string;
  name?: string;
}

export interface LogFileEntry {
  fileName: string;
  filePath: string;
  size: number;
  lastModified: string;
  kind: "rpt" | "battleye";
}

export interface ServerPathsData {
  toolConfigDir: string;
  dataConfigDir: string;
  serverDir: string;
  serverConfigDir: string;
  logDir: string;
}

export interface BikeyFileEntry {
  name: string;
  size: number;
  fullPath?: string;
}

export interface SnapshotEntry {
  id: string;
  label: string;
  timestamp: string;
  files: string[];
}

export interface MonitoringStatsPoint {
  serverUuid: string;
  playerCount: number;
  timestamp: string;
  serverFps?: number;
}

export interface MonitoringPlayerRow {
  playerGuid: string;
  playerName: string;
  serverUuid: string;
  lastSeen: string;
}

export interface MonitoringSummaryData {
  avgPlayers: number;
  peakPlayers: number;
  totalEntries: number;
}

export interface CreateServerResult {
  uuid: string;
}

export interface DashboardData {
  hostname: string;
  port: string | number;
  isRunning: boolean;
  pid?: number;
  onlineCount: number | null;
  monitoring: {
    avgPlayers: number;
    peakPlayers: number;
    totalEntries: number;
  };
  scheduleSummary: string;
  latestRpt: string | null;
  cfgWritten: boolean;
}

export type AutoSnapshotMode = "Off" | "BeforeSave" | "BeforeWrite";

export interface UiSettings {
  showAdvancedSettings: boolean;
  allowExternalConfigRefresh: boolean;
  hasShownTrayMinimizeHint: boolean;
  autoSnapshotMode: AutoSnapshotMode;
  autoSnapshotAsync: boolean;
}

export interface ModScanPathEntry {
  modulePath: string;
  prefix?: string;
  remark?: string;
}

export interface ServerSyncState {
  lastModified: string | null;
  cfgWritten: boolean;
  cfgStale: boolean;
}

export interface CronJobEntry {
  taskId: string;
  cron: string;
  action?: number | string;
  actionText?: string;
  remark?: string;
  enabled?: boolean;
  status?: number;
}
