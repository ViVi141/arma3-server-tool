import { expect, type Locator, type Page, type Route } from "@playwright/test";

const TAB_TO_MODE: Record<string, string> = {
  dashboard: "overview",
  preflight: "deploy",
  snapshots: "deploy",
  scheduler: "deploy",
  mods: "workshop",
  steamcmd: "workshop",
  missions: "workshop",
  logs: "logs",
  rcon: "logs",
  statistics: "logs",
  operations: "logs",
  basic: "config",
  performance: "config",
  network: "config",
  security: "config",
  difficulty: "config",
  log: "config",
  config: "config",
  bans: "system",
  about: "system",
};

export async function navigateConsoleTab(page: Page, tab: string): Promise<void> {
  const mode = TAB_TO_MODE[tab] ?? "overview";
  // 任何模式切换都要先点 rail：dashboard 也属于 overview 模式，
  // 从 workshop/logs 直接找 nav-dashboard 会找不到（子导航按当前模式渲染）。
  await page.getByTestId(`mode-${mode}`).click();
  const subNav = page.getByTestId(`nav-${tab}`);
  if (await subNav.isVisible()) {
    await subNav.click();
  }
}

export async function openInstanceMenu(page: Page): Promise<void> {
  const list = page.getByTestId("server-list");
  if (await list.isVisible()) {
    return;
  }
  await page.getByTestId("server-panel").locator("button").first().click();
  await expect(list).toBeVisible();
}

export async function connectConsole(page: Page): Promise<void> {
  // 真实后端冷启动（刚构建完 dist / 首次拉起）时连接列表可能还没返回，
  // 页面会先渲染成空列表；给足等待再判定“没有连接”。
  await expect(page.getByTestId("connections-page")).toBeVisible({ timeout: 30000 });
  const connectBtn = page.getByTestId("btn-connect").first();
  await expect(connectBtn).toBeVisible({ timeout: 30000 });
  await expect(connectBtn).toBeEnabled();

  // Hash 要等懒加载的 ServerConsoleView resolve 后才变；冷 Vite 在 Linux CI 上可能很慢。
  const healthPromise = page.waitForResponse(
    (response) => {
      return response.url().includes("/api/v1/health") && response.request().method() === "GET";
    },
    { timeout: 20000 }
  );
  await connectBtn.click();
  const healthResponse = await healthPromise;
  if (!healthResponse.ok()) {
    throw new Error(`Health check HTTP ${healthResponse.status()}`);
  }

  await expect(page).toHaveURL(/#\/console\/local\//, { timeout: 60000 });
  await expect(page.getByTestId("console-shell")).toBeVisible({ timeout: 30000 });
}

async function waitForConsoleSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      if (await page.getByTestId("content-empty-state").isVisible()) {
        return "empty";
      }
      if (await page.getByTestId("dashboard-page").isVisible()) {
        return "dashboard";
      }
      if (await page.getByRole("button", { name: "启动" }).isVisible()) {
        return "toolbar";
      }
      return "pending";
    }, { timeout: 15000 })
    .not.toBe("pending");
}

/**
 * Element Plus 的下拉/popover 内容会随状态轮询整块重建，
 * 常规 click 的"等待元素稳定"会被 detach 打断并一直重试。
 * 这类入口用原生 click 派发，避免对已断言过可见性的元素做稳定性等待。
 */
export async function clickRenderedEntry(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).evaluate((el) => (el as HTMLElement).click());
}

export async function openFirstServerWizard(page: Page): Promise<void> {
  await waitForConsoleSettled(page);
  const emptyState = page.getByTestId("content-empty-state");
  if (await emptyState.isVisible()) {
    await clickRenderedEntry(page, "btn-first-server-wizard-main");
    return;
  }
  await openInstanceMenu(page);
  await clickRenderedEntry(page, "btn-first-server-wizard");
}

export async function ensureTestServer(page: Page): Promise<void> {
  await connectConsole(page);
  await waitForConsoleSettled(page);

  const emptyState = page.getByTestId("content-empty-state");
  if (!(await emptyState.isVisible())) {
    return;
  }

  await clickRenderedEntry(page, "btn-first-server-wizard-main");
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-config-name").fill("E2E Server");
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-opt-install-dedicated").uncheck();
  await page.getByTestId("wizard-opt-ensure-steamcmd").uncheck();
  await page.getByTestId("wizard-opt-write-cfg").uncheck();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-finish").click();
  await expect(page.getByTestId("first-server-wizard")).not.toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 15000 });
}

// ============================================================================
// M3 Opaque-Box Helpers & Deterministic Mock Harness
// ============================================================================

export type ThemeMode = "system" | "light" | "dark";

export async function setThemeMode(page: Page, mode: ThemeMode): Promise<void> {
  const trigger = page.getByTestId("theme-mode-select");
  await expect(trigger).toBeVisible();

  const tagName = await trigger.evaluate((el) => el.tagName);
  if (tagName === "SELECT") {
    await trigger.selectOption(mode);
    return;
  }

  const readCurrentMode = async (): Promise<string | null> => {
    const attr = await trigger.getAttribute("data-theme-mode");
    if (attr === "system" || attr === "light" || attr === "dark") {
      return attr;
    }
    return page.evaluate(() => localStorage.getItem("a3st-theme-mode"));
  };

  const initial = await readCurrentMode();
  if (initial === mode && (await page.locator("html").getAttribute("data-theme"))) {
    return;
  }

  await trigger.click();

  const option = page.getByTestId(`theme-option-${mode}`);
  if (await option.isVisible().catch(() => false)) {
    await option.click();
    return;
  }

  for (let i = 0; i < 4; i++) {
    const current = await readCurrentMode();
    if (current === mode) {
      return;
    }
    await trigger.click();
  }

  await expect.poll(readCurrentMode, { timeout: 5000 }).toBe(mode);
}

export async function assertNoHorizontalOverflow(page: Page, tolerance = 1): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + tolerance);
}

