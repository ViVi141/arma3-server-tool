import type {
  ApiResponse,
  LegacyTaskResponse,
  HealthData,
  ServerHealthData,
  ActionsData,
  ServerSummary,
  ServerStatus,
  ArmaServerConfig,
  TaskPayload,
  TaskData,
  AsyncTaskResponse,
  TaskStatus,
  MissionUploadResult,
  ModHtmlUploadData,
  PreflightData,
  LogData,
  SteamCmdStatusData,
  SteamCmdSettingsData,
  DashboardData,
  RconPlayersData,
  BikeySummaryData,
  SteamWorkshopModInfo,
  WorkshopLocalModRef,
  ModScanData,
  BanEntry,
  MissionEntry,
  LogFileEntry,
  ServerPathsData,
  BikeyFileEntry,
  SnapshotEntry,
  MonitoringStatsPoint,
  MonitoringPlayerRow,
  MonitoringSummaryData,
  CreateServerResult,
  UiSettings,
  ModScanPathEntry,
  ServerSyncState,
} from "./types";

import type { OperationEvent, OperationEventPage, MaintenanceResult, NotificationSettings, NotificationSettingsData, EmailDelivery } from "./operations";
import type { MaintenanceDiscovery, MaintenancePreview } from "./maintenance";

export type * from "./types";

export interface ClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class A3stClient {
  readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly f: typeof fetch;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
    this.token = options.token;
    this.f = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  // ---- helpers ----

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  private async get<T>(path: string): Promise<ApiResponse<T>> {
    const r = await this.f(`${this.baseUrl}${path}`, { headers: this.headers() });
    return r.json();
  }

  private async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const r = await this.f(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(body != null ? { "Content-Type": "application/json" } : undefined),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }

  private async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const r = await this.f(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.headers(body != null ? { "Content-Type": "application/json" } : undefined),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }

