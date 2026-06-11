import type {
  ApiResponse,
  LegacyTaskResponse,
  HealthData,
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
} from "./types";

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
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
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

  // ---- Servers ----

  async listServers(): Promise<ServerSummary[]> {
    const r = await this.f(`${this.baseUrl}/api/v1/servers`, { headers: this.headers() });
    return r.json();
  }

  async serverStatus(uuid: string): Promise<ServerStatus> {
    const r = await this.f(`${this.baseUrl}/api/v1/servers/${uuid}/status`, { headers: this.headers() });
    return r.json();
  }

  async getConfig(uuid: string): Promise<ApiResponse<ArmaServerConfig>> {
    return this.get(`/api/v1/servers/${uuid}/config`);
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

  async readLogs(uuid: string, logKind: "rpt" | "battleye" | "all" = "rpt"): Promise<ApiResponse<LogData>> {
    return this.get(`/api/v1/servers/${uuid}/logs/read?kind=${logKind}`);
  }

  // ---- SteamCMD ----

  async steamCmdStatus(): Promise<ApiResponse<SteamCmdStatusData>> {
    return this.get("/api/v1/steamcmd/status");
  }

  async stopSteamCmd(): Promise<ApiResponse<null>> {
    return this.post("/api/v1/steamcmd/stop");
  }
}

// convenience factory
export function createClient(baseUrl: string, token?: string): A3stClient {
  return new A3stClient({ baseUrl, token });
}