export interface ErrorGuard {
  consoleErrors: string[];
  pageErrors: string[];
  assertClean: () => void;
}

export function attachErrorGuards(
  page: Page,
  options?: { ignoreNetworkHttpErrors?: boolean }
): ErrorGuard {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") {
      return;
    }
    const text = msg.text();
    if (text.includes("favicon.ico")) {
      return;
    }
    if (options?.ignoreNetworkHttpErrors && text.includes("Failed to load resource")) {
      return;
    }
    consoleErrors.push(text);
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message || String(err));
  });

  return {
    consoleErrors,
    pageErrors,
    assertClean: () => {
      expect(pageErrors, `Unexpected pageerrors: ${pageErrors.join("; ")}`).toEqual([]);
      expect(consoleErrors, `Unexpected console.error: ${consoleErrors.join("; ")}`).toEqual([]);
    },
  };
}

export function getTaskBannerLocator(page: Page): Locator {
  return page.getByTestId("bg-task-banner");
}

export function getTaskSnackbarLocator(page: Page): Locator {
  return page.getByTestId("m3-snackbar");
}

export function getTaskProgressLocator(page: Page): Locator {
  return page.locator('[data-testid="bg-task-banner"], [data-testid="m3-snackbar"]').first();
}

export async function openCommandPalette(
  page: Page,
  via: "shortcut" | "button" = "shortcut"
): Promise<void> {
  if (via === "button") {
    await page.getByTestId("btn-command-palette").click();
  } else {
    await page.keyboard.press("Control+k");
  }
  await expect(page.getByTestId("command-palette")).toBeVisible();
  await expect(page.getByTestId("command-palette-input")).toBeVisible();
}

