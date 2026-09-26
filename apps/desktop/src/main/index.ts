import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, shell, nativeTheme } from "electron";
import { execFileSync, spawn, type ChildProcess } from "child_process";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

export interface ServiceSettings {
  port: number;
  host: string;
  apiToken: string;
  remoteAccessEnabled: boolean;
}

const DEFAULT_SETTINGS: ServiceSettings = {
  port: 19580,
  host: "127.0.0.1",
  apiToken: "",
  remoteAccessEnabled: false,
};

let serviceProcess: ChildProcess | null = null;
let serviceLogFd: number | null = null;
let serviceExited = false;
let serviceGeneration = 0;
let preferFileUi = false;
/** PID of a service we reused (orphan) rather than spawned in this process. */
let adoptedServicePid: number | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

type ServiceProbe = "down" | "ui" | "api-only";

function settingsPath(): string {
  return path.join(app.getPath("userData"), "service-settings.json");
}

function dataDir(): string {
  return path.join(app.getPath("userData"), "a3st-data");
}

function loadSettings(): ServiceSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<ServiceSettings>;
    return {
      port: parsed.port ?? DEFAULT_SETTINGS.port,
      host: parsed.host ?? DEFAULT_SETTINGS.host,
      apiToken: parsed.apiToken ?? DEFAULT_SETTINGS.apiToken,
      remoteAccessEnabled: parsed.remoteAccessEnabled ?? DEFAULT_SETTINGS.remoteAccessEnabled,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: ServiceSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf-8");
}

function repoRoot(): string {
  if (isDev) {
    return path.resolve(app.getAppPath(), "..", "..");
  }
  return path.dirname(app.getPath("exe"));
}

function getServiceRoot(): string {
  if (isDev) {
    return path.join(repoRoot(), "packages", "service");
  }
  return path.join(process.resourcesPath, "service");
}

function getServiceEntryPath(): string {
  return path.join(getServiceRoot(), "dist", "index.js");
}

function getWebIndexPath(): string {
  if (isDev) {
    return path.join(repoRoot(), "packages", "web", "dist", "index.html");
  }
  return path.join(process.resourcesPath, "web", "index.html");
}

function getPackagedWebRoot(): string {
  return path.join(process.resourcesPath, "web");
}

function probeService(port: number): Promise<ServiceProbe> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ServiceProbe) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const req = http.get(`http://127.0.0.1:${port}/api/v1/health`, (res) => {
      res.resume();
      if (res.statusCode !== 200) {
        finish("down");
        return;
      }
      const pageReq = http.get(`http://127.0.0.1:${port}/`, (pageRes) => {
        pageRes.resume();
        const contentType = String(pageRes.headers["content-type"] ?? "");
        if (pageRes.statusCode === 200 && contentType.includes("text/html")) {
          finish("ui");
          return;
        }
        finish("api-only");
      });
      pageReq.on("error", () => {
        finish("api-only");
      });
      pageReq.setTimeout(1500, () => {
        pageReq.destroy();
        finish("api-only");
      });
    });
    req.on("error", () => {
      finish("down");
    });
    req.setTimeout(1500, () => {
      req.destroy();
      finish("down");
    });
  });
}

