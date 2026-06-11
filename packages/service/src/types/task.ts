import type { RconCommandType } from "./rcon.js";

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
  | "rcon_players"
  | "rcon_kick"
  | "rcon_ban"
  | "rcon_broadcast"
  | "rcon_mission"
  | "read_logs";

export interface AutomationCommand {
  action: TaskAction;
  missionTemplate?: string;
  missionDifficulty?: number;
  writeCfgAfter?: boolean;
  restartAfter?: boolean;
  modIds?: number[];
  broadcastMessage?: string;
  playerId?: string;
  playerGuid?: string;
  logKind?: "rpt" | "battleye" | "all";
}

export interface TaskPayload {
  taskId?: string;
  serverUuid?: string;
  serverName?: string;
  async?: boolean;
  commands: AutomationCommand[];
}

export interface TaskStep {
  action: string;
  success: boolean;
  message?: string;
  output?: string;
}

export interface TaskResult {
  success: boolean;
  message: string;
  steps: TaskStep[];
}