export function parseRgb(color: string): [number, number, number] {
  const match = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!match) {
    return [0, 0, 0];
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function getRelativeLuminance(color: string): number {
  const [r, g, b] = parseRgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(colorA: string, colorB: string): number {
  const l1 = getRelativeLuminance(colorA);
  const l2 = getRelativeLuminance(colorB);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

// ============================================================================
// Mock API Types & Deterministic Route Harness (@a3st/api-client contracts)
// ============================================================================

export interface MockServerEntry {
  uuid: string;
  configName: string;
  serverDir: string;
}

export interface MockModRow {
  workshopId: number;
  name: string;
  dirName: string;
  path: string;
  enabled: boolean;
  isClientMod: boolean;
  isServerMod: boolean;
  isHcMod: boolean;
  bikeyStatus: import("@a3st/api-client").ModBikeyStatus;
  signatureEvidence?: import("@a3st/api-client").ModSignatureEvidence;
  bikeyLabel: string;
  bikeyHint?: string;
  scanOrder: number;
  updatedTime: string;
  updateStatus?: "missing" | "up_to_date" | "outdated" | "unknown";
  isLocalMod?: boolean;
  inputLocalMod?: boolean;
  remoteUpdatedLabel?: string;
}

export interface MockRecordedRequest {
  method: string;
  path: string;
  query: string;
  body: unknown;
}

export interface MockApiOptions {
  servers?: MockServerEntry[];
  isRunning?: boolean;
  cfgStale?: boolean;
  cfgWritten?: boolean;
  showAdvancedSettings?: boolean;
  autoCopyBikey?: boolean;
  mods?: MockModRow[];
  steamCmdInstalled?: boolean;
  emptyMonitoring?: boolean;
  emptyLogs?: boolean;
  logsReadErrorStatus?: number;
  patchConfigErrorStatus?: number;
  patchConfigErrorMessage?: string;
  writeCfgFail?: boolean;
  asyncPollsBeforeComplete?: number;
  asyncFinalStatus?: "Succeeded" | "Failed" | "Cancelled";
  asyncErrorText?: string;
  dashboardOverrides?: Record<string, unknown>;
  missions?: import("@a3st/api-client").MissionEntry[];
}

export interface MockApiHandle {
  requests: MockRecordedRequest[];
  setRunning: (running: boolean) => void;
  setCfgStale: (stale: boolean) => void;
  setMods: (mods: MockModRow[]) => void;
  setLogsReadErrorStatus: (status?: number) => void;
  getRequests: (method: string, pathSubstring: string) => MockRecordedRequest[];
}

export function createDefaultMockMods(): MockModRow[] {
  return [
    {
      workshopId: 450814997,
      name: "CBA_A3",
      dirName: "@CBA_A3",
      path: "C:\\arma3\\mods\\@CBA_A3",
      enabled: true,
      isClientMod: true,
      isServerMod: false,
      isHcMod: false,
      bikeyStatus: "ready",
      bikeyLabel: "验证通过",
      bikeyHint: "签名与密钥已就绪",
      scanOrder: 0,
      updatedTime: "2026-11-01 10:00",
      updateStatus: "up_to_date",
    },
    {
      workshopId: 463939057,
      name: "ACE3",
      dirName: "@ace",
      path: "C:\\arma3\\mods\\@ace",
      enabled: true,
      isClientMod: true,
      isServerMod: true,
      isHcMod: false,
      bikeyStatus: "ready",
      bikeyLabel: "验证通过",
      bikeyHint: "签名与密钥已就绪",
      scanOrder: 1,
      updatedTime: "2026-10-01 10:00",
      updateStatus: "outdated",
    },
    {
      workshopId: 620019431,
      name: "TFAR",
      dirName: "@TFAR",
      path: "C:\\arma3\\mods\\@TFAR",
      enabled: false,
      isClientMod: false,
      isServerMod: false,
      isHcMod: false,
      bikeyStatus: "not_copied",
      bikeyLabel: "未复制",
      bikeyHint: "模组存在 .bikey，但尚未复制到服务器 keys 目录",
      scanOrder: 2,
      updatedTime: "2026-10-15 10:00",
      updateStatus: "up_to_date",
    },
    {
      workshopId: 900000001,
      name: "UnsignedMod",
      dirName: "@UnsignedMod",
      path: "C:\\arma3\\mods\\@UnsignedMod",
      enabled: true,
      isClientMod: false,
      isServerMod: false,
      isHcMod: true,
      bikeyStatus: "unsigned",
      bikeyLabel: "未签名",
      bikeyHint: "缺少 .bisign/.bikey 签名文件",
      scanOrder: 3,
      updatedTime: "2026-10-20 10:00",
      updateStatus: "up_to_date",
    },
  ];
}

function makeEnvelope<T>(data: T, success = true, error: string | null = null) {
  return {
    success,
    data,
    error,
    requestId: `req-${Math.random().toString(36).slice(2, 10)}`,
  };
}

function buildDefaultConfig(server: MockServerEntry, mods: MockModRow[], autoCopyBikey = true) {
  const clientModIds = mods.filter((m) => m.isClientMod && m.workshopId > 0).map((m) => m.workshopId);
  const serverModIds = mods.filter((m) => m.isServerMod && m.workshopId > 0).map((m) => m.workshopId);
  const hcModIds = mods.filter((m) => m.isHcMod && m.workshopId > 0).map((m) => m.workshopId);
  const enabledIds = Array.from(new Set([...clientModIds, ...serverModIds, ...hcModIds]));
  return {
    formatVersion: 2,
    server: {
      configName: server.configName,
      serverDir: server.serverDir,
      executable: "arma3server_x64.exe",
      x64: true,
    },
    basic: {
      hostname: `${server.configName} Host`,
      maxPlayers: 64,
      password: "",
      passwordAdmin: "admin123",
      persistent: true,
      skipLobby: false,
      drawingInMap: true,
      statisticsEnabled: false,
      forceRotorLibSimulation: "0",
      battlEye: true,
      motd: "Welcome to Arma 3",
      motdInterval: 10,
      disableVoN: false,
      vonCodecQuality: 10,
      vonCodec: "OPUS",
      enableHeadlessClient: false,
      headlessClients: "127.0.0.1",
      localClient: "127.0.0.1",
      voteThreshold: 0.33,
      votingTimeout: 30,
      roleTimeout: 90,
      briefingTimeout: 60,
      debriefingTimeout: 45,
      lobbyIdleTimeout: 300,
      voteMissionPlayers: 1,
      pidFile: "",
      rankingFile: "",
      serverCfgArgs: "",
      basicCfgArgs: "",
      profileArgs: "",
    },
    startup: {
      port: 2302,
      autoInit: false,
      parameters: "",
      cpuCount: 4,
      maxMem: 4096,
      limitFps: 50,
      viewDistance: 2500,
      restartOnCrash: false,
      startArgs: "",
    },
    performance: {
      maxMsgSend: 128,
      maxSizeGuaranteed: 512,
      maxSizeNonguaranteed: 256,
      minBandwidth: 131072,
      maxBandwidth: 104857600,
      minErrorToSend: 0.001,
      minErrorToSendNear: 0.01,
      maxCustomFileSize: 0,
    },
    network: {
      upnp: false,
      verifySignatures: 2,
      allowedFilePatching: 0,
      kickDuplicate: true,
      loopback: false,
      disconnectTimeout: 90,
      maxDesync: 150,
      maxPing: 300,
      maxPacketLoss: 50,
    },
    difficulty: {
      difficultyPreset: "Regular",
      reducedDamage: false,
      groupIndicators: 0,
      friendlyTags: 0,
      enemyTags: 0,
      detectedMines: 0,
      commands: 1,
      waypoints: 1,
      weaponInfo: 2,
      stanceIndicator: 2,
      staminaBar: false,
      weaponCrosshair: false,
      visionAid: false,
      thirdPersonView: 1,
      cameraShake: true,
      scoreTable: true,
      deathMessages: true,
      vonID: true,
      mapContent: false,
      autoReport: false,
      multipleSaves: false,
    },
    battleye: {
      rconPort: 2306,
      rconPassword: "rcon_secret_password",
      maxPing: 300,
    },
    log: {
      timeStampFormat: "short",
      logFile: "server_console.log",
      skipDescription: false,
    },
    mods: {
      clientModIds,
      serverModIds,
      hcModIds,
      enabledIds,
      autoCopyBikey,
      localMods: [],
      roleEntries: [],
    },
    tasks: {
      missions: [{ template: "MP_Bootcamp_01.Altis", difficulty: 1, whiteList: false, choose: false }],
      forcedDifficulty: "none",
      autoSelectMission: false,
      randomMissionOrder: false,
    },
    scheduler: {
      cronJobs: {},
    },
    monitoring: {
      enabled: true,
    },
  };
}

export async function installMockApi(
  page: Page,
  options: MockApiOptions = {}
): Promise<MockApiHandle> {
  const requests: MockRecordedRequest[] = [];
  let servers: MockServerEntry[] = options.servers
    ? options.servers.map((s) => ({ ...s }))
    : [{ uuid: "srv-e2e-1", configName: "E2E Mock Server", serverDir: "C:\\arma3" }];

  let running = options.isRunning ?? false;
  let cfgStale = options.cfgStale ?? false;
  let cfgWritten = options.cfgWritten ?? !cfgStale;
  let logsReadErrorStatus = options.logsReadErrorStatus;
  const autoCopyBikey = options.autoCopyBikey ?? true;

  let currentMods: MockModRow[] = options.mods
    ? options.mods.map((m) => ({ ...m }))
    : createDefaultMockMods();

  const configsByUuid = new Map<string, Record<string, unknown>>();
  for (const s of servers) {
    const config = buildDefaultConfig(s, currentMods, autoCopyBikey);
    if (options.missions) config.tasks.missions = options.missions.map((m) => ({ template: m.template, difficulty: Number(m.difficulty ?? 3), whiteList: !!m.whiteList, choose: !!m.choose }));
    configsByUuid.set(s.uuid, config);
  }

  let uiSettings = {
    showAdvancedSettings: options.showAdvancedSettings ?? true,
    allowExternalConfigRefresh: false,
    hasShownTrayMinimizeHint: false,
    autoSnapshotMode: "BeforeWrite",
    autoSnapshotAsync: true,
  };

  let steamCmdSettings = {
    username: "steam_tester",
    hasPassword: true,
    loginMode: "password",
    workshopRoot: "C:\\steamcmd\\workshop",
    serverInstallPath: "C:\\arma3",
    steamCmdDir: "C:\\steamcmd",
    workshopModCount: currentMods.length,
  };

  const snapshots: Array<{ id: string; label: string; timestamp: string; files: string[] }> = [
    {
      id: "snap-1",
      label: "初始快照",
      timestamp: "2026-11-18T10:00:00Z",
      files: ["server.cfg", "basic.cfg"],
    },
  ];

  const bans: Array<{ guid: string; time: string; reason: string }> = [
    { guid: "76561198000000001", time: "perm", reason: "Mock Ban" },
  ];

  const currentPlayers: Array<{ num: number; guid: string; name: string }> = [];

  const asyncPollsByTaskId = new Map<string, { polls: number; action: string }>();
  let taskCounter = 0;

  const fulfillJson = async (route: Route, body: unknown, status = 200) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  };

  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const method = req.method();
    const urlObj = new URL(req.url());
    const pathname = urlObj.pathname;
    const query = urlObj.search;

    let parsedBody: unknown = undefined;
    const postData = req.postData();
    if (postData) {
      const contentType = req.headers()["content-type"] ?? "";
      if (contentType.includes("application/json")) {
        try {
          parsedBody = JSON.parse(postData);
        } catch {
          parsedBody = postData;
        }
      } else {
        parsedBody = postData;
      }
    }

    requests.push({ method, path: pathname, query, body: parsedBody });

    // SSE stream (keepalive empty 200 response)
    if (pathname === "/api/v1/steamcmd/stream") {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "event: ping\ndata: ok\n\n",
      });
      return;
    }

    // 1. Health (flat object, unwrapped)
    if (method === "GET" && pathname === "/api/v1/health") {
      await fulfillJson(route, {
        success: true,
        service: "Arma3ServerTools.Service",
        version: "2.0.0",
        remoteAccessEnabled: false,
        authConfigured: false,
        bindHost: "127.0.0.1",
        bindPort: 19580,
        publicBaseUrl: "http://127.0.0.1:19580",
        platform: "win32",
        defaultServerExecutable: "arma3server_x64.exe",
        defaultServerDir: "C:\\arma3",
        steamCmdBinary: "steamcmd.exe",
      });
      return;
    }

    // 2. Servers list (bare array, unwrapped)
    if (method === "GET" && pathname === "/api/v1/servers") {
      await fulfillJson(route, servers);
      return;
    }

    // Create server
    if (method === "POST" && pathname === "/api/v1/servers") {
      const body = (parsedBody ?? {}) as { configName?: string; serverDir?: string };
      const uuid = `srv-e2e-${servers.length + 1}`;
      const newEntry: MockServerEntry = {
        uuid,
        configName: body.configName || "新服务器",
        serverDir: body.serverDir || "C:\\arma3",
      };
      servers.push(newEntry);
      configsByUuid.set(uuid, buildDefaultConfig(newEntry, currentMods, autoCopyBikey));
      await fulfillJson(route, makeEnvelope({ uuid }), 201);
      return;
    }

    // UI Settings
    if (pathname === "/api/v1/settings/ui") {
      if (method === "GET") {
        await fulfillJson(route, makeEnvelope(uiSettings));
        return;
      }
      if (method === "PUT") {
        uiSettings = { ...uiSettings, ...((parsedBody ?? {}) as typeof uiSettings) };
        await fulfillJson(route, makeEnvelope(uiSettings));
        return;
      }
    }

    // SteamCMD status / settings / stop
    if (method === "GET" && pathname === "/api/v1/steamcmd/status") {
      await fulfillJson(
        route,
        makeEnvelope({
          isRunning: false,
          isBusy: false,
          isInstalled: options.steamCmdInstalled ?? true,
          isAborted: false,
          loginMode: steamCmdSettings.loginMode,
          authState: "ready",
          hasCredentials: true,
        })
      );
      return;
    }

    if (pathname === "/api/v1/settings/steamcmd") {
      if (method === "GET") {
        await fulfillJson(route, makeEnvelope(steamCmdSettings));
        return;
      }
      if (method === "PUT") {
        const body = (parsedBody ?? {}) as Record<string, string>;
        steamCmdSettings = {
          ...steamCmdSettings,
          username: body.username ?? steamCmdSettings.username,
          hasPassword: Boolean(body.password) || steamCmdSettings.hasPassword,
          loginMode: body.loginMode ?? steamCmdSettings.loginMode,
          workshopRoot: body.workshopRoot ?? steamCmdSettings.workshopRoot,
          serverInstallPath: body.serverInstallPath ?? steamCmdSettings.serverInstallPath,
        };
        await fulfillJson(route, makeEnvelope(steamCmdSettings));
        return;
      }
    }

    if (method === "PUT" && pathname === "/api/v1/steamcmd/credentials") {
      const body = (parsedBody ?? {}) as { username?: string; password?: string; loginMode?: string };
      steamCmdSettings = {
        ...steamCmdSettings,
        username: body.username ?? steamCmdSettings.username,
        hasPassword: Boolean(body.password) || steamCmdSettings.hasPassword,
        loginMode: body.loginMode ?? steamCmdSettings.loginMode,
      };
      await fulfillJson(route, makeEnvelope({ message: "凭据已保存" }));
      return;
    }

    if (method === "POST" && pathname === "/api/v1/steamcmd/stop") {
      await fulfillJson(route, makeEnvelope({ message: "已停止", cancelledTaskIds: [] }));
      return;
    }

    if (pathname === "/api/v1/settings/mod-scan-paths") {
      if (method === "GET") {
        await fulfillJson(
          route,
          makeEnvelope({ paths: [{ modulePath: "C:\\arma3\\mods", remark: "默认工坊" }] })
        );
        return;
      }
      if (method === "PUT") {
        const body = (parsedBody ?? {}) as { paths?: unknown[] };
        await fulfillJson(route, makeEnvelope({ paths: body.paths ?? [], message: "已保存" }));
        return;
      }
    }

    if (method === "POST" && pathname === "/api/v1/mods/validate-path") {
      await fulfillJson(route, makeEnvelope({ valid: true }));
      return;
    }

    if (method === "POST" && pathname === "/api/v1/workshop/mod-details") {
      const body = (parsedBody ?? {}) as { modIds?: number[] };
      const ids = body.modIds ?? [];
      const modInfos = ids.map((modId) => {
        const found = currentMods.find((m) => m.workshopId === modId);
        return {
          modId,
          title: found?.name ?? `Workshop-${modId}`,
          description: "Workshop mod details",
          fileSizeMb: "256",
          selected: true,
          timeUpdatedLabel: "2026-11-18 12:00",
          localUpdatedLabel: found?.updatedTime ?? "2026-10-01 10:00",
          updateStatus: found?.updateStatus ?? "up_to_date",
          source: "api",
        };
      });
      await fulfillJson(route, makeEnvelope({ mods: modInfos }));
      return;
    }

    if (method === "POST" && pathname === "/api/v1/monitoring/collect") {
      await fulfillJson(route, makeEnvelope({ collected: 1 }));
      return;
    }

    // Tasks: singular POST /api/v1/task, plural GET/DELETE /api/v1/tasks/:taskId
    if (method === "POST" && pathname === "/api/v1/task") {
      const body = (parsedBody ?? {}) as {
        serverUuid?: string;
        async?: boolean;
        commands?: Array<{ action: string; modIds?: number[]; modPaths?: string[]; playerGuid?: string; reason?: string }>
      };
      const firstAction = body.commands?.[0]?.action ?? "unknown";

      if (firstAction === "write_cfg" && options.writeCfgFail) {
        await fulfillJson(route, makeEnvelope(null, false, "写入游戏配置失败: 磁盘只读"), 500);
        return;
      }

      if (firstAction === "write_cfg") {
        cfgStale = false;
        cfgWritten = true;
      } else if (firstAction === "start" || firstAction === "restart") {
        running = true;
      } else if (firstAction === "stop") {
        running = false;
      } else if (firstAction === "copy_bikeys") {
        currentMods = currentMods.map((m) =>
          (m.bikeyStatus === "not_copied" || m.bikeyStatus === "key_mismatch") && body.commands?.[0]?.modPaths?.includes(m.path)
            ? { ...m, bikeyStatus: "ready", bikeyLabel: "文件检查就绪", signatureEvidence: m.signatureEvidence ? { ...m.signatureEvidence, canDeployKeys: false } : undefined }
            : m
        );
      } else if (firstAction === "local_ban_add" && body.commands?.[0]?.playerGuid) {
        bans.push({
          guid: body.commands[0].playerGuid,
          time: "perm",
          reason: body.commands[0].reason ?? "手动封禁",
        });
      }

      if (body.async) {
        taskCounter += 1;
        const taskId = `task-mock-${taskCounter}`;
        asyncPollsByTaskId.set(taskId, { polls: 0, action: firstAction });
        await fulfillJson(route, makeEnvelope({ taskId, status: "Running" }));
        return;
      }

      await fulfillJson(
        route,
        makeEnvelope({
          success: true,
          steps: [{ action: firstAction, success: true, message: `${firstAction} 完成` }],
        })
      );
      return;
    }

    const taskMatch = pathname.match(/^\/api\/v1\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      const tracker = asyncPollsByTaskId.get(taskId);
      if (method === "DELETE") {
        if (tracker) {
          tracker.polls = 999;
        }
        await fulfillJson(route, makeEnvelope({ message: "已取消", status: "Cancelled" }));
        return;
      }
      if (method === "GET") {
        const pollsNeeded = options.asyncPollsBeforeComplete ?? 2;
        const nextPoll = (tracker?.polls ?? 0) + 1;
        if (tracker) {
          tracker.polls = nextPoll;
        }

        if (nextPoll <= pollsNeeded) {
          await fulfillJson(
            route,
            makeEnvelope({
              taskId,
              status: "Running",
              serverUuid: servers[0]?.uuid ?? "srv-e2e-1",
              steps: [],
              createdAt: "2026-11-18T12:00:00Z",
            })
          );
          return;
        }

        const finalStatus = options.asyncFinalStatus ?? "Succeeded";
        if (finalStatus === "Succeeded" && tracker?.action === "download_mods") {
          currentMods = currentMods.map((m) =>
            m.updateStatus === "outdated" ? { ...m, updateStatus: "up_to_date" } : m
          );
        }
        await fulfillJson(
          route,
          makeEnvelope({
            taskId,
            status: finalStatus,
            serverUuid: servers[0]?.uuid ?? "srv-e2e-1",
            error: finalStatus === "Failed" ? (options.asyncErrorText ?? "Steam timeout") : undefined,
            steps: [
              {
                action: tracker?.action ?? "download_mods",
                success: finalStatus === "Succeeded",
                message:
                  finalStatus === "Succeeded"
                    ? "后台任务完成"
                    : finalStatus === "Cancelled"
                      ? "任务已取消"
                      : (options.asyncErrorText ?? "Steam timeout"),
              },
            ],
            createdAt: "2026-11-18T12:00:00Z",
            completedAt: "2026-11-18T12:00:05Z",
          })
        );
        return;
      }
    }

    // Server-scoped routes: /api/v1/servers/:uuid/...
    const srvMatch = pathname.match(/^\/api\/v1\/servers\/([^/]+)(\/.*)?$/);
    if (srvMatch) {
      const uuid = decodeURIComponent(srvMatch[1]);
      const sub = srvMatch[2] ?? "";
      const srv = servers.find((s) => s.uuid === uuid) ?? servers[0];

      // Delete / Clone server
      if (method === "DELETE" && sub === "") {
        servers = servers.filter((s) => s.uuid !== uuid);
        configsByUuid.delete(uuid);
        await fulfillJson(route, makeEnvelope({ message: "已删除" }));
        return;
      }

      if (method === "POST" && sub === "/clone") {
        const cloneUuid = `srv-e2e-${servers.length + 1}`;
        const cloneEntry: MockServerEntry = {
          uuid: cloneUuid,
          configName: `${srv?.configName ?? "Server"} (Copy)`,
          serverDir: srv?.serverDir ?? "C:\\arma3",
        };
        servers.push(cloneEntry);
        configsByUuid.set(cloneUuid, buildDefaultConfig(cloneEntry, currentMods, autoCopyBikey));
        await fulfillJson(route, makeEnvelope({ uuid: cloneUuid }), 201);
        return;
      }

      // Bare object: /status
      if (method === "GET" && sub === "/status") {
        await fulfillJson(route, {
          isRunning: running,
          pid: running ? 4242 : undefined,
          activeMissionTemplate: "MP_Bootcamp_01.Altis",
          serverModCount: currentMods.filter((m) => m.enabled).length,
        });
        return;
      }

      if (method === "PUT" && sub === "/rename") {
        const body = (parsedBody ?? {}) as { newName?: string };
        const newName = (body.newName ?? "").trim();
        if (!newName) {
          await fulfillJson(route, makeEnvelope(null, false, "服务器名称不能为空"), 400);
          return;
        }
        servers = servers.map((s) => (s.uuid === uuid ? { ...s, configName: newName } : s));
        const cfg = configsByUuid.get(uuid) as { server?: Record<string, unknown> } | undefined;
        if (cfg?.server) {
          cfg.server.configName = newName;
        }
        await fulfillJson(route, makeEnvelope({ message: "已重命名" }));
        return;
      }

      if (method === "GET" && sub === "/sync-state") {
        await fulfillJson(
          route,
          makeEnvelope({
            lastModified: "2026-11-18T12:00:00Z",
            cfgWritten,
            cfgStale,
          })
        );
        return;
      }

      if (method === "GET" && sub === "/dashboard") {
        const cfg = (configsByUuid.get(uuid) ?? {}) as { basic?: { hostname?: string }; startup?: { port?: number } };
        const baseDashboard = {
          hostname: cfg.basic?.hostname ?? `${srv?.configName ?? "E2E"} Host`,
          port: cfg.startup?.port ?? 2302,
          isRunning: running,
          pid: running ? 4242 : undefined,
          onlineCount: options.emptyMonitoring ? 0 : 12,
          monitoring: options.emptyMonitoring
            ? { avgPlayers: 0, peakPlayers: 0, totalEntries: 0 }
            : { avgPlayers: 12.5, peakPlayers: 24, totalEntries: 10 },
          scheduleSummary: "无定时任务",
          latestRpt: "arma3server_x64_2026-11-18.rpt",
          cfgWritten,
        };
        await fulfillJson(
          route,
          makeEnvelope({
            ...baseDashboard,
            ...(options.dashboardOverrides ?? {}),
          })
        );
        return;
      }

      if (sub === "/config") {
        if (method === "GET") {
          const cfg = configsByUuid.get(uuid) ?? buildDefaultConfig(srv ?? { uuid, configName: "E2E", serverDir: "C:\\arma3" }, currentMods, autoCopyBikey);
          await fulfillJson(route, makeEnvelope(cfg));
          return;
        }
        if (method === "PATCH") {
          if (options.patchConfigErrorStatus && options.patchConfigErrorStatus >= 400) {
            await fulfillJson(
              route,
              makeEnvelope(null, false, options.patchConfigErrorMessage ?? "Invalid config"),
              options.patchConfigErrorStatus
            );
            return;
          }
          const existing = (configsByUuid.get(uuid) ?? {}) as Record<string, Record<string, unknown>>;
          const patch = (parsedBody ?? {}) as Record<string, Record<string, unknown>>;
          for (const [k, v] of Object.entries(patch)) {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              existing[k] = { ...(existing[k] ?? {}), ...v };
            } else {
              (existing as Record<string, unknown>)[k] = v;
            }
          }
          configsByUuid.set(uuid, existing);

          if (patch.mods) {
            const clientIds = new Set<number>((patch.mods.clientModIds as number[]) ?? []);
            const serverIds = new Set<number>((patch.mods.serverModIds as number[]) ?? []);
            const hcIds = new Set<number>((patch.mods.hcModIds as number[]) ?? []);
            const enabledIds = new Set<number>((patch.mods.enabledIds as number[]) ?? []);
            currentMods = currentMods.map((m) => ({
              ...m,
              isClientMod: clientIds.has(m.workshopId),
              isServerMod: serverIds.has(m.workshopId),
              isHcMod: hcIds.has(m.workshopId),
              enabled:
                enabledIds.has(m.workshopId) ||
                clientIds.has(m.workshopId) ||
                serverIds.has(m.workshopId) ||
                hcIds.has(m.workshopId),
            }));
            const existingIds = new Set(currentMods.map((m) => m.workshopId));
            const allPatchedIds = new Set([...clientIds, ...serverIds, ...hcIds, ...enabledIds]);
            for (const id of allPatchedIds) {
              if (id > 0 && !existingIds.has(id)) {
                currentMods.push({
                  workshopId: id,
                  name: `workshop_${id}`,
                  dirName: String(id),
                  path: `C:\\arma3\\mods\\${id}`,
                  enabled: true,
                  isClientMod: clientIds.has(id),
                  isServerMod: serverIds.has(id),
                  isHcMod: hcIds.has(id),
                  bikeyStatus: "ready",
                  bikeyLabel: "验证通过",
                  bikeyHint: "签名与密钥已就绪",
                  scanOrder: currentMods.length,
                  updatedTime: "2026-11-18 12:00",
                  updateStatus: "up_to_date",
                });
              }
            }
          }

          if (urlObj.searchParams.get("writeCfg") === "true") {
            cfgStale = false;
            cfgWritten = true;
          } else {
            cfgStale = true;
            cfgWritten = false;
          }
          await fulfillJson(route, makeEnvelope({ message: "配置已更新" }));
          return;
        }
      }

      if (method === "GET" && sub === "/mods") {
        await fulfillJson(route, makeEnvelope({
          mods: currentMods,
          scanPathCount: 1,
          bikeySummary: {
            enabled: 0, missingBikey: 0, ready: 0, notCopied: 0, noKey: 0,
            needsAttention: 0, unsigned: 0, partial: 0, keyMismatch: 0, readError: 0, unchecked: 0, allValid: false,
          },
        }));
        return;
      }

      if (method === "GET" && sub === "/mods/bikeys") {
        const enabled = currentMods.filter((m) => m.enabled).length;
        const ready = currentMods.filter((m) => m.bikeyStatus === "ready").length;
        const notCopied = currentMods.filter((m) => m.bikeyStatus === "not_copied").length;
        const noKey = currentMods.filter((m) => m.bikeyStatus === "no_key").length;
        const unsigned = currentMods.filter((m) => m.bikeyStatus === "unsigned").length;
        const missingBikey = notCopied + noKey + unsigned;
        await fulfillJson(
          route,
          makeEnvelope({
            enabled,
            missingBikey,
            ready,
            notCopied,
            noKey,
            needsAttention: missingBikey,
            unsigned,
            unchecked: 0,
            allValid: missingBikey === 0,
          })
        );
        return;
      }

      if (method === "GET" && sub === "/mods/bikeys/files") {
        await fulfillJson(
          route,
          makeEnvelope({
            keysDir: "C:\\arma3\\keys",
            files: [{ name: "cba_v3.bikey", size: 160, fullPath: "C:\\arma3\\keys\\cba_v3.bikey" }],
          })
        );
        return;
      }

      if (method === "POST" && sub === "/files/mod-list-html") {
        const html = typeof parsedBody === "string" ? parsedBody : "";
        const idMatches = Array.from(html.matchAll(/id=(\d+)/g)).map((m) => Number(m[1]));
        if (idMatches.length === 0) {
          await fulfillJson(route, makeEnvelope(null, false, "HTML 中未找到有效的 Workshop 模组 ID"), 400);
          return;
        }
        for (const id of idMatches) {
          const existing = currentMods.find((m) => m.workshopId === id);
          if (existing) {
            existing.enabled = true;
            existing.isClientMod = true;
          } else {
            currentMods.push({
              workshopId: id,
              name: `HTMLMod-${id}`,
              dirName: `@HTMLMod_${id}`,
              path: `C:\\arma3\\mods\\@HTMLMod_${id}`,
              enabled: true,
              isClientMod: true,
              isServerMod: false,
              isHcMod: false,
              bikeyStatus: "ready",
              bikeyLabel: "验证通过",
              scanOrder: currentMods.length,
              updatedTime: "2026-11-18 12:00",
              updateStatus: "up_to_date",
            });
          }
        }
        await fulfillJson(
          route,
          makeEnvelope({
            success: true,
            message: `已解析 ${idMatches.length} 个模组`,
            modCount: idMatches.length,
            mode: urlObj.searchParams.get("mode") ?? "enable",
            requiresSteamCmd: false,
          })
        );
        return;
      }

      if (method === "POST" && sub === "/files/mission-pbo") {
        await fulfillJson(
          route,
          makeEnvelope({
            template: "MP_Uploaded_Test.Altis",
            fullPath: "C:\\arma3\\mpmissions\\MP_Uploaded_Test.Altis.pbo",
            fileName: "MP_Uploaded_Test.Altis.pbo",
            sizeBytes: 2048,
            maxBytes: 104857600,
            overwritten: false,
            sharedServerWarning: false,
            note: "上传成功",
          })
        );
        return;
      }

      // Maintenance discovery/preview stay read-only in the mock harness: no SteamCMD login,
      // and the default tab-render specs must receive contract-shaped payloads.
      if (method === "GET" && sub === "/maintenance/updates") {
        await fulfillJson(route, makeEnvelope([]));
        return;
      }
      if (method === "POST" && sub === "/maintenance/check") {
        await fulfillJson(route, makeEnvelope([]));
        return;
      }
      if (method === "POST" && sub === "/maintenance/preview") {
        await fulfillJson(
          route,
          makeEnvelope({
            createdAt: new Date().toISOString(),
            selectedKeys: [],
            mods: [],
            impact: { resources: [], serverUuids: [], headlessUuids: [], issues: [], complete: true },
            instances: [],
            canExecute: false,
            reasons: ["未选择目标"],
            commonTime: null,
            thresholds: { checkSeconds: 600, sampleSeconds: 15, idleSeconds: 900, onlineFreshSeconds: 60, maxWaitHours: 48, countdownSeconds: [30, 15, 5] },
            warning: "Mock 预览不登录 Steam、不停服。",
          })
        );
        return;
      }

      if (method === "GET" && (sub === "/preflight" || sub === "/diagnostics")) {
        await fulfillJson(
          route,
          makeEnvelope({
            hasBlockingErrors: false,
            issues: [
              { category: "配置", severity: "ok", message: "server.cfg 校验通过" },
              { category: "签名", severity: "info", message: "Bikey 检查完成" },
            ],
          })
        );
        return;
      }

      if (sub === "/snapshots") {
        if (method === "GET") {
          await fulfillJson(route, makeEnvelope(snapshots));
          return;
        }
        if (method === "POST") {
          const body = (parsedBody ?? {}) as { label?: string };
          const entry = {
            id: `snap-${snapshots.length + 1}`,
            label: body.label || "手动快照",
            timestamp: "2026-11-18T12:15:00Z",
            files: ["server.cfg", "basic.cfg"],
          };
          snapshots.unshift(entry);
          await fulfillJson(route, makeEnvelope(entry));
          return;
        }
      }

      if (method === "POST" && /^\/snapshots\/[^/]+\/restore$/.test(sub)) {
        await fulfillJson(route, makeEnvelope({ message: "快照已恢复" }));
        return;
      }

      if (method === "GET" && sub === "/monitoring/summary") {
        await fulfillJson(
          route,
          makeEnvelope(
            options.emptyMonitoring
              ? { avgPlayers: 0, peakPlayers: 0, totalEntries: 0 }
              : { avgPlayers: 14.2, peakPlayers: 32, totalEntries: 4 }
          )
        );
        return;
      }

      if (method === "GET" && sub === "/monitoring/stats") {
        await fulfillJson(
          route,
          makeEnvelope({
            stats: options.emptyMonitoring
              ? []
              : [
                  { serverUuid: uuid, playerCount: 10, timestamp: "2026-11-18T10:00:00Z", serverFps: 48 },
                  { serverUuid: uuid, playerCount: 32, timestamp: "2026-11-18T11:00:00Z", serverFps: 44 },
                ],
          })
        );
        return;
      }

      if (method === "GET" && sub === "/monitoring/players") {
        await fulfillJson(
          route,
          makeEnvelope({
            players: options.emptyMonitoring
              ? []
              : [{ playerGuid: "abc123def456", playerName: "AlphaOne", serverUuid: uuid, lastSeen: "2026-11-18T11:30:00Z" }],
          })
        );
        return;
      }

      if (method === "POST" && sub === "/monitoring/sync-players") {
        await fulfillJson(route, makeEnvelope({ synced: 1 }));
        return;
      }

      if (method === "GET" && sub === "/monitoring/export/csv") {
        await fulfillJson(route, makeEnvelope({ csv: "timestamp,playerCount,serverFps\n2026-11-18T10:00:00Z,10,48\n" }));
        return;
      }

      if (method === "GET" && sub === "/monitoring/export/html") {
        await fulfillJson(route, makeEnvelope({ html: "<html><body><h1>Report</h1></body></html>" }));
        return;
      }

      if (method === "GET" && sub === "/logs") {
        if (logsReadErrorStatus) {
          await fulfillJson(route, makeEnvelope(null, false, "日志读取失败"), logsReadErrorStatus);
          return;
        }
        await fulfillJson(
          route,
          makeEnvelope({
            kind: urlObj.searchParams.get("kind") ?? "console",
            serverDir: "C:\\arma3",
            files: options.emptyLogs
              ? []
              : [
                  {
                    fileName: "console_1.log",
                    filePath: "C:\\arma3\\logs\\console_1.log",
                    size: 1024,
                    lastModified: "2026-11-18T11:00:00Z",
                    kind: "console",
                  },
                ],
          })
        );
        return;
      }

      if (method === "GET" && sub === "/logs/read") {
        if (logsReadErrorStatus) {
          await fulfillJson(route, makeEnvelope(null, false, "日志读取失败"), logsReadErrorStatus);
          return;
        }
        await fulfillJson(
          route,
          makeEnvelope({
            lines: options.emptyLogs ? [] : ["[11:00:00] Server started", "[11:00:05] Mission loaded"],
            totalLines: options.emptyLogs ? 0 : 2,
            fileName: "console_1.log",
            filePath: "C:\\arma3\\logs\\console_1.log",
          })
        );
        return;
      }

      if (sub === "/bans") {
        if (method === "GET") {
          await fulfillJson(route, makeEnvelope(bans));
          return;
        }
        if (method === "PUT") {
          await fulfillJson(route, makeEnvelope({ message: "已保存", count: bans.length }));
          return;
        }
      }

      if (method === "GET" && sub === "/rcon/players") {
        await fulfillJson(route, makeEnvelope({ players: currentPlayers, count: currentPlayers.length }));
        return;
      }

      if (method === "GET" && sub === "/missions/scan") {
        await fulfillJson(
          route,
          makeEnvelope({
            scanned: 1,
            missions: [{ template: "MP_Bootcamp_01.Altis", difficulty: 1, whiteList: false, choose: false }],
          })
        );
        return;
      }

      if (method === "GET" && sub === "/paths") {
        await fulfillJson(
          route,
          makeEnvelope({
            serverDir: srv?.serverDir ?? "C:\\arma3",
            toolConfigDir: "C:\\a3st\\data",
            serverConfigDir: "C:\\arma3\\cfg",
            logDir: "C:\\arma3\\logs",
          })
        );
        return;
      }
    }

    // Fallback safe envelope
    await fulfillJson(route, makeEnvelope({}));
  });

  return {
    requests,
    setRunning: (val: boolean) => {
      running = val;
    },
    setCfgStale: (val: boolean) => {
      cfgStale = val;
      cfgWritten = !val;
    },
    setMods: (mods: MockModRow[]) => {
      currentMods = mods.map((m) => ({ ...m }));
    },
    setLogsReadErrorStatus: (status?: number) => {
      logsReadErrorStatus = status;
    },
    getRequests: (method: string, pathSubstring: string) =>
      requests.filter((r) => r.method === method && r.path.includes(pathSubstring)),
  };
}

export async function connectMockedConsole(
  page: Page,
  options: MockApiOptions = {}
): Promise<MockApiHandle> {
  const mock = await installMockApi(page, options);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await connectConsole(page);
  await waitForConsoleSettled(page);
  return mock;
}
