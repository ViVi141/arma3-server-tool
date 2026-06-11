export type RconCommandType =
  | "login"
  | "players"
  | "kick"
  | "ban"
  | "unban"
  | "mission"
  | "missions"
  | "loadMission"
  | "restart"
  | "shutdown"
  | "broadcast"
  | "admins"
  | "say"
  | "commands";

export interface RconCredentials {
  host: string;
  port: number;
  password: string;
}

export interface RconPlayer {
  num: number;
  guid: string;
  name: string;
}

export interface RconResponse {
  success: boolean;
  message: string;
  raw?: string;
}

export interface RconBanEntry {
  guid?: string;
  ip?: string;
  min?: number;
  reason?: string;
}
