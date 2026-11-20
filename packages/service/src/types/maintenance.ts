/** 星期以窗口开始日为准，0=周日；跨午夜窗口的后半段属于前一天。 */
export interface MaintenanceWindow {
  days: number[];
  start: string;
  end: string;
}

export interface MaintenancePolicy {
  enabled: boolean;
  template: "check_only" | "maintenance_window" | "idle_first";
  timeZone: string;
  windows: MaintenanceWindow[];
  protectedWindows: MaintenanceWindow[];
  windowConfirmed: boolean;
  allowOccupied: boolean;
  occupiedConfirmed: boolean;
  expectedDurationMinutes: number;
}

export type MaintenanceWaitCode =
  | "POLICY_DISABLED" | "CHECK_ONLY" | "PROTECTED_PERIOD" | "OUTSIDE_WINDOW"
  | "WAITING_AUTHORIZED_WINDOW" | "PROCESS_UNKNOWN" | "ONLINE_UNKNOWN"
  | "WAITING_IDLE" | "PLAYERS_PRESENT" | "PENDING_TIME_UNKNOWN";

export interface MaintenanceEligibility {
  allowed: boolean;
  reasonCode: MaintenanceWaitCode | null;
  reason: string;
  inWindow: boolean;
  overdue: boolean;
  requiresCountdown: boolean;
}

export interface MaintenancePresence {
  running: boolean | null;
  onlineCount: number | null;
  observedAt: number | null;
  idleSince: number | null;
}

export interface MaintenanceResource {
  key: string;
  physicalPath: string;
  modIds: number[];
  serverUuids: string[];
  headlessUuids: string[];
  aliases: string[];
}

export interface MaintenanceScopeIssue {
  code: "TARGET_UNREADABLE" | "LOAD_PATH_UNREADABLE" | "RUNTIME_UNKNOWN" | "OVERLAPPING_RESOURCES" | "RESOURCE_ID_CONFLICT";
  serverUuid: string | null;
  path: string | null;
  reason: string;
}

export interface MaintenanceImpact {
  resources: MaintenanceResource[];
  serverUuids: string[];
  headlessUuids: string[];
  issues: MaintenanceScopeIssue[];
  complete: boolean;
}

export interface RemoteWorkshopVersion { timeUpdated: number; sizeBytes: number }
export interface InstalledWorkshopVersion extends RemoteWorkshopVersion { manifest: string; acfPath: string }
export interface MaintenanceDiscovery {
  key: string;
  modId: number;
  physicalPath: string;
  title: string;
  configuredUuids: string[];
  localVersion: InstalledWorkshopVersion | null;
  remoteVersion: RemoteWorkshopVersion | null;
  status: "outdated" | "up_to_date" | "unknown";
  checkedAt: string;
  pendingSince: string | null;
}
export interface MaintenancePreviewInstance {
  serverUuid: string;
  headlessRunning: boolean | null;
  presence: MaintenancePresence;
  eligibility: MaintenanceEligibility;
}
export interface MaintenancePreview {
  createdAt: string;
  selectedKeys: string[];
  mods: MaintenanceDiscovery[];
  impact: MaintenanceImpact;
  instances: MaintenancePreviewInstance[];
  canExecute: boolean;
  reasons: string[];
  commonTime: { at: string | null; searchedThrough: string } | null;
  thresholds: { checkSeconds: number; sampleSeconds: number; idleSeconds: number; onlineFreshSeconds: number; maxWaitHours: number; countdownSeconds: readonly number[] };
  warning: string;
}
