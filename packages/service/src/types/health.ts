export interface HealthConfigSection {
  enabled?: boolean;
  unattended?: boolean;
  startupTimeoutSeconds?: number;
}

export type ServerHealthState = "stopped" | "starting" | "healthy" | "unhealthy" | "unverified" | "maintenance";

export interface MissionHeartbeat {
  epoch: number;
  sequence: number;
  mission: string;
  world: string;
  uptimeSeconds: number;
  missionSeconds: number;
  fps: number;
  emittedAt: string;
  receivedAt: string;
}

export interface ServerHealthData {
  serverUuid: string;
  state: ServerHealthState;
  checkedAt: string;
  sessionStartedAt: string | null;
  pid: number | null;
  processAlive: boolean | null;
  rconResponsive: boolean | null;
  onlineCount: number | null;
  fps: number | null;
  heartbeat: MissionHeartbeat | null;
  consecutiveHeartbeats: number;
  rptPath: string | null;
  reasons: string[];
  configurationIssues: string[];
  thresholds: { heartbeatSeconds: number; sampleSeconds: number; staleSeconds: number; startupTimeoutSeconds: number };
  publicReachability: "unverified";
  playerJoin: "unverified";
}