  private async deleteReq<T>(path: string): Promise<ApiResponse<T>> {
    const r = await this.f(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    return r.json();
  }

  async postRaw(path: string, init: RequestInit): Promise<Response> {
    return this.f(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers as Record<string, string> | undefined) },
    });
  }

  // ---- Health ----

  async health(): Promise<ApiResponse<HealthData>> {
    return this.get("/api/v1/health");
  }

  // ---- Actions ----

  async actions(): Promise<ApiResponse<ActionsData>> {
    return this.get("/api/v1/actions");
  }

  // ---- 运维事件与通知 ----

  async opsEvents(after?: number, limit = 100): Promise<ApiResponse<OperationEventPage>> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (after !== undefined) query.set("after", String(after));
    return this.get(`/api/v1/ops/events?${query}`);
  }

  async acknowledgeOpsEvent(id: string): Promise<ApiResponse<OperationEvent>> {
    return this.post(`/api/v1/ops/events/${encodeURIComponent(id)}/acknowledge`);
  }

  async getMaintenance(id: string): Promise<ApiResponse<MaintenanceResult>> {
    return this.get(`/api/v1/ops/maintenance/${encodeURIComponent(id)}`);
  }

  async getMaintenanceUpdates(uuid: string): Promise<ApiResponse<MaintenanceDiscovery[]>> {
    return this.get(`/api/v1/servers/${encodeURIComponent(uuid)}/maintenance/updates`);
  }

  async checkMaintenanceUpdates(uuid: string): Promise<ApiResponse<MaintenanceDiscovery[]>> {
    return this.post(`/api/v1/servers/${encodeURIComponent(uuid)}/maintenance/check`);
  }

  async previewMaintenance(uuid: string, keys: string[]): Promise<ApiResponse<MaintenancePreview>> {
    return this.post(`/api/v1/servers/${encodeURIComponent(uuid)}/maintenance/preview`, { keys });
  }

  /** 执行／重试必须带幂等 requestId；接口立即返回批次 ID，进度从检查点查询。 */
  async executeMaintenance(uuid: string, keys: string[], requestId: string): Promise<ApiResponse<{ id: string; state: string }>> {
    return this.post(`/api/v1/servers/${encodeURIComponent(uuid)}/maintenance/execute`, { keys, requestId });
  }

  async retryMaintenance(id: string, requestId: string): Promise<ApiResponse<{ id: string; state: string }>> {
    return this.post(`/api/v1/ops/maintenance/${encodeURIComponent(id)}/retry`, { requestId });
  }

  async cancelMaintenance(id: string): Promise<ApiResponse<{ cancelled: boolean }>> {
    return this.post(`/api/v1/ops/maintenance/${encodeURIComponent(id)}/cancel`);
  }

  /** 仅用于需人工介入的批次：确认现场已处理后显式释放维护锁，备份与事件证据保留。 */
  async resolveMaintenance(id: string): Promise<ApiResponse<{ id: string; state: string; result: string | null }>> {
    return this.post(`/api/v1/ops/maintenance/${encodeURIComponent(id)}/resolve`, { confirm: "manual_handled" });
  }

  async listMaintenance(): Promise<ApiResponse<MaintenanceResult[]>> {
    return this.get("/api/v1/ops/maintenance");
  }

  async getNotificationSettings(): Promise<ApiResponse<NotificationSettingsData>> {
    return this.get("/api/v1/ops/notifications/settings");
  }

  async saveNotificationSettings(settings: NotificationSettings): Promise<ApiResponse<NotificationSettingsData>> {
    return this.put("/api/v1/ops/notifications/settings", settings);
  }

  async testNotification(): Promise<ApiResponse<EmailDelivery>> {
    return this.post("/api/v1/ops/notifications/test");
  }

  async emailDeliveries(): Promise<ApiResponse<EmailDelivery[]>> {
    return this.get("/api/v1/ops/notifications/deliveries");
  }

  // ---- Servers ----

  async listServers(reload = false): Promise<ServerSummary[]> {
    const qs = reload ? "?reload=true" : "";
    const r = await this.f(`${this.baseUrl}/api/v1/servers${qs}`, { headers: this.headers() });
    return r.json();
  }

  async serverStatus(uuid: string): Promise<ServerStatus> {
    const r = await this.f(`${this.baseUrl}/api/v1/servers/${uuid}/status`, { headers: this.headers() });
    return r.json();
  }

  async serverHealth(uuid: string): Promise<ApiResponse<ServerHealthData>> {
    return this.get(`/api/v1/servers/${uuid}/health`);
  }

  async getDashboard(uuid: string): Promise<ApiResponse<DashboardData>> {
    return this.get(`/api/v1/servers/${uuid}/dashboard`);
  }

  async getRconPlayers(uuid: string): Promise<ApiResponse<RconPlayersData>> {
    return this.get(`/api/v1/servers/${uuid}/rcon/players`);
  }

  async getBikeySummary(uuid: string): Promise<ApiResponse<BikeySummaryData>> {
    return this.get(`/api/v1/servers/${uuid}/mods/bikeys`);
  }

  async getConfig(uuid: string, reload = false): Promise<ApiResponse<ArmaServerConfig>> {
    const qs = reload ? "?reload=true" : "";
    return this.get(`/api/v1/servers/${uuid}/config${qs}`);
  }

  async patchConfig(uuid: string, patch: Partial<ArmaServerConfig>, writeCfg = false): Promise<ApiResponse<ArmaServerConfig>> {
    const qs = writeCfg ? "?writeCfg=true" : "";
    const r = await this.f(`${this.baseUrl}/api/v1/servers/${uuid}/config${qs}`, {
      method: "PATCH",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    return r.json();
  }

  async createServer(configName: string, serverDir?: string): Promise<ApiResponse<CreateServerResult>> {
    return this.post("/api/v1/servers", { configName, serverDir });
  }

  async cloneServer(uuid: string): Promise<ApiResponse<CreateServerResult>> {
    return this.post(`/api/v1/servers/${uuid}/clone`);
  }

  async deleteServer(uuid: string): Promise<ApiResponse<{ message: string }>> {
    return this.deleteReq(`/api/v1/servers/${uuid}`);
  }

  async renameServer(uuid: string, newName: string): Promise<ApiResponse<{ message: string }>> {
    return this.put(`/api/v1/servers/${uuid}/rename`, { newName });
  }

  async getModScan(
    uuid: string,
    options?: { bikeyMode?: "shallow" | "full" }
  ): Promise<ApiResponse<ModScanData>> {
    const mode = options?.bikeyMode;
    const qs = mode === "full" ? "?bikeyMode=full" : "";
    return this.get(`/api/v1/servers/${uuid}/mods${qs}`);
  }

  async getBans(uuid: string): Promise<ApiResponse<BanEntry[]>> {
    return this.get(`/api/v1/servers/${uuid}/bans`);
  }

  async saveBans(uuid: string, bans: BanEntry[]): Promise<ApiResponse<{ message: string; count: number }>> {
    return this.put(`/api/v1/servers/${uuid}/bans`, bans);
  }

  async getBikeyFiles(uuid: string): Promise<ApiResponse<{ keysDir: string; files: BikeyFileEntry[] }>> {
    return this.get(`/api/v1/servers/${uuid}/mods/bikeys/files`);
  }

  async scanMissions(uuid: string): Promise<ApiResponse<{ missions: MissionEntry[]; scanned: number }>> {
    return this.get(`/api/v1/servers/${uuid}/missions/scan`);
  }

  async getDiagnostics(uuid: string): Promise<ApiResponse<PreflightData>> {
    return this.get(`/api/v1/servers/${uuid}/diagnostics`);
  }

  async listLogFiles(
    uuid: string,
    kind: "rpt" | "battleye" | "console" | "all" = "all"
  ): Promise<
    ApiResponse<{
      files: LogFileEntry[];
      serverDir: string;
      noLogs?: boolean;
      searchedDirs?: { path: string; exists: boolean; note: string }[];
    }>
  > {
    return this.get(`/api/v1/servers/${uuid}/logs?kind=${kind}`);
  }

  async syncMonitoringPlayers(uuid: string): Promise<ApiResponse<{ synced: number }>> {
    return this.post(`/api/v1/servers/${uuid}/monitoring/sync-players`);
  }

  async exportMonitoringHtml(uuid: string): Promise<ApiResponse<{ html: string }>> {
    return this.get(`/api/v1/servers/${uuid}/monitoring/export/html`);
  }

  async exportMonitoringCsv(
    uuid: string,
    kind: "stats" | "players" = "stats"
  ): Promise<ApiResponse<{ csv: string }>> {
    return this.get(`/api/v1/servers/${uuid}/monitoring/export/csv?kind=${kind}`);
  }

  async getServerPaths(uuid: string): Promise<ApiResponse<ServerPathsData>> {
    return this.get(`/api/v1/servers/${uuid}/paths`);
  }

  async listSnapshots(uuid: string): Promise<ApiResponse<SnapshotEntry[]>> {
    return this.get(`/api/v1/servers/${uuid}/snapshots`);
  }

  async createSnapshot(uuid: string, label: string): Promise<ApiResponse<SnapshotEntry>> {
    return this.post(`/api/v1/servers/${uuid}/snapshots`, { label });
  }

  async restoreSnapshot(uuid: string, snapshotId: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/api/v1/servers/${uuid}/snapshots/${snapshotId}/restore`);
  }

  async getMonitoringSummary(uuid: string): Promise<ApiResponse<MonitoringSummaryData>> {
    return this.get(`/api/v1/servers/${uuid}/monitoring/summary`);
  }

  async getMonitoringStats(uuid: string, hours = 24): Promise<ApiResponse<{ stats: MonitoringStatsPoint[] }>> {
    return this.get(`/api/v1/servers/${uuid}/monitoring/stats?hours=${hours}`);
  }

  async getMonitoringPlayers(uuid: string): Promise<ApiResponse<{ players: MonitoringPlayerRow[] }>> {
    return this.get(`/api/v1/servers/${uuid}/monitoring/players`);
  }

  async getSyncState(uuid: string): Promise<ApiResponse<ServerSyncState>> {
    return this.get(`/api/v1/servers/${uuid}/sync-state`);
  }

  async getUiSettings(): Promise<ApiResponse<UiSettings>> {
    return this.get("/api/v1/settings/ui");
  }

  async saveUiSettings(settings: UiSettings): Promise<ApiResponse<UiSettings>> {
    return this.put("/api/v1/settings/ui", settings);
  }

  async getModScanPaths(): Promise<ApiResponse<{ paths: ModScanPathEntry[] }>> {
    return this.get("/api/v1/settings/mod-scan-paths");
  }

  async saveModScanPaths(paths: ModScanPathEntry[]): Promise<ApiResponse<{ paths: ModScanPathEntry[]; message: string }>> {
    return this.put("/api/v1/settings/mod-scan-paths", { paths });
  }

  async fetchWorkshopModDetails(
    modIds: number[],
    localMods?: WorkshopLocalModRef[]
  ): Promise<ApiResponse<{ mods: SteamWorkshopModInfo[] }>> {
    return this.post("/api/v1/workshop/mod-details", { modIds, localMods });
  }

  async validateModPath(modPath: string): Promise<ApiResponse<{ valid: boolean }>> {
    return this.post("/api/v1/mods/validate-path", { path: modPath });
  }

  // ---- Tasks ----

  async submitTask(payload: TaskPayload): Promise<ApiResponse<TaskData | AsyncTaskResponse>> {
    // Detect: if async, the server returns different shape
    return this.post("/api/v1/task", payload);
  }

  async submitTaskLegacy(payload: TaskPayload): Promise<LegacyTaskResponse> {
    const r = await this.f(`${this.baseUrl}/api/v1/task`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    return r.json();
  }

  async getTask(taskId: string): Promise<ApiResponse<TaskStatus>> {
    return this.get(`/api/v1/tasks/${taskId}`);
  }

  async cancelTask(taskId: string): Promise<ApiResponse<{ message: string; status?: string }>> {
    return this.deleteReq(`/api/v1/tasks/${taskId}`);
  }

  async pollTask(
    taskId: string,
    intervalMs = 2000,
    timeoutMs = 600000
  ): Promise<TaskStatus> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const res = await this.getTask(taskId);
      const status = res.data.status;
      if (status === "Succeeded" || status === "Failed" || status === "Cancelled") {
        return res.data;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, intervalMs);
      });
    }
    throw new Error("任务等待超时");
  }

  // ---- Files ----

  async uploadMissionPbo(
    uuid: string,
    file: File | Blob,
    options?: { addToMissionList?: boolean; writeCfg?: boolean }
  ): Promise<ApiResponse<MissionUploadResult>> {
    const qs = new URLSearchParams();
    if (options?.addToMissionList) qs.set("addToMissionList", "true");
    if (options?.writeCfg) qs.set("writeCfg", "true");

    const form = new FormData();
    form.append("file", file);

    const r = await this.f(`${this.baseUrl}/api/v1/servers/${uuid}/files/mission-pbo?${qs}`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    });
    return r.json();
  }

  async uploadModHtml(
    uuid: string,
    html: string,
    options?: { mode?: string; writeCfg?: boolean }
  ): Promise<ApiResponse<ModHtmlUploadData>> {
    const qs = new URLSearchParams();
    if (options?.mode) qs.set("mode", options.mode);
    if (options?.writeCfg) qs.set("writeCfg", "true");

    const r = await this.f(`${this.baseUrl}/api/v1/servers/${uuid}/files/mod-list-html?${qs}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "text/html" }),
      body: html,
    });
    return r.json();
  }

  // ---- Preflight ----

  async preflight(uuid: string): Promise<ApiResponse<PreflightData>> {
    return this.get(`/api/v1/servers/${uuid}/preflight`);
  }

  // ---- Logs ----

  async readLogs(
    uuid: string,
    logKind: "rpt" | "battleye" | "console" | "all" = "rpt",
    options?: { tail?: number; file?: string }
  ): Promise<ApiResponse<LogData>> {
    const qs = new URLSearchParams();
    qs.set("kind", logKind);
    if (options?.tail) {
      qs.set("tail", String(options.tail));
    }
    if (options?.file) {
      qs.set("file", options.file);
    }
    return this.get(`/api/v1/servers/${uuid}/logs/read?${qs.toString()}`);
  }

  // ---- SteamCMD ----

  async steamCmdStatus(): Promise<ApiResponse<SteamCmdStatusData>> {
    return this.get("/api/v1/steamcmd/status");
  }

  async getSteamCmdSettings(): Promise<ApiResponse<SteamCmdSettingsData>> {
    return this.get("/api/v1/settings/steamcmd");
  }

  async saveSteamCmdSettings(body: {
    username?: string;
    password?: string;
    loginMode?: "cached" | "password";
    workshopRoot?: string;
    serverInstallPath?: string;
  }): Promise<ApiResponse<SteamCmdSettingsData>> {
    return this.put("/api/v1/settings/steamcmd", body);
  }

  async stopSteamCmd(): Promise<ApiResponse<{ message?: string; cancelledTaskIds?: string[] }>> {
    return this.post("/api/v1/steamcmd/stop");
  }
}

// convenience factory
export function createClient(baseUrl: string, token?: string): A3stClient {
  return new A3stClient({ baseUrl, token });
}
