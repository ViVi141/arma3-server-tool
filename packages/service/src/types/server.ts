export interface ServerProcessState {
  isRunning: boolean;
  pid?: number;
  uptime?: number;
  cpuUsage?: number;
  memoryMb?: number;
}

export interface ServerInstance {
  uuid: string;
  configName: string;
  serverDir: string;
  executable: string;
  pid?: number;
}