function findListenerPid(port: number): number | null {
  if (process.platform !== "win32") {
    try {
      const out = execFileSync("sh", ["-c", `lsof -t -iTCP:${port} -sTCP:LISTEN`], {
        encoding: "utf-8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pid = parseInt(out.trim().split(/\r?\n/)[0] ?? "", 10);
      if (Number.isFinite(pid) && pid > 0) {
        return pid;
      }
    } catch {
      return null;
    }
    return null;
  }

  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`,
      ],
      {
        encoding: "utf-8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    const pid = parseInt(out.trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
      return pid;
    }
  } catch {
    return null;
  }
  return null;
}

function killPidTree(pid: number): void {
  if (!pid || pid <= 0) {
    return;
  }
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch (err) {
      console.error(`taskkill ${pid} failed:`, err);
    }
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    console.error(`kill ${pid} failed:`, err);
  }
}

function adoptListenerIfPresent(port: number): void {
  const pid = findListenerPid(port);
  if (!pid || pid === process.pid) {
    return;
  }
  adoptedServicePid = pid;
  console.log(`Adopted existing listener on port ${port} as PID ${pid}`);
}

function freeServicePort(port: number): void {
  const pid = findListenerPid(port);
  if (!pid || pid === process.pid) {
    return;
  }
  console.log(`Freeing port ${port} by stopping PID ${pid}`);
  killPidTree(pid);
  if (adoptedServicePid === pid) {
    adoptedServicePid = null;
  }
}

function readServiceLogTail(): string {
  const logPath = path.join(dataDir(), "service.log");
  try {
    const raw = fs.readFileSync(logPath, "utf-8");
    const lines = raw.split(/\r?\n/);
    const start = Math.max(0, lines.length - 25);
    return lines.slice(start).join("\n").trim();
  } catch {
    return "";
  }
}

async function waitForServiceReady(port: number, timeoutMs: number): Promise<ServiceProbe> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (serviceExited) {
      break;
    }
    const probe = await probeService(port);
    if (probe !== "down") {
      return probe;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return "down";
}

function getTrayIconPath(): string {
  if (isDev) {
    return path.join(repoRoot(), "apps", "desktop", "build", "icon.ico");
  }
  return path.join(process.resourcesPath, "assets", "icon.ico");
}

function getPreloadPath(): string {
  // Prefer sibling of main.js (works in asar and asar.unpacked).
  const candidates = [
    path.join(MAIN_DIR, "preload.cjs"),
    path.join(MAIN_DIR, "preload.js"),
    path.join(app.getAppPath(), "dist-electron", "preload.cjs"),
    path.join(app.getAppPath(), "dist-electron", "preload.js"),
  ];
  for (const candidate of candidates) {
    const unpacked = candidate.includes("app.asar")
      ? candidate.replace("app.asar", "app.asar.unpacked")
      : candidate;
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  console.error("Preload script not found. Tried:", candidates.join(" | "));
  return candidates[0];
}

function buildServiceSpawnOptions(entry: string): {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const settings = loadSettings();
  const host = settings.remoteAccessEnabled ? "0.0.0.0" : settings.host;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(settings.port),
    HOST: host,
    DATA_DIR: dir,
    API_TOKEN: settings.apiToken,
  };
  if (!isDev) {
    baseEnv.WEB_ROOT = getPackagedWebRoot();
  }

  if (isDev) {
    return {
      executable: "node",
      args: [entry],
      cwd: getServiceRoot(),
      env: baseEnv,
    };
  }

  return {
    executable: process.execPath,
    args: [entry],
    cwd: getServiceRoot(),
    env: {
      ...baseEnv,
      ELECTRON_RUN_AS_NODE: "1",
    },
  };
}

function startService(): boolean {
  stopService();
  const settings = loadSettings();
  freeServicePort(settings.port);
  serviceGeneration += 1;
  const generation = serviceGeneration;
  serviceExited = false;

  const entry = getServiceEntryPath();
  if (!fs.existsSync(entry)) {
    console.warn(`Node service entry not found: ${entry}`);
    serviceExited = true;
    dialog.showErrorBox(
      "服务未找到",
      `未找到 TypeScript 被控服务。\n\n请先执行：\nnpm run build:service\n\n路径：${entry}`
    );
    return false;
  }

  const spawnOptions = buildServiceSpawnOptions(entry);
  console.log(`Starting Node service: ${spawnOptions.executable} ${spawnOptions.args.join(" ")}`);

  const logPath = path.join(dataDir(), "service.log");
  serviceLogFd = fs.openSync(logPath, "a");

  const child = spawn(spawnOptions.executable, spawnOptions.args, {
    cwd: spawnOptions.cwd,
    env: spawnOptions.env,
    stdio: ["ignore", serviceLogFd, serviceLogFd],
    windowsHide: true,
  });
  serviceProcess = child;

  child.on("exit", (code) => {
    console.log(`Node service exited with code ${code}`);
    if (generation !== serviceGeneration) {
      return;
    }
    if (serviceProcess === child) {
      serviceProcess = null;
    }
    serviceExited = true;
  });

  child.on("error", (err) => {
    console.error("Node service process error:", err);
    if (generation !== serviceGeneration) {
      return;
    }
    if (serviceProcess === child) {
      serviceProcess = null;
    }
    serviceExited = true;
  });
  return true;
}

function stopService(): void {
  if (serviceProcess && serviceProcess.pid && !serviceProcess.killed) {
    console.log("Stopping Node service...");
    const pid = serviceProcess.pid;
    killPidTree(pid);
    serviceProcess = null;
  }
  if (adoptedServicePid) {
    console.log(`Stopping adopted service PID ${adoptedServicePid}...`);
    killPidTree(adoptedServicePid);
    adoptedServicePid = null;
  }
  if (serviceLogFd !== null) {
    fs.closeSync(serviceLogFd);
    serviceLogFd = null;
  }
}

function getServiceStatus(): { running: boolean; pid?: number } {
  if (serviceProcess && serviceProcess.pid && !serviceProcess.killed) {
    return { running: true, pid: serviceProcess.pid };
  }
  if (adoptedServicePid) {
    return { running: true, pid: adoptedServicePid };
  }
  return { running: false };
}

function themeBackgroundColor(): string {
  if (nativeTheme.shouldUseDarkColors) {
    return "#1e1e1e";
  }
  return "#ffffff";
}

function syncWindowTheme(): void {
  if (!mainWindow) {
    return;
  }
  mainWindow.setBackgroundColor(themeBackgroundColor());
  mainWindow.webContents.send("theme:changed", nativeTheme.shouldUseDarkColors);
}

function registerIpcHandlers(): void {
  ipcMain.handle("theme:shouldUseDarkColors", () => nativeTheme.shouldUseDarkColors);

  ipcMain.handle("service:status", () => getServiceStatus());

  ipcMain.handle("service:settings:get", () => loadSettings());

  ipcMain.handle("service:settings:save", (_event, settings: ServiceSettings) => {
    const normalized: ServiceSettings = {
      port: settings.port ?? DEFAULT_SETTINGS.port,
      host: settings.host ?? DEFAULT_SETTINGS.host,
      apiToken: settings.apiToken ?? "",
      remoteAccessEnabled: !!settings.remoteAccessEnabled,
    };
    saveSettings(normalized);
  });

  ipcMain.handle("service:restart", async () => {
    const started = startService();
    if (!started) {
      preferFileUi = true;
      return getServiceStatus();
    }
    const settings = loadSettings();
    serviceExited = false;
    const probe = await waitForServiceReady(settings.port, 30000);
    preferFileUi = probe !== "ui";
    return getServiceStatus();
  });

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:path", () => app.getAppPath());

  ipcMain.handle("shell:openPath", (_event, targetPath: string) => {
    return shell.openPath(targetPath);
  });

  ipcMain.handle("dialog:openFile", async (_event, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(options);
    return result;
  });

  ipcMain.handle("fs:readTextFile", (_event, filePath: string) => {
    return fs.readFileSync(filePath, "utf-8");
  });
}

function createWindow(): void {
  const preloadPath = getPreloadPath();
  console.log(`Using preload: ${preloadPath}`);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 780,
    minHeight: 500,
    title: "Arma3 Server Tools",
    backgroundColor: themeBackgroundColor(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // 去掉默认 File/Edit 菜单，避免「只有菜单栏+白屏」被误认为正常界面。
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on("preload-error", (_event, preloadScriptPath, error) => {
    console.error(`Preload failed (${preloadScriptPath}):`, error);
  });

  let loadFallbackTried = false;
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 || loadFallbackTried || !mainWindow) {
        return;
      }
      console.error(`UI did-fail-load code=${errorCode} url=${validatedURL}: ${errorDescription}`);
      loadFallbackTried = true;
      const indexPath = getWebIndexPath();
      if (fs.existsSync(indexPath)) {
        console.warn(`Falling back to file UI: ${indexPath}`);
        mainWindow.loadFile(indexPath).catch((err) => {
          console.error("Fallback file UI load failed:", err);
          dialog.showErrorBox(
            "界面加载失败",
            `无法加载控制台界面。\n\n错误: ${errorDescription}\n地址: ${validatedURL}\n\n请确认本机服务已启动，或查看 service.log。`
          );
          mainWindow?.show();
        });
        return;
      }
      dialog.showErrorBox(
        "界面加载失败",
        `无法加载控制台界面。\n\n错误: ${errorDescription}\n地址: ${validatedURL}`
      );
      mainWindow.show();
    }
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer gone:", details);
    dialog.showErrorBox(
      "界面进程已退出",
      `渲染进程异常（${details.reason}）。将尝试重新加载。`
    );
    if (mainWindow) {
      loadUiIntoWindow(mainWindow);
    }
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("show", () => {
    if (!mainWindow) {
      return;
    }
    const url = mainWindow.webContents.getURL();
    if (!url || url === "about:blank") {
      loadUiIntoWindow(mainWindow);
    }
  });

  mainWindow.on("close", (event) => {
    if (tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  loadUiIntoWindow(mainWindow);
}

/**
 * 安装包优先走本机 Service 静态页（http://127.0.0.1:port/）。
 * file:// 下部分动态 chunk / 路由切换易白屏；preload 在 http 回环仍可用。
 */
function loadUiIntoWindow(win: BrowserWindow): void {
  if (isDev) {
    win.loadURL("http://localhost:5173").catch((e) => {
      console.error("Failed to load dev server:", e);
      win.loadFile(getWebIndexPath()).catch((err) => {
        console.error("Failed to load packaged web index:", err);
      });
    });
    return;
  }

  const settings = loadSettings();
  const serviceUrl = `http://127.0.0.1:${settings.port}/`;
  if (preferFileUi) {
    const indexPath = getWebIndexPath();
    if (fs.existsSync(indexPath)) {
      console.warn(`Loading file UI because service page is not ready: ${indexPath}`);
      win.loadFile(indexPath).catch((err) => {
        console.error("file:// UI load failed:", err);
        dialog.showErrorBox(
          "界面加载失败",
          `无法打开控制台。\nService: ${serviceUrl}\nfile: ${indexPath}`
        );
        win.show();
      });
      return;
    }
  }
  console.log(`Loading UI from service: ${serviceUrl}`);
  win.loadURL(serviceUrl).catch((err) => {
    console.error("Service UI load failed:", err);
    const indexPath = getWebIndexPath();
    if (fs.existsSync(indexPath)) {
      win.loadFile(indexPath).catch((fileErr) => {
        console.error("file:// UI load failed:", fileErr);
        dialog.showErrorBox(
          "界面加载失败",
          `无法打开控制台。\nService: ${serviceUrl}\nfile: ${indexPath}`
        );
        win.show();
      });
      return;
    }
    dialog.showErrorBox(
      "界面文件缺失",
      `未找到控制台页面，且无法连接 ${serviceUrl}。\n日志：${path.join(dataDir(), "service.log")}`
    );
    win.show();
  });
}

function createTray(): void {
  const iconPath = getTrayIconPath();

  let icon: Electron.NativeImage;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Arma3 Server Tools");
  const contextMenu = Menu.buildFromTemplate([
    { label: "显示窗口", click: () => mainWindow?.show() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        stopService();
        tray?.destroy();
        tray = null;
        app.exit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => mainWindow?.show());
}

function checkInstallPath(): boolean {
  const exePath = app.getPath("exe");
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(exePath)) {
    dialog.showErrorBox(
      "安装路径错误",
      `安装路径包含中文字符，可能导致运行异常。\n\n当前路径：${exePath}\n\n请重新安装到不含中文的目录。`
    );
    return false;
  }
  return true;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (!checkInstallPath()) {
      app.quit();
      return;
    }

    // 隐藏应用默认菜单（File/Edit/...），避免白屏时看起来像「空壳菜单程序」。
    Menu.setApplicationMenu(null);

    registerIpcHandlers();
    nativeTheme.themeSource = "system";
    nativeTheme.on("updated", syncWindowTheme);
    const settings = loadSettings();
    let probe = await probeService(settings.port);
    if (probe === "down") {
      const started = startService();
      if (started) {
        probe = await waitForServiceReady(settings.port, 30000);
      }
    } else {
      adoptListenerIfPresent(settings.port);
      console.log(`Reusing service already listening on ${settings.port} (${probe})`);
    }
    preferFileUi = probe !== "ui";
    if (probe === "down") {
      const startedEntry = fs.existsSync(getServiceEntryPath());
      if (startedEntry) {
        const tail = readServiceLogTail();
        let detail = `本机被控服务未能响应 http://127.0.0.1:${settings.port}/api/v1/health。\n\n日志：${path.join(dataDir(), "service.log")}`;
        if (tail.length > 0) {
          detail = `${detail}\n\n${tail}`;
        }
        dialog.showErrorBox("服务未就绪", detail);
      }
    } else if (probe === "api-only") {
      dialog.showErrorBox(
        "控制台页面未就绪",
        `服务已在 http://127.0.0.1:${settings.port}/ 响应，但首页不是控制台页面（常见为 HTTP 404）。\n已改用本地界面。若日志中是端口被占用或拒绝访问，可在被控设置里更换端口后重启服务。\n\n日志：${path.join(dataDir(), "service.log")}`
      );
    }
    createWindow();
    createTray();
  });

  app.on("before-quit", () => {
    stopService();
  });

  app.on("window-all-closed", () => {
    // keep running in tray
  });

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}
